using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace Backend.Services;

/// <summary>
/// Display names for users who have no <c>team_members</c> row, read from the
/// Supabase Auth admin API (<c>user_metadata.full_name</c>). Cached because auth
/// users change far less often than the screens that render their names.
/// </summary>
public class UserDirectoryService(
    IHttpClientFactory httpClientFactory,
    IConfiguration config,
    IMemoryCache cache)
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);

    private readonly string _baseUrl = config["Supabase:Url"]!.TrimEnd('/');
    private readonly string _serviceKey = config["Supabase:ServiceRoleKey"]!;

    public async Task<string?> DisplayNameAsync(Guid userId)
    {
        var key = $"user-display-name:{userId}";
        if (cache.TryGetValue(key, out string? cached)) return cached;

        var name = await FetchDisplayNameAsync(userId);
        cache.Set(key, name, CacheTtl);
        return name;
    }

    public async Task<Dictionary<Guid, string>> DisplayNamesAsync(IEnumerable<Guid> userIds)
    {
        var ids = userIds.Distinct().ToList();
        var names = await Task.WhenAll(ids.Select(DisplayNameAsync));

        return ids.Zip(names)
            .Where(pair => !string.IsNullOrWhiteSpace(pair.Second))
            .ToDictionary(pair => pair.First, pair => pair.Second!);
    }

    private async Task<string?> FetchDisplayNameAsync(Guid userId)
    {
        try
        {
            using var request = new HttpRequestMessage(
                HttpMethod.Get, $"{_baseUrl}/auth/v1/admin/users/{userId}");
            request.Headers.TryAddWithoutValidation("apikey", _serviceKey);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _serviceKey);

            using var response = await httpClientFactory.CreateClient().SendAsync(request);
            if (!response.IsSuccessStatusCode) return null;

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return NameFrom(doc.RootElement);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            // A missing name is cosmetic — never fail the request over it.
            Console.Error.WriteLine($"[UserDirectory] {ex.GetType().Name}: {ex.Message}");
            return null;
        }
    }

    private static string? NameFrom(JsonElement user)
    {
        if (user.TryGetProperty("user_metadata", out var meta)
            && meta.ValueKind == JsonValueKind.Object)
        {
            foreach (var field in new[] { "full_name", "name", "display_name" })
            {
                if (meta.TryGetProperty(field, out var value)
                    && value.ValueKind == JsonValueKind.String
                    && !string.IsNullOrWhiteSpace(value.GetString()))
                    return value.GetString()!.Trim();
            }
        }

        if (user.TryGetProperty("email", out var email)
            && email.ValueKind == JsonValueKind.String
            && !string.IsNullOrWhiteSpace(email.GetString()))
            return email.GetString()!.Split('@')[0];

        return null;
    }
}
