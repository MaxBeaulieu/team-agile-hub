using Supabase;

namespace Backend.Services;

/// <summary>
/// Thin wrapper around the Supabase C# client.
/// Injected as a singleton — the underlying client manages its own connection pool.
/// </summary>
public class SupabaseService
{
    public Client Db { get; }

    public SupabaseService(IConfiguration config)
    {
        var url        = config["Supabase:Url"]!;
        var serviceKey = config["Supabase:ServiceRoleKey"]!;

        // Service role key bypasses RLS — only used server-side.
        Db = new Client(url, serviceKey, new SupabaseOptions
        {
            AutoRefreshToken    = false,
            AutoConnectRealtime = false,
        });
    }
}
