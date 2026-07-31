using Backend.Models;
using static Postgrest.Constants;

namespace Backend.Services;

/// <summary>
/// Single source of truth for "may this user do that?".
///
/// The backend connects with the Supabase service role, which bypasses RLS, so the
/// policies in the migrations are defence in depth only — every authorization decision
/// has to be made here, in C#.
///
/// Two independent scopes:
///   • platform admin — org-wide, granted out of band (see migration 019)
///   • team role      — 'admin' or 'member' on team_members, per team
/// Facilitation stays a per-session concept (retro_sessions.facilitator_id etc.) and is
/// deliberately not modelled as a role.
/// </summary>
public class AuthorizationService(SupabaseService sb)
{
    public async Task<bool> IsPlatformAdminAsync(Guid userId)
    {
        var result = await sb.Db.From<PlatformAdmin>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Get();

        return result.Models.Any();
    }

    public async Task<TeamRole?> GetTeamRoleAsync(Guid userId, Guid teamId)
    {
        var result = await sb.Db.From<TeamMember>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Get();

        return result.Models.FirstOrDefault()?.Role;
    }

    public async Task<bool> IsTeamMemberAsync(Guid userId, Guid teamId) =>
        await GetTeamRoleAsync(userId, teamId) is not null;

    public async Task<List<TeamMember>> GetMembershipsAsync(Guid userId) =>
        (await sb.Db.From<TeamMember>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Order("joined_at", Ordering.Ascending)
            .Get()).Models;

    /// <summary>All members of a team, ordered by join date.</summary>
    public async Task<List<TeamMember>> GetTeamMembersAsync(Guid teamId) =>
        (await sb.Db.From<TeamMember>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Order("joined_at", Ordering.Ascending)
            .Get()).Models;
}
