using Backend.Data;
using Backend.Models;
using Microsoft.EntityFrameworkCore;

namespace Backend.Services;

/// <summary>
/// Single source of truth for "may this user do that?".
///
/// The backend has no RLS to bypass any more (the frontend has no DB credential at all —
/// see docs/architecture/selfhost-migration.md §4.1), but the principle is the same:
/// every authorization decision is made here, in C#.
///
/// Two independent scopes:
///   • platform admin — org-wide, granted out of band (see migration 019)
///   • team role      — 'admin' or 'member' on team_members, per team
/// Facilitation stays a per-session concept (retro_sessions.facilitator_id etc.) and is
/// deliberately not modelled as a role.
/// </summary>
public class AuthorizationService(AppDbContext db)
{
    public Task<bool> IsPlatformAdminAsync(Guid userId) =>
        db.PlatformAdmins.AsNoTracking().AnyAsync(p => p.UserId == userId);

    public async Task<TeamRole?> GetTeamRoleAsync(Guid userId, Guid teamId)
    {
        var member = await db.TeamMembers.AsNoTracking()
            .FirstOrDefaultAsync(m => m.TeamId == teamId && m.UserId == userId);

        return member?.Role;
    }

    public async Task<bool> IsTeamMemberAsync(Guid userId, Guid teamId) =>
        await GetTeamRoleAsync(userId, teamId) is not null;

    public Task<List<TeamMember>> GetMembershipsAsync(Guid userId) =>
        db.TeamMembers.AsNoTracking()
            .Where(m => m.UserId == userId)
            .OrderBy(m => m.JoinedAt)
            .ToListAsync();

    /// <summary>All members of a team, ordered by join date.</summary>
    public Task<List<TeamMember>> GetTeamMembersAsync(Guid teamId) =>
        db.TeamMembers.AsNoTracking()
            .Where(m => m.TeamId == teamId)
            .OrderBy(m => m.JoinedAt)
            .ToListAsync();
}
