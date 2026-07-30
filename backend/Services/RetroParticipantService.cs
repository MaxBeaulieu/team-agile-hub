using Backend.Models;
using static Postgrest.Constants;
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
public class RetroParticipantService(SupabaseService sb)
{
    // Written by the invite endpoint before display names were resolved.
    private const string LegacyHostPlaceholder = "Host";

    public static Guid UserIdOf(ClaimsPrincipal user) =>
        Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? user.FindFirstValue("sub")!);

    // Supabase issues `is_anonymous: true` at the root of the JWT for sessions
    // created via supabase.auth.signInAnonymously().
    public static bool IsAnonymous(ClaimsPrincipal user) =>
        string.Equals(user.FindFirstValue("is_anonymous"), "true", StringComparison.OrdinalIgnoreCase);

    public async Task<RetroSession?> GetSessionAsync(Guid sessionId) =>
        (await sb.Db.From<RetroSession>()
            .Filter("id", Operator.Equals, sessionId.ToString())
            .Get()).Models.FirstOrDefault();

    /// <summary>Team the retro belongs to, or null for a sprint-less quick retro.</summary>
    public async Task<Guid?> GetTeamIdForSessionAsync(RetroSession session)
    {
        if (!session.SprintId.HasValue) return null;

        var sprint = (await sb.Db.From<Sprint>()
            .Filter("id", Operator.Equals, session.SprintId.Value.ToString())
            .Get()).Models.FirstOrDefault();
        return sprint?.TeamId;
    }

    public async Task<List<RetroParticipant>> GetParticipantsAsync(Guid sessionId) =>
        (await sb.Db.From<RetroParticipant>()
            .Filter("retro_session_id", Operator.Equals, sessionId.ToString())
            .Order("joined_at", Ordering.Ascending)
            .Get()).Models;

    public async Task<RetroParticipant?> FindParticipantAsync(Guid sessionId, Guid userId) =>
        (await sb.Db.From<RetroParticipant>()
            .Filter("retro_session_id", Operator.Equals, sessionId.ToString())
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Get()).Models.FirstOrDefault();

    public async Task<bool> IsParticipantAsync(Guid sessionId, Guid userId) =>
        await FindParticipantAsync(sessionId, userId) is not null;

    public async Task<bool> IsTeamMemberAsync(Guid teamId, Guid userId) =>
        (await sb.Db.From<TeamMember>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Get()).Models.Any();

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
            var member = (await sb.Db.From<TeamMember>()
                .Filter("team_id", Operator.Equals, teamId.Value.ToString())
                .Filter("user_id", Operator.Equals, userId.ToString())
                .Get()).Models.FirstOrDefault();

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

            try
            {
                return (await sb.Db.From<RetroParticipant>().Insert(row)).Models.First();
            }
            catch (Exception)
            {
                // `retro_participants` is unique on (retro_session_id, user_id) and
                // this runs on every retro load, so two concurrent first-time loads
                // race here. Losing the race is fine — the row now exists.
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
        else if (string.IsNullOrEmpty(overrideName) && NeedsNameRefresh(existing))
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

        await sb.Db.From<RetroParticipant>().Update(existing);
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
            var members = (await sb.Db.From<TeamMember>()
                .Filter("team_id", Operator.Equals, teamId.Value.ToString())
                .Get()).Models;
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
