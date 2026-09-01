namespace Backend.Realtime;

/// <summary>
/// Server-derived roster entry — built from the caller's claims plus their
/// <c>retro_participants</c> row, never from a client-supplied argument. Today's
/// <c>channel.track(payload)</c> lets the browser assert its own <c>isHost</c>; moving
/// presence server-side (this record is only ever constructed inside <see cref="LiveHub"/>)
/// closes that for free. See docs/architecture/selfhost-migration.md §2.3.
/// </summary>
public record PresenceEntry(Guid UserId, string DisplayName, bool IsAnonymous, bool IsHost);

/// <summary>
/// In-memory roster per topic. Registered as a singleton — this is process-wide,
/// ephemeral state, and one of the three reasons the backend is pinned to a single
/// replica (architecture doc §3.6): it fragments if the backend is ever scaled out.
///
/// Retro-only in practice — <see cref="LiveHub"/> only calls this for <c>retro:*</c>
/// topics, since <c>use-retro-roster.ts</c> is the only presence consumer in the
/// codebase and there is no poker or blockers roster UI. The registry itself is generic
/// (any topic string works) so a roster for another topic family is purely additive
/// later.
/// </summary>
public interface IPresenceRegistry
{
    /// <summary>Registers <paramref name="entry"/> for this connection and returns the
    /// topic's post-join snapshot (already collapsed per-user — see <see cref="Snapshot"/>).</summary>
    IReadOnlyList<PresenceEntry> Join(string topic, string connectionId, PresenceEntry entry);

    /// <summary>Removes this connection's entry and returns the topic's post-leave snapshot.</summary>
    IReadOnlyList<PresenceEntry> Leave(string topic, string connectionId);

    /// <summary>
    /// Current roster for a topic, collapsed per user (multi-tab collapsing): stored per
    /// connection, projected per user by taking the first entry for each
    /// <see cref="PresenceEntry.UserId"/>. Two tabs for the same user → one roster row;
    /// closing one tab must not remove the user — that's what the per-user projection
    /// guarantees, since the other connection's entry is still present.
    /// </summary>
    IReadOnlyList<PresenceEntry> Snapshot(string topic);
}
