using Backend.Data;
using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TeamsController(AppDbContext db, AuthorizationService auth)
    : ApiControllerBase(auth)
{
    // GET api/teams
    [HttpGet]
    public async Task<IActionResult> GetMyTeams()
    {
        var userId = CurrentUserId;

        var teamIds = await db.TeamMembers.AsNoTracking()
            .Where(m => m.UserId == userId)
            .Select(m => m.TeamId)
            .ToListAsync();

        if (teamIds.Count == 0) return Ok(new List<Team>());

        var teams = await db.Teams.AsNoTracking()
            .Include(t => t.Members)
            .Where(t => teamIds.Contains(t.Id))
            .ToListAsync();

        return Ok(teams);
    }

    // GET api/teams/{id}
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetTeam(Guid id)
    {
        var team = await db.Teams.AsNoTracking()
            .Include(t => t.Members)
            .FirstOrDefaultAsync(t => t.Id == id);

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
        db.Teams.Add(team);

        var member = new TeamMember
        {
            TeamId      = team.Id,
            UserId      = CurrentUserId,
            DisplayName = req.DisplayName ?? "Team Lead",
            Role        = TeamRole.Admin,
        };
        db.TeamMembers.Add(member);

        // Single SaveChangesAsync — both inserts land in the same transaction (an
        // improvement over the original's two separate round-trips, which could leave a
        // team with no members if the process died between them).
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetTeam), new { id = team.Id }, team);
    }

    // POST api/teams/{id}/invite — returns a time-limited invite token
    [HttpPost("{id:guid}/invite")]
    public async Task<IActionResult> GenerateInvite(Guid id)
    {
        if (!await db.Teams.AsNoTracking().AnyAsync(t => t.Id == id)) return NotFound();

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

        if (!await db.Teams.AsNoTracking().AnyAsync(t => t.Id == teamId)) return NotFound();

        var alreadyMember = await db.TeamMembers.AsNoTracking()
            .AnyAsync(m => m.TeamId == teamId && m.UserId == CurrentUserId);

        if (alreadyMember)
            return Ok(new { message = "Already a member", teamId });

        var member = new TeamMember
        {
            TeamId      = teamId,
            UserId      = CurrentUserId,
            DisplayName = req.DisplayName ?? "Member",
            Role        = TeamRole.Member,
        };

        db.TeamMembers.Add(member);
        await db.SaveChangesAsync();
        return Ok(new { message = "Joined successfully", teamId });
    }

    // PATCH api/teams/{id}
    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> UpdateTeam(Guid id, [FromBody] UpdateTeamRequest req)
    {
        var team = await db.Teams.Include(t => t.Members).FirstOrDefaultAsync(t => t.Id == id);
        if (team is null) return NotFound();

        if (!await IsTeamAdminAsync(id)) return Forbid();

        if (req.Name       is not null) team.Name       = req.Name;
        if (req.SprintTerm is not null) team.SprintTerm = req.SprintTerm;

        await db.SaveChangesAsync();
        return Ok(team);
    }

    // DELETE api/teams/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteTeam(Guid id)
    {
        if (!await IsTeamAdminAsync(id)) return Forbid();

        // members, sprints and everything below them go with it (ON DELETE CASCADE) —
        // ExecuteDeleteAsync issues a plain SQL DELETE, so the DB-level cascade still
        // fires exactly as it would for any other delete of this row.
        var deleted = await db.Teams.Where(t => t.Id == id).ExecuteDeleteAsync();
        if (deleted == 0) return NotFound();

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

        // Bulk update rather than mutate-then-SaveChangesAsync — `target` came from
        // AuthorizationService.GetTeamMembersAsync, a separate query against the same
        // scoped AppDbContext, and this sidesteps relying on EF's identity resolution
        // to hand back that exact tracked instance. Same pattern as
        // RetroInviteController.GetInvite.
        target.Role = req.Role;
        await db.TeamMembers.Where(m => m.Id == target.Id)
            .ExecuteUpdateAsync(m => m.SetProperty(x => x.Role, req.Role));
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

        await db.TeamMembers.Where(m => m.Id == target.Id).ExecuteDeleteAsync();

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
