using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using static Postgrest.Constants;
using System.Security.Claims;

namespace Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TeamsController(SupabaseService sb) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")!);

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

        var memberResult = await sb.Db.From<TeamMember>()
            .Filter("team_id", Operator.Equals, id.ToString())
            .Filter("user_id", Operator.Equals, CurrentUserId.ToString())
            .Get();

        var member = memberResult.Models.FirstOrDefault();
        if (member?.Role != TeamRole.Admin) return Forbid();

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

        var member = team.Members.FirstOrDefault(m => m.UserId == CurrentUserId);
        if (member?.Role != TeamRole.Admin) return Forbid();

        if (req.Name      is not null) team.Name      = req.Name;
        if (req.SprintTerm is not null) team.SprintTerm = req.SprintTerm;

        await sb.Db.From<Team>().Update(team);
        return Ok(team);
    }
}

public record CreateTeamRequest(string Name, string? SprintTerm, string? DisplayName);
public record JoinTeamRequest(string InviteToken, string? DisplayName);
public record UpdateTeamRequest(string? Name, string? SprintTerm);
