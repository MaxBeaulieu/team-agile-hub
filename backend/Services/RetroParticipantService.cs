using Backend.Data;
using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.Security.Claims;

namespace Backend.Services;

/// <summary>
/// Shared identity/roster helpers for retro sessions.
///
/// Every surface that loads a retro (sprint retro, quick retro, invite join)
/// funnels through <see cref="EnsureParticipantAsync"/> so that
/// <c>retro_participants</c> holds a row for everyone who has actually opened
/// the retro — team members and invite-link guests alike. That row is the
/// durable half of the roster; live presence is tracked client-side.
/// </summary>
public class RetroParticipantService(AppDbContext db)
{
    // Written by the invite endpoint before display names were resolved.
    private const string LegacyHostPlaceholder = "Host";

    public static Guid UserIdOf(ClaimsPrincipal user) =>
        Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? user.FindFirstValue("sub")!);

    // The app's own JWT carries `is_anonymous: "true"` for guest sessions (see
    // architecture doc §1.6) — unchanged claim shape from the Supabase-issued token.
    public static bool IsAnonymous(ClaimsPrincipal user) =>
        string.Equals(user.FindFirstValue("is_anonymous"), "true", StringComparison.OrdinalIgnoreCase);

    public Task<RetroSession?> GetSessionAsync(Guid sessionId) =>
        db.RetroSessions.FirstOrDefaultAsync(s => s.Id == sessionId);

    /// <summary>Team the retro belongs to, or null for a sprint-less quick retro.</summary>
    public async Task<Guid?> GetTeamIdForSessionAsync(RetroSession session)
    {
        if (!session.SprintId.HasValue) return null;

        var sprint = await db.Sprints.AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == session.SprintId.Value);
        return sprint?.TeamId;
    }

    public Task<List<RetroParticipant>> GetParticipantsAsync(Guid sessionId) =>
        db.RetroParticipants.AsNoTracking()
            .Where(p => p.RetroSessionId == sessionId)
            .OrderBy(p => p.JoinedAt)
            .ToListAsync();

    public Task<RetroParticipant?> FindParticipantAsync(Guid sessionId, Guid userId) =>
        db.RetroParticipants.FirstOrDefaultAsync(p => p.RetroSessionId == sessionId && p.UserId == userId);

    public async Task<bool> IsParticipantAsync(Guid sessionId, Guid userId) =>
        await FindParticipantAsync(sessionId, userId) is not null;

    public Task<bool> IsTeamMemberAsync(Guid teamId, Guid userId) =>
        db.TeamMembers.AsNoTracking().AnyAsync(m => m.TeamId == teamId && m.UserId == userId);

    /// <summary>
    /// Best display name for a user in the context of a retro: their per-team
    /// display name when they're on the retro's team, otherwise whatever the
    /// JWT carries. Anonymous guests have neither, so callers must pass the
    /// name they typed on the join screen.
    /// </summary>
    public async Task<string> ResolveDisplayNameAsync(ClaimsPrincipal user, Guid? teamId)
    {
        var userId = UserIdOf(user);

        if (teamId.HasValue)
        {
            var member = await db.TeamMembers.AsNoTracking()
                .FirstOrDefaultAsync(m => m.TeamId == teamId.Value && m.UserId == userId);

            if (!string.IsNullOrWhiteSpace(member?.DisplayName))
                return member!.DisplayName.Trim();
        }

        var fromClaims = user.FindFirstValue("name")
            ?? user.FindFirstValue("preferred_username")
            ?? user.FindFirstValue("full_name");
        if (!string.IsNullOrWhiteSpace(fromClaims)) return fromClaims.Trim();

        var email = user.FindFirstValue("email") ?? user.FindFirstValue(ClaimTypes.Email);
        if (!string.IsNullOrWhiteSpace(email)) return email.Split('@')[0];

        return "Guest";
    }

    /// <summary>
    /// Get-or-create the caller's participant row for a session, keeping the
    /// display name and host flag current. Idempotent — safe to call on every
    /// retro load.
    /// </summary>
    public async Task<RetroParticipant> EnsureParticipantAsync(
        RetroSession session, ClaimsPrincipal user, string? displayNameOverride = null)
    {
        var userId = UserIdOf(user);
        var isHost = session.FacilitatorId == userId;
        var existing = await FindParticipantAsync(session.Id, userId);

        var overrideName = displayNameOverride?.Trim();

        if (existing is null)
        {
            var name = !string.IsNullOrEmpty(overrideName)
                ? overrideName
                : await ResolveDisplayNameAsync(user, await GetTeamIdForSessionAsync(session));

            var row = new RetroParticipant
            {
                RetroSessionId = session.Id,
                UserId         = userId,
                DisplayName    = name,
                IsAnonymous    = IsAnonymous(user),
                IsHost         = isHost,
            };

            db.RetroParticipants.Add(row);

            try
            {
                await db.SaveChangesAsync();
                return row;
            }
            catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
            {
                // retro_participants is unique on (retro_session_id, user_id) and this
                // runs on every retro load, so two concurrent first-time loads race
                // here. Losing the race is fine — the row now exists. Narrowed from a
                // bare `catch (Exception)` per architecture doc §3.8: under EF Core the
                // specific exception is a DbUpdateException wrapping a PostgresException
                // with SqlState 23505 (unique_violation).
                db.Entry(row).State = EntityState.Detached;
                existing = await FindParticipantAsync(session.Id, userId);
                if (existing is null) throw;
            }
        }

        var changed = false;

        if (!string.IsNullOrEmpty(overrideName) && existing.DisplayName != overrideName)
        {
            existing.DisplayName = overrideName;
            changed = true;
        }
        else if (string.IsNullOrEmpty(overrideName)
                 && (NeedsNameRefresh(existing) || !IsAnonymous(user)))
        {
            var resolved = await ResolveDisplayNameAsync(user, await GetTeamIdForSessionAsync(session));
            if (existing.DisplayName != resolved)
            {
                existing.DisplayName = resolved;
                changed = true;
            }
        }

        if (existing.IsHost != isHost)
        {
            existing.IsHost = isHost;
            changed = true;
        }

        if (!changed) return existing;

        await db.SaveChangesAsync();
        return existing;
    }

    // Rows written before display names were resolved carry the literal "Host"
    // placeholder; refresh those (and any blank name) on the next retro load.
    private static bool NeedsNameRefresh(RetroParticipant participant) =>
        string.IsNullOrWhiteSpace(participant.DisplayName)
        || participant.DisplayName == LegacyHostPlaceholder;

    /// <summary>
    /// Speaker order for the icebreaker round-robin: everyone who has joined the
    /// retro, shuffled. Falls back to the team roster when nobody has a
    /// participant row yet (e.g. a retro advanced before anyone opened it).
    /// </summary>
    public async Task<List<string>> BuildSpeakerOrderAsync(RetroSession session, Guid? teamId)
    {
        var userIds = (await GetParticipantsAsync(session.Id))
            .Select(p => p.UserId)
            .ToList();

        if (userIds.Count == 0 && teamId.HasValue)
        {
            var members = await db.TeamMembers.AsNoTracking()
                .Where(m => m.TeamId == teamId.Value)
                .ToListAsync();
            userIds.AddRange(members.Select(m => m.UserId));
        }

        if (session.FacilitatorId.HasValue) userIds.Add(session.FacilitatorId.Value);

        return userIds
            .Distinct()
            .Select(id => id.ToString())
            .OrderBy(_ => Random.Shared.Next())
            .ToList();
    }
}
