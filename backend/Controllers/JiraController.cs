using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using static Postgrest.Constants;
using System.Security.Claims;
using System.Text;

namespace Backend.Controllers;

[ApiController]
[Authorize]
public class JiraController(
    SupabaseService sb,
    JiraEncryptionService enc,
    IHttpClientFactory httpFactory,
    IConfiguration config) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")!);

    private async Task<bool> IsMember(Guid teamId)
    {
        var r = await sb.Db.From<TeamMember>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Filter("user_id", Operator.Equals, CurrentUserId.ToString())
            .Get();
        return r.Models.Any();
    }

    // ─── Auth URL ─────────────────────────────────────────────────────────────

    // GET api/teams/{teamId}/jira/auth-url
    [HttpGet("api/teams/{teamId:guid}/jira/auth-url")]
    public async Task<IActionResult> GetAuthUrl(Guid teamId)
    {
        if (!await IsMember(teamId)) return Forbid();

        var clientId = config["Jira:ClientId"];
        if (string.IsNullOrWhiteSpace(clientId))
            return StatusCode(503, "Jira OAuth is not configured on this server.");

        var redirectUri = config["Jira:RedirectUri"]
            ?? $"{Request.Scheme}://{Request.Host}/api/jira/callback";

        var state  = enc.CreateState(teamId);
        var scopes = Uri.EscapeDataString(
            "read:jira-work write:jira-work offline_access");

        var url = "https://auth.atlassian.com/authorize" +
                  $"?audience=api.atlassian.com" +
                  $"&client_id={Uri.EscapeDataString(clientId)}" +
                  $"&scope={scopes}" +
                  $"&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
                  $"&state={Uri.EscapeDataString(state)}" +
                  $"&response_type=code" +
                  $"&prompt=consent";

        return Ok(new { url });
    }

    // ─── OAuth Callback ───────────────────────────────────────────────────────

    // GET api/jira/callback  (called by Atlassian after user consents)
    [AllowAnonymous]
    [HttpGet("api/jira/callback")]
    public async Task<IActionResult> Callback(
        [FromQuery] string? code,
        [FromQuery] string? state,
        [FromQuery] string? error,
        [FromQuery] string? error_description)
    {
        var frontendUrl = (config["Cors:AllowedOrigins"] ?? "http://localhost:3000")
            .Split(',')[0].Trim().TrimEnd('/');

        string FailRedirect(string msg) =>
            $"{frontendUrl}/dashboard/settings?jira=error&msg={Uri.EscapeDataString(msg)}";

        if (!string.IsNullOrWhiteSpace(error))
            return Redirect(FailRedirect(error_description ?? error!));

        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(state))
            return Redirect(FailRedirect("Missing code or state parameter."));

        var teamId = enc.ValidateState(state);
        if (teamId is null)
            return Redirect(FailRedirect("Invalid or expired OAuth state. Please try again."));

        // ── Exchange code for tokens ──────────────────────────────────────────
        var http = httpFactory.CreateClient();
        var tokenBody = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"]    = "authorization_code",
            ["client_id"]     = config["Jira:ClientId"]!,
            ["client_secret"] = config["Jira:ClientSecret"]!,
            ["code"]          = code!,
            ["redirect_uri"]  = config["Jira:RedirectUri"]
                                ?? $"{Request.Scheme}://{Request.Host}/api/jira/callback",
        });

        var tokenResp = await http.PostAsync("https://auth.atlassian.com/oauth/token", tokenBody);
        if (!tokenResp.IsSuccessStatusCode)
            return Redirect(FailRedirect("Token exchange with Atlassian failed."));

        var tokenJson = JsonConvert.DeserializeObject<JiraTokenResponse>(
            await tokenResp.Content.ReadAsStringAsync())!;

        // ── Fetch accessible Jira cloud resources ─────────────────────────────
        using var resourcesReq = new HttpRequestMessage(
            HttpMethod.Get,
            "https://api.atlassian.com/oauth/token/accessible-resources");
        resourcesReq.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", tokenJson.AccessToken);

        var resourcesResp = await http.SendAsync(resourcesReq);
        if (!resourcesResp.IsSuccessStatusCode)
            return Redirect(FailRedirect("Could not read accessible Jira resources."));

        var resources = JsonConvert.DeserializeObject<List<JiraResource>>(
            await resourcesResp.Content.ReadAsStringAsync());
        var resource = resources?.FirstOrDefault();
        if (resource is null)
            return Redirect(FailRedirect("No accessible Jira site found. Make sure your Jira account has at least one site."));

        // ── Encrypt and upsert ────────────────────────────────────────────────
        var expiresAt      = DateTime.UtcNow.AddSeconds(tokenJson.ExpiresIn - 60);
        var encAccessToken = enc.Encrypt(tokenJson.AccessToken);
        var encRefreshToken = string.IsNullOrEmpty(tokenJson.RefreshToken)
            ? string.Empty
            : enc.Encrypt(tokenJson.RefreshToken);

        var existing = (await sb.Db.From<JiraIntegration>()
            .Filter("team_id", Operator.Equals, teamId.Value.ToString())
            .Get()).Models.FirstOrDefault();

        if (existing is not null)
        {
            existing.CloudId                = resource.Id;
            existing.CloudName              = resource.Name;
            existing.AccessTokenEncrypted   = encAccessToken;
            existing.RefreshTokenEncrypted  = encRefreshToken;
            existing.TokenExpiresAt         = expiresAt;
            await sb.Db.From<JiraIntegration>().Update(existing);
        }
        else
        {
            await sb.Db.From<JiraIntegration>().Insert(new JiraIntegration
            {
                TeamId                = teamId.Value,
                CloudId               = resource.Id,
                CloudName             = resource.Name,
                AccessTokenEncrypted  = encAccessToken,
                RefreshTokenEncrypted = encRefreshToken,
                TokenExpiresAt        = expiresAt,
            });
        }

        return Redirect($"{frontendUrl}/dashboard/settings?teamId={teamId}&jira=connected");
    }

    // ─── Status ───────────────────────────────────────────────────────────────

    // GET api/teams/{teamId}/jira/status
    [HttpGet("api/teams/{teamId:guid}/jira/status")]
    public async Task<IActionResult> GetStatus(Guid teamId)
    {
        if (!await IsMember(teamId)) return Forbid();
        var record = (await sb.Db.From<JiraIntegration>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault();
        return Ok(new { connected = record is not null, cloudName = record?.CloudName });
    }

    // ─── Token debug ──────────────────────────────────────────────────────────

    // GET api/teams/{teamId}/jira/debug
    [AllowAnonymous]
    [HttpGet("api/teams/{teamId:guid}/jira/debug")]
    public async Task<IActionResult> Debug(Guid teamId)
    {

        var record = (await sb.Db.From<JiraIntegration>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault();

        if (record is null) return BadRequest("No Jira record found.");

        string rawToken;
        try { rawToken = enc.Decrypt(record.AccessTokenEncrypted); }
        catch (Exception ex) { return BadRequest($"Decrypt failed: {ex.Message}"); }

        // Decode JWT payload (middle section, base64url)
        string? jwtScopes = null;
        try
        {
            var parts = rawToken.Split('.');
            if (parts.Length >= 2)
            {
                var padded = parts[1].Replace('-', '+').Replace('_', '/');
                padded = padded.PadRight((padded.Length + 3) & ~3, '=');
                var payload = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(padded));
                jwtScopes = payload;
            }
        }
        catch { /* not a JWT */ }

        // Call accessible-resources to confirm correct cloudId
        var http = httpFactory.CreateClient();
        using var resReq = new HttpRequestMessage(HttpMethod.Get,
            "https://api.atlassian.com/oauth/token/accessible-resources");
        resReq.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", rawToken);
        var resResp = await http.SendAsync(resReq);
        var resBody = await resResp.Content.ReadAsStringAsync();

        // Call Jira /myself to see if the token works at all
        using var myselfReq = new HttpRequestMessage(
            HttpMethod.Get,
            $"https://api.atlassian.com/ex/jira/{record.CloudId}/rest/api/3/myself");
        myselfReq.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", rawToken);
        var myselfResp = await http.SendAsync(myselfReq);
        var myselfBody = await myselfResp.Content.ReadAsStringAsync();

        // Test the search endpoint directly (POST /search/jql)
        var testPayload = JsonConvert.SerializeObject(new { jql = "project is not EMPTY order by created DESC", maxResults = 1, fields = new[] { "summary" } });
        using var searchTestReq = new HttpRequestMessage(HttpMethod.Post,
            $"https://api.atlassian.com/ex/jira/{record.CloudId}/rest/api/3/search/jql")
        {
            Content = new StringContent(testPayload, Encoding.UTF8, "application/json"),
        };
        searchTestReq.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", rawToken);
        var searchTestResp = await http.SendAsync(searchTestReq);
        var searchTestBody = await searchTestResp.Content.ReadAsStringAsync();

        return Ok(new
        {
            cloudId     = record.CloudId,
            cloudName   = record.CloudName,
            expiresAt   = record.TokenExpiresAt,
            tokenPrefix = rawToken[..Math.Min(30, rawToken.Length)] + "...",
            accessibleResources = resBody,
            myselfStatus = (int)myselfResp.StatusCode,
            myselfBody,
            searchStatus = (int)searchTestResp.StatusCode,
            searchBody = searchTestBody[..Math.Min(300, searchTestBody.Length)],
        });
    }

    // ─── List Projects ────────────────────────────────────────────────────────

    // GET api/teams/{teamId}/jira/projects
    [HttpGet("api/teams/{teamId:guid}/jira/projects")]
    public async Task<IActionResult> ListProjects(Guid teamId)
    {
        if (!await IsMember(teamId)) return Forbid();

        var tokenInfo = await GetValidTokenAsync(teamId);
        if (tokenInfo is null) return BadRequest("Jira is not connected for this team.");

        var (accessToken, cloudId) = tokenInfo.Value;
        var http = httpFactory.CreateClient();

        using var req = new HttpRequestMessage(HttpMethod.Get,
            $"https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/project/search?maxResults=100&orderBy=name");
        req.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

        var resp = await http.SendAsync(req);
        var body = await resp.Content.ReadAsStringAsync();

        if (!resp.IsSuccessStatusCode)
            return StatusCode((int)resp.StatusCode, body);

        return Content(body, "application/json");
    }

    // ─── Search Issues ────────────────────────────────────────────────────────

    // GET api/teams/{teamId}/jira/issues?jql=
    [HttpGet("api/teams/{teamId:guid}/jira/issues")]
    public async Task<IActionResult> SearchIssues(Guid teamId, [FromQuery] string? jql)
    {
        if (!await IsMember(teamId)) return Forbid();

        var tokenInfo = await GetValidTokenAsync(teamId);
        if (tokenInfo is null) return BadRequest("Jira is not connected for this team.");

        var (accessToken, cloudId) = tokenInfo.Value;
        var http = httpFactory.CreateClient();
        var effectiveJql = jql ?? "project is not EMPTY order by created DESC";

        var searchUrl = $"https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/search/jql";
        var searchPayload = JsonConvert.SerializeObject(new
        {
            jql      = effectiveJql,
            fields   = new[] { "summary", "status", "issuetype", "priority", "assignee" },
            maxResults = 200,
        });

        using var req = new HttpRequestMessage(HttpMethod.Post, searchUrl)
        {
            Content = new StringContent(searchPayload, Encoding.UTF8, "application/json"),
        };
        req.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

        var resp = await http.SendAsync(req);
        var body = await resp.Content.ReadAsStringAsync();

        if (!resp.IsSuccessStatusCode)
            return StatusCode((int)resp.StatusCode, body);

        // Pass through the raw Jira JSON — frontend can map what it needs
        return Content(body, "application/json");
    }

    // ─── Create Issue ─────────────────────────────────────────────────────────

    // POST api/teams/{teamId}/jira/issues
    [HttpPost("api/teams/{teamId:guid}/jira/issues")]
    public async Task<IActionResult> CreateIssue(Guid teamId, [FromBody] CreateJiraIssueRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        if (string.IsNullOrWhiteSpace(req.ProjectKey)) return BadRequest("ProjectKey is required.");
        if (string.IsNullOrWhiteSpace(req.Summary))    return BadRequest("Summary is required.");

        var tokenInfo = await GetValidTokenAsync(teamId);
        if (tokenInfo is null) return BadRequest("Jira is not connected for this team.");

        var (accessToken, cloudId) = tokenInfo.Value;
        var http = httpFactory.CreateClient();

        var payload = JsonConvert.SerializeObject(new
        {
            fields = new
            {
                project   = new { key = req.ProjectKey },
                summary   = req.Summary,
                issuetype = new { name = req.IssueType ?? "Task" },
            },
        });

        using var httpReq = new HttpRequestMessage(
            HttpMethod.Post,
            $"https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/issue")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json"),
        };
        httpReq.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

        var resp = await http.SendAsync(httpReq);
        var body = await resp.Content.ReadAsStringAsync();

        if (!resp.IsSuccessStatusCode)
            return StatusCode((int)resp.StatusCode, body);

        return Content(body, "application/json");
    }

    // ─── Disconnect ───────────────────────────────────────────────────────────

    // DELETE api/teams/{teamId}/jira
    [HttpDelete("api/teams/{teamId:guid}/jira")]
    public async Task<IActionResult> Disconnect(Guid teamId)
    {
        if (!await IsMember(teamId)) return Forbid();
        await sb.Db.From<JiraIntegration>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Delete();
        return NoContent();
    }

    // ─── Token refresh helper ─────────────────────────────────────────────────

    private async Task<(string accessToken, string cloudId)?> GetValidTokenAsync(Guid teamId)
    {
        var record = (await sb.Db.From<JiraIntegration>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault();

        if (record is null) return null;

        // Treat stored time as UTC (Postgrest returns Unspecified kind for timestamptz)
        var expiresAtUtc = DateTime.SpecifyKind(record.TokenExpiresAt, DateTimeKind.Utc);
        if (expiresAtUtc <= DateTime.UtcNow)
        {
            if (string.IsNullOrEmpty(record.RefreshTokenEncrypted))
            {
                // No refresh token — token expired, user must reconnect
                Console.Error.WriteLine($"[Jira] Token expired and no refresh token for team {teamId}. User must reconnect.");
                return null;
            }

            var http = httpFactory.CreateClient();
            var refreshBody = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"]    = "refresh_token",
                ["client_id"]     = config["Jira:ClientId"]!,
                ["client_secret"] = config["Jira:ClientSecret"]!,
                ["refresh_token"] = enc.Decrypt(record.RefreshTokenEncrypted),
            });

            var resp = await http.PostAsync("https://auth.atlassian.com/oauth/token", refreshBody);
            if (!resp.IsSuccessStatusCode)
            {
                Console.Error.WriteLine($"[Jira] Token refresh failed for team {teamId}: {resp.StatusCode}");
                return null;
            }

            var tokenJson = JsonConvert.DeserializeObject<JiraTokenResponse>(
                await resp.Content.ReadAsStringAsync())!;

            record.AccessTokenEncrypted = enc.Encrypt(tokenJson.AccessToken);
            if (!string.IsNullOrEmpty(tokenJson.RefreshToken))
                record.RefreshTokenEncrypted = enc.Encrypt(tokenJson.RefreshToken);
            record.TokenExpiresAt = DateTime.UtcNow.AddSeconds(tokenJson.ExpiresIn - 60);
            await sb.Db.From<JiraIntegration>().Update(record);
        }

        return (enc.Decrypt(record.AccessTokenEncrypted), record.CloudId);
    }
}

// ─── Internal DTOs for Atlassian API responses ────────────────────────────────

internal record JiraTokenResponse
{
    [JsonProperty("access_token")]  public string AccessToken  { get; init; } = string.Empty;
    [JsonProperty("refresh_token")] public string RefreshToken { get; init; } = string.Empty;
    [JsonProperty("expires_in")]    public int    ExpiresIn    { get; init; } = 3600;
}

internal record JiraResource
{
    [JsonProperty("id")]   public string Id   { get; init; } = string.Empty;
    [JsonProperty("name")] public string Name { get; init; } = string.Empty;
}

public record CreateJiraIssueRequest(string ProjectKey, string Summary, string? IssueType);
