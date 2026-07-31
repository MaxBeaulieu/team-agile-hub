using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Mvc;
using static Postgrest.Constants;

namespace Backend.Controllers;

/// <summary>
/// The identity + permissions payload the frontend builds its whole UI-gating layer on.
/// One request on dashboard mount instead of every component re-deriving roles from
/// whatever team object it happens to hold.
/// </summary>
[ApiController]
[Route("api/me")]
public class MeController(SupabaseService sb, AuthorizationService auth)
    : ApiControllerBase(auth)
{
    // GET api/me
    [HttpGet]
    public async Task<IActionResult> GetMe()
    {
        var memberships = await Auth.GetMembershipsAsync(CurrentUserId);

        var teamNames = new Dictionary<Guid, string>();
        if (memberships.Count > 0)
        {
            var teamIds = memberships.Select(m => m.TeamId.ToString()).Distinct().ToList();
            teamNames = (await sb.Db.From<Team>()
                .Filter("id", Operator.In, teamIds)
                .Get()).Models.ToDictionary(t => t.Id, t => t.Name);
        }

        var displayName = memberships
            .Select(m => m.DisplayName)
            .FirstOrDefault(n => !string.IsNullOrWhiteSpace(n));

        return Ok(new MeDto(
            CurrentUserId,
            CurrentUserEmail,
            displayName ?? CurrentUserEmail ?? "Unknown",
            await IsPlatformAdminAsync(),
            await HasRetroHistoryAsync(),
            memberships
                .Select(m => new MeTeamDto(
                    m.TeamId,
                    teamNames.GetValueOrDefault(m.TeamId, "Unknown"),
                    m.Role))
                .ToList()));
    }

    /// <summary>
    /// Has this person ever taken part in a retro? Someone with no team can still be
    /// pulled into one by invite link, and can run personal quick retros — so the retro
    /// section stays visible for them while the rest of the team-scoped nav does not.
    ///
    /// Every entry point (team retro, invite link, quick retro) funnels through
    /// RetroParticipantService.EnsureParticipantAsync, so a participant row is the
    /// reliable signal. Facilitated sessions are checked too, to cover a retro that was
    /// created but never opened.
    /// </summary>
    private async Task<bool> HasRetroHistoryAsync()
    {
        var userId = CurrentUserId.ToString();

        var joined = await sb.Db.From<RetroParticipant>()
            .Filter("user_id", Operator.Equals, userId)
            .Limit(1)
            .Get();
        if (joined.Models.Count > 0) return true;

        var facilitated = await sb.Db.From<RetroSession>()
            .Filter("facilitator_id", Operator.Equals, userId)
            .Limit(1)
            .Get();
        return facilitated.Models.Count > 0;
    }
}

public record MeDto(
    Guid UserId,
    string? Email,
    string DisplayName,
    bool IsPlatformAdmin,
    bool HasRetroHistory,
    List<MeTeamDto> Teams);

public record MeTeamDto(Guid TeamId, string Name, TeamRole Role);
