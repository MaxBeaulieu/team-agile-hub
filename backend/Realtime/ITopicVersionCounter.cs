namespace Backend.Realtime;

/// <summary>
/// Per-topic monotonically increasing counter. Its only jobs are to let clients drop
/// stale/duplicate invalidations and to make the frontend's existing 300ms debounce
/// provably safe — see docs/architecture/selfhost-migration.md §2 ADR-4.
/// </summary>
public interface ITopicVersionCounter
{
    long Next(string topic);
}
