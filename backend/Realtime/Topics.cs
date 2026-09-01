namespace Backend.Realtime;

/// <summary>
/// The only place SignalR group name strings are constructed or parsed. Deliberately
/// identical to the pre-migration Supabase channel names so the eventual frontend diff
/// (Phase 5) stays mechanical. See docs/architecture/selfhost-migration.md §2.1.
/// </summary>
public static class Topics
{
    private const string RetroPrefix = "retro:";
    private const string PokerPrefix = "poker:";
    private const string BlockersPrefix = "blockers:";

    public static string Retro(Guid sessionId) => $"{RetroPrefix}{sessionId}";
    public static string Poker(Guid sprintId) => $"{PokerPrefix}{sprintId}";
    public static string Blockers(Guid teamId) => $"{BlockersPrefix}{teamId}";

    /// <summary>
    /// Reverse-parses a group name back to the id it was built from, so
    /// <c>LiveHub.JoinTopic</c> can look up the right authorization check without the
    /// caller telling it what kind of topic it's joining (topic strings are the only
    /// thing a hub method receives).
    /// </summary>
    public static bool TryParseRetro(string topic, out Guid sessionId) =>
        TryParse(topic, RetroPrefix, out sessionId);

    public static bool TryParsePoker(string topic, out Guid sprintId) =>
        TryParse(topic, PokerPrefix, out sprintId);

    public static bool TryParseBlockers(string topic, out Guid teamId) =>
        TryParse(topic, BlockersPrefix, out teamId);

    private static bool TryParse(string topic, string prefix, out Guid id)
    {
        if (topic.StartsWith(prefix, StringComparison.Ordinal)
            && Guid.TryParse(topic.AsSpan(prefix.Length), out id))
        {
            return true;
        }

        id = Guid.Empty;
        return false;
    }
}
