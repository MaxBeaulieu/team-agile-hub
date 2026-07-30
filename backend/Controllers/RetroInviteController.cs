using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using static Postgrest.Constants;
using System.Security.Cryptography;

namespace Backend.Controllers;

/// <summary>
/// Invite-link based joining for a retro session: host generates a permanent
/// shareable link. Signed-in users join silently under their real name;
/// anonymous guests pick a display name on the join screen.
/// EE-156.
/// </summary>
[ApiController]
[Authorize]
public class RetroInviteController(SupabaseService sb, RetroParticipantService participants) : ControllerBase
{
    private Guid CurrentUserId => RetroParticipantService.UserIdOf(User);

    private bool CurrentUserIsAnonymous => RetroParticipantService.IsAnonymous(User);

    // No ambiguous characters (0/O, 1/l/I) to keep the code easy to read/type.
    private const string CodeAlphabet = "abcdefghjkmnpqrstuvwxyz23456789";

    private static string GenerateInviteCode(int length = 10)
    {
        var bytes = RandomNumberGenerator.GetBytes(length);
        return new string(bytes.Select(b => CodeAlphabet[b % CodeAlphabet.Length]).ToArray());
    }

    private async Task<RetroSession?> GetSessionByCode(string code) =>
        (await sb.Db.From<RetroSession>()
            .Filter("invite_code", Operator.Equals, code)
            .Get()).Models.FirstOrDefault();

    // ─── Invite link (host only) ───────────────────────────────────────────────

    // GET api/retro/{sessionId}/invite
    // Get-or-create the session's invite code. Idempotent — same code every call.
    // Works for both sprint retros and sprint-less quick retros.
    [HttpGet("api/retro/{sessionId:guid}/invite")]
    public async Task<IActionResult> GetInvite(Guid sessionId)
    {
        var session = await participants.GetSessionAsync(sessionId);
        if (session is null) return NotFound("Retro session not found.");
        if (session.FacilitatorId != CurrentUserId) return Forbid();

        if (string.IsNullOrEmpty(session.InviteCode))
        {
            session.InviteCode = GenerateInviteCode();
            await sb.Db.From<RetroSession>().Update(session);

            // Two concurrent first-time calls generate different codes and the
            // last write wins, so trust the stored value over the local copy.
            session = await participants.GetSessionAsync(sessionId) ?? session;
        }

        // Make sure the host shows up in their own participant list, under
        // their real name rather than a generic "Host" label.
        await participants.EnsureParticipantAsync(session, User);

        return Ok(new { inviteCode = session.InviteCode });
    }

    // ─── Public preview (no auth required) ─────────────────────────────────────

    // GET api/retro/join/{code}
    [HttpGet("api/retro/join/{code}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetJoinPreview(string code)
    {
        var session = await GetSessionByCode(code);
        if (session is null) return NotFound("This invite link is invalid.");

        return Ok(await BuildJoinTarget(session));
    }

    // ─── Join (requires a Supabase JWT — real or anonymous) ────────────────────

    // POST api/retro/join/{code}
    // `displayName` is only required for anonymous guests: signed-in users are
    // joined under their team/account name, so they never see a name prompt.
    [HttpPost("api/retro/join/{code}")]
    public async Task<IActionResult> Join(string code, [FromBody] JoinRetroRequest? req)
    {
        var session = await GetSessionByCode(code);
        if (session is null) return NotFound("This invite link is invalid.");

        var displayName = CurrentUserIsAnonymous ? req?.DisplayName?.Trim() : null;
        if (CurrentUserIsAnonymous && string.IsNullOrEmpty(displayName))
            return BadRequest("Display name is required.");

        var participant = await participants.EnsureParticipantAsync(session, User, displayName);
        var target = await BuildJoinTarget(session);

        return Ok(new
        {
            target.SessionId,
            target.RetroName,
            target.Phase,
            target.TeamId,
            target.SprintId,
            target.IsQuickRetro,
            ParticipantId = participant.Id,
            DisplayName   = participant.DisplayName,
        });
    }

    // ─── Participants ───────────────────────────────────────────────────────────

    // GET api/retro/{sessionId}/participants
    [HttpGet("api/retro/{sessionId:guid}/participants")]
    public async Task<IActionResult> GetParticipants(Guid sessionId)
    {
        var session = await participants.GetSessionAsync(sessionId);
        if (session is null) return NotFound("Retro session not found.");

        var isParticipant = session.FacilitatorId == CurrentUserId
            || await participants.IsParticipantAsync(sessionId, CurrentUserId);
        if (!isParticipant) return Forbid();

        return Ok(await participants.GetParticipantsAsync(sessionId));
    }

    // DELETE api/retro/{sessionId}/participants/{participantId}
    // Host-only kick. The host itself can't be removed.
    [HttpDelete("api/retro/{sessionId:guid}/participants/{participantId:guid}")]
    public async Task<IActionResult> KickParticipant(Guid sessionId, Guid participantId)
    {
        var session = await participants.GetSessionAsync(sessionId);
        if (session is null) return NotFound("Retro session not found.");
        if (session.FacilitatorId != CurrentUserId) return Forbid();

        var participant = (await sb.Db.From<RetroParticipant>()
            .Filter("id", Operator.Equals, participantId.ToString())
            .Filter("retro_session_id", Operator.Equals, sessionId.ToString())
            .Get()).Models.FirstOrDefault();
        if (participant is null) return NotFound("Participant not found.");

        if (participant.UserId == session.FacilitatorId)
            return BadRequest("The host can't be removed from the session.");

        await sb.Db.From<RetroParticipant>().Delete(participant);

        return NoContent();
    }

    // Sprint retros live under the team/sprint-scoped dashboard route, quick
    // retros under /quickretro/{id} — the client picks using isQuickRetro.
    private async Task<JoinTarget> BuildJoinTarget(RetroSession session) => new(
        SessionId:    session.Id,
        RetroName:    session.Name,
        Phase:        session.Phase.ToString(),
        TeamId:       await participants.GetTeamIdForSessionAsync(session),
        SprintId:     session.SprintId,
        IsQuickRetro: !session.SprintId.HasValue);
}

public record JoinRetroRequest(string? DisplayName);

public record JoinTarget(
    Guid SessionId,
    string RetroName,
    string Phase,
    Guid? TeamId,
    Guid? SprintId,
    bool IsQuickRetro);
