using System.Collections.Concurrent;

namespace Backend.Realtime;

public class PresenceRegistry : IPresenceRegistry
{
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, PresenceEntry>> _topics = new();

    public IReadOnlyList<PresenceEntry> Join(string topic, string connectionId, PresenceEntry entry)
    {
        var connections = _topics.GetOrAdd(topic, _ => new ConcurrentDictionary<string, PresenceEntry>());
        connections[connectionId] = entry;
        return Snapshot(topic);
    }

    public IReadOnlyList<PresenceEntry> Leave(string topic, string connectionId)
    {
        if (_topics.TryGetValue(topic, out var connections))
        {
            connections.TryRemove(connectionId, out _);
        }

        return Snapshot(topic);
    }

    public IReadOnlyList<PresenceEntry> Snapshot(string topic)
    {
        if (!_topics.TryGetValue(topic, out var connections))
        {
            return [];
        }

        // Stored per connection, projected per user — see the interface doc comment.
        return connections.Values
            .GroupBy(e => e.UserId)
            .Select(g => g.First())
            .ToList();
    }
}
