using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Backend.Controllers;

/// <summary>
/// Shared base for authenticated API controllers: identity plus the two authorization
/// scopes. Results are memoised for the lifetime of the request (controllers are
/// per-request instances), so an endpoint can ask several times without re-querying.
/// </summary>
[Authorize]
public abstract class ApiControllerBase(AuthorizationService auth) : ControllerBase
{
    protected AuthorizationService Auth { get; } = auth;

    protected Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")!);

    protected string? CurrentUserEmail =>
        User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email");

    private bool? _isPlatformAdmin;

    /// <summary>Org-wide admin — floor map, desk defect queue.</summary>
    protected async Task<bool> IsPlatformAdminAsync()
    {
        if (_isPlatformAdmin is null)
            _isPlatformAdmin = await Auth.IsPlatformAdminAsync(CurrentUserId);
        return _isPlatformAdmin.Value;
    }

    /// <summary>Can participate in this team's ceremonies.</summary>
    protected Task<bool> IsTeamMemberAsync(Guid teamId) =>
        Auth.IsTeamMemberAsync(CurrentUserId, teamId);

    /// <summary>
    /// Can administer this team: sprints, integrations, membership, deletion.
    /// Platform admins are admins of every team.
    /// </summary>
    protected async Task<bool> IsTeamAdminAsync(Guid teamId) =>
        await Auth.GetTeamRoleAsync(CurrentUserId, teamId) == TeamRole.Admin
        || await IsPlatformAdminAsync();
}
