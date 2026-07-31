using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Mvc;
using static Postgrest.Constants;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TeamsController(SupabaseService sb, AuthorizationService auth)
    : ApiControllerBase(auth)
{
    // GET api/teams
    [HttpGet]
    public async Task<IActionResult> GetMyTeams()
    {
        var userId = CurrentUserId;

        var memberships = await sb.Db.From<TeamMember>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Get();

        var teamIds = memberships.Models.Select(m => m.TeamId.ToString()).ToList();
        if (!teamIds.Any()) return Ok(new List<Team>());

        var teams = await sb.Db.From<Team>()
            .Select("*, team_members(*)")
            .Filter("id", Operator.In, teamIds)
            .Get();

        return Ok(teams.Models);
    }

    // GET api/teams/{id}
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetTeam(Guid id)
    {
        var result = await sb.Db.From<Team>()
            .Select("*, team_members(*)")
            .Filter("id", Operator.Equals, id.ToString())
            .Get();

        var team = result.Models.FirstOrDefault();
        if (team is null) return NotFound();

        if (!team.Members.Any(m => m.UserId == CurrentUserId))
            return Forbid();

        return Ok(team);
    }

    // POST api/teams
    [HttpPost]
    public async Task<IActionResult> CreateTeam([FromBody] CreateTeamRequest req)
    {
        var team = new Team
        {
            Name       = req.Name,
            SprintTerm = req.SprintTerm ?? "Sprint",
            CreatedBy  = CurrentUserId,
        };

        var inserted = await sb.Db.From<Team>().Insert(team);
        var created  = inserted.Models.First();

        var member = new TeamMember
        {
            TeamId      = created.Id,
            UserId      = CurrentUserId,
            DisplayName = req.DisplayName ?? "Team Lead",
            Role        = TeamRole.Admin,
        };

        await sb.Db.From<TeamMember>().Insert(member);

        return CreatedAtAction(nameof(GetTeam), new { id = created.Id }, created);
    }

    // POST api/teams/{id}/invite � returns a time-limited invite token
    [HttpPost("{id:guid}/invite")]
    public async Task<IActionResult> GenerateInvite(Guid id)
    {
        var teamResult = await sb.Db.From<Team>()
            .Filter("id", Operator.Equals, id.ToString())
            .Get();

        if (!teamResult.Models.Any()) return NotFound();

        if (!await IsTeamAdminAsync(id)) return Forbid();

        var payload = $"{id}|{DateTime.UtcNow.AddDays(7):O}";
        var token   = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(payload));
        return Ok(new { inviteToken = token });
    }

    // POST api/teams/join
    [HttpPost("join")]
    public async Task<IActionResult> JoinTeam([FromBody] JoinTeamRequest req)
    {
        string decoded;
        try { decoded = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(req.InviteToken)); }
        catch { return BadRequest("Invalid invite token"); }

        var parts = decoded.Split('|');
        if (parts.Length != 2 || !Guid.TryParse(parts[0], out var teamId))
            return BadRequest("Invalid invite token");

        if (!DateTime.TryParse(parts[1], out var expiry) || expiry < DateTime.UtcNow)
            return BadRequest("Invite token has expired");

        var teamResult = await sb.Db.From<Team>()
            .Filter("id", Operator.Equals, teamId.ToString())
            .Get();

        if (!teamResult.Models.Any()) return NotFound();

        var existing = await sb.Db.From<TeamMember>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Filter("user_id", Operator.Equals, CurrentUserId.ToString())
            .Get();

        if (existing.Models.Any())
            return Ok(new { message = "Already a member", teamId });

        var member = new TeamMember
        {
            TeamId      = teamId,
            UserId      = CurrentUserId,
            DisplayName = req.DisplayName ?? "Member",
            Role        = TeamRole.Member,
        };

        await sb.Db.From<TeamMember>().Insert(member);
        return Ok(new { message = "Joined successfully", teamId });
    }

    // PATCH api/teams/{id}
    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> UpdateTeam(Guid id, [FromBody] UpdateTeamRequest req)
    {
        var result = await sb.Db.From<Team>()
            .Select("*, team_members(*)")
            .Filter("id", Operator.Equals, id.ToString())
            .Get();

        var team = result.Models.FirstOrDefault();
        if (team is null) return NotFound();

        if (!await IsTeamAdminAsync(id)) return Forbid();

        if (req.Name      is not null) team.Name      = req.Name;
        if (req.SprintTerm is not null) team.SprintTerm = req.SprintTerm;

        await sb.Db.From<Team>().Update(team);
        return Ok(team);
    }

    // DELETE api/teams/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteTeam(Guid id)
    {
        if (!await IsTeamAdminAsync(id)) return Forbid();

        var team = (await sb.Db.From<Team>()
            .Filter("id", Operator.Equals, id.ToString())
            .Get()).Models.FirstOrDefault();

        if (team is null) return NotFound();

        // members, sprints and everything below them go with it (ON DELETE CASCADE)
        await sb.Db.From<Team>()
            .Filter("id", Operator.Equals, id.ToString())
            .Delete();

        return NoContent();
    }

    // PATCH api/teams/{id}/members/{userId} — promote to admin or demote to member
    [HttpPatch("{id:guid}/members/{userId:guid}")]
    public async Task<IActionResult> UpdateMemberRole(
        Guid id, Guid userId, [FromBody] UpdateMemberRoleRequest req)
    {
        if (!await IsTeamAdminAsync(id)) return Forbid();

        var members = await Auth.GetTeamMembersAsync(id);
        var target  = members.FirstOrDefault(m => m.UserId == userId);
        if (target is null) return NotFound();

        if (target.Role == req.Role) return Ok(target);

        if (req.Role == TeamRole.Member && IsLastAdmin(members, userId))
            return BadRequest("A team must keep at least one admin. Promote someone else first.");

        target.Role = req.Role;
        await sb.Db.From<TeamMember>().Update(target);
        return Ok(target);
    }

    // DELETE api/teams/{id}/members/{userId} — remove a member, or leave the team yourself
    [HttpDelete("{id:guid}/members/{userId:guid}")]
    public async Task<IActionResult> RemoveMember(Guid id, Guid userId)
    {
        var isSelf = userId == CurrentUserId;
        if (!isSelf && !await IsTeamAdminAsync(id)) return Forbid();

        var members = await Auth.GetTeamMembersAsync(id);
        var target  = members.FirstOrDefault(m => m.UserId == userId);
        if (target is null) return NotFound();

        if (IsLastAdmin(members, userId))
            return BadRequest(isSelf
                ? "You are the last admin of this team. Promote someone else before leaving."
                : "A team must keep at least one admin. Promote someone else first.");

        await sb.Db.From<TeamMember>()
            .Filter("id", Operator.Equals, target.Id.ToString())
            .Delete();

        return NoContent();
    }

    /// <summary>
    /// Guards the invariant that every team keeps at least one admin — otherwise the team
    /// becomes unmanageable: nobody can invite, rename, create sprints or delete it.
    /// </summary>
    private static bool IsLastAdmin(List<TeamMember> members, Guid userId) =>
        members.Any(m => m.UserId == userId && m.Role == TeamRole.Admin)
        && members.Count(m => m.Role == TeamRole.Admin) == 1;
}

public record CreateTeamRequest(string Name, string? SprintTerm, string? DisplayName);
public record JoinTeamRequest(string InviteToken, string? DisplayName);
public record UpdateTeamRequest(string? Name, string? SprintTerm);
public record UpdateMemberRoleRequest(TeamRole Role);
