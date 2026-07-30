using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using static Postgrest.Constants;
using System.Security.Claims;
using System.Security.Cryptography;

namespace Backend.Controllers;

/// <summary>
/// Invite-link based joining for a retro session: host generates a permanent
/// shareable link, anonymous or logged-in users join with just a display name.
/// EE-156.
/// </summary>
[ApiController]
[Authorize]
public class RetroInviteController(SupabaseService sb) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")!);

    // Supabase issues `is_anonymous: true` at the root of the JWT for
    // sessions created via supabase.auth.signInAnonymously().
    private bool CurrentUserIsAnonymous =>
        string.Equals(User.FindFirstValue("is_anonymous"), "true", StringComparison.OrdinalIgnoreCase);

    // No ambiguous characters (0/O, 1/l/I) to keep the code easy to read/type.
    private const string CodeAlphabet = "abcdefghjkmnpqrstuvwxyz23456789";

    private static string GenerateInviteCode(int length = 10)
    {
        var bytes = RandomNumberGenerator.GetBytes(length);
        return new string(bytes.Select(b => CodeAlphabet[b % CodeAlphabet.Length]).ToArray());
    }

    private async Task<RetroSession?> GetSession(Guid sessionId) =>
        (await sb.Db.From<RetroSession>()
            .Filter("id", Operator.Equals, sessionId.ToString())
            .Get()).Models.FirstOrDefault();

    private async Task<RetroParticipant?> FindParticipant(Guid sessionId, Guid userId) =>
        (await sb.Db.From<RetroParticipant>()
            .Filter("retro_session_id", Operator.Equals, sessionId.ToString())
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Get()).Models.FirstOrDefault();

    // ─── Invite link (host only) ───────────────────────────────────────────────

    // GET api/retro/{sessionId}/invite
    // Get-or-create the session's invite code. Idempotent — same code every call.
    [HttpGet("api/retro/{sessionId:guid}/invite")]
    public async Task<IActionResult> GetInvite(Guid sessionId)
    {
        var session = await GetSession(sessionId);
        if (session is null) return NotFound("Retro session not found.");
        if (session.FacilitatorId != CurrentUserId) return Forbid();

        if (string.IsNullOrEmpty(session.InviteCode))
        {
            session.InviteCode = GenerateInviteCode();
            session = (await sb.Db.From<RetroSession>().Update(session)).Models.First();
        }

        // Make sure the host shows up in their own participant list.
        if (await FindParticipant(session.Id, CurrentUserId) is null)
        {
            await sb.Db.From<RetroParticipant>().Insert(new RetroParticipant
            {
                RetroSessionId = session.Id,
                UserId         = CurrentUserId,
                DisplayName    = "Host",
                IsAnonymous    = false,
                IsHost         = true,
            });
        }

        return Ok(new { inviteCode = session.InviteCode });
    }

    private async Task<Guid?> GetTeamIdForSession(RetroSession session)
    {
        var sprint = (await sb.Db.From<Sprint>()
            .Filter("id", Operator.Equals, session.SprintId.ToString())
            .Get()).Models.FirstOrDefault();
        return sprint?.TeamId;
    }

    // ─── Public preview (no auth required) ─────────────────────────────────────

    // GET api/retro/join/{code}
    [HttpGet("api/retro/join/{code}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetJoinPreview(string code)
    {
        var session = (await sb.Db.From<RetroSession>()
            .Filter("invite_code", Operator.Equals, code)
            .Get()).Models.FirstOrDefault();
        if (session is null) return NotFound("This invite link is invalid.");

        return Ok(new
        {
            sessionId = session.Id,
            phase     = session.Phase.ToString(),
            // Current retro view route is still team/sprint-scoped — include
            // both so the frontend can build a working redirect. Drop once
            // the standalone retro route lands.
            teamId    = await GetTeamIdForSession(session),
            sprintId  = session.SprintId,
        });
    }

    // ─── Join (requires a Supabase JWT — real or anonymous) ────────────────────

    // POST api/retro/join/{code}
    [HttpPost("api/retro/join/{code}")]
    public async Task<IActionResult> Join(string code, [FromBody] JoinRetroRequest req)
    {
        var displayName = req.DisplayName?.Trim();
        if (string.IsNullOrEmpty(displayName))
            return BadRequest("Display name is required.");

        var session = (await sb.Db.From<RetroSession>()
            .Filter("invite_code", Operator.Equals, code)
            .Get()).Models.FirstOrDefault();
        if (session is null) return NotFound("This invite link is invalid.");

        var existing = await FindParticipant(session.Id, CurrentUserId);

        RetroParticipant participant;
        if (existing is not null)
        {
            existing.DisplayName = displayName;
            participant = (await sb.Db.From<RetroParticipant>().Update(existing)).Models.First();
        }
        else
        {
            participant = (await sb.Db.From<RetroParticipant>().Insert(new RetroParticipant
            {
                RetroSessionId = session.Id,
                UserId         = CurrentUserId,
                DisplayName    = displayName,
                IsAnonymous    = CurrentUserIsAnonymous,
                IsHost         = session.FacilitatorId == CurrentUserId,
            })).Models.First();
        }

        return Ok(new
        {
            sessionId     = session.Id,
            participantId = participant.Id,
            teamId        = await GetTeamIdForSession(session),
            sprintId      = session.SprintId,
        });
    }

    // ─── Participants ───────────────────────────────────────────────────────────

    // GET api/retro/{sessionId}/participants
    [HttpGet("api/retro/{sessionId:guid}/participants")]
    public async Task<IActionResult> GetParticipants(Guid sessionId)
    {
        var session = await GetSession(sessionId);
        if (session is null) return NotFound("Retro session not found.");

        var isParticipant = session.FacilitatorId == CurrentUserId
            || await FindParticipant(sessionId, CurrentUserId) is not null;
        if (!isParticipant) return Forbid();

        var participants = (await sb.Db.From<RetroParticipant>()
            .Filter("retro_session_id", Operator.Equals, sessionId.ToString())
            .Order("joined_at", Ordering.Ascending)
            .Get()).Models;

        return Ok(participants);
    }

    // DELETE api/retro/{sessionId}/participants/{participantId}
    // Host-only kick. The host itself can't be removed.
    [HttpDelete("api/retro/{sessionId:guid}/participants/{participantId:guid}")]
    public async Task<IActionResult> KickParticipant(Guid sessionId, Guid participantId)
    {
        var session = await GetSession(sessionId);
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
}

public record JoinRetroRequest(string DisplayName);
