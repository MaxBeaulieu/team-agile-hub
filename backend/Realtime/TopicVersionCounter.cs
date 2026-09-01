using System.Collections.Concurrent;

namespace Backend.Realtime;

/// <summary>
/// Process-wide, in-memory (§3.6: one of the three reasons the backend is pinned to a
/// single replica — these counters don't survive a restart or fragment across
/// instances, which is fine since they're purely a de-duplication hint, not a source of
/// truth). Registered as a singleton.
/// </summary>
public class TopicVersionCounter : ITopicVersionCounter
{
    private readonly ConcurrentDictionary<string, long> _counters = new();

    public long Next(string topic) => _counters.AddOrUpdate(topic, 1, (_, current) => current + 1);
}
