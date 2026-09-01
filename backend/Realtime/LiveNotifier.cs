namespace Backend.Realtime;

/// <summary>
/// One instance per request (registered scoped) — a plain HashSet is fine, no
/// concurrency concerns within a single request's controller action.
/// </summary>
public class LiveNotifier : ILiveNotifier
{
    private readonly HashSet<string> _topics = [];

    public void Touch(string topic) => _topics.Add(topic);

    public IReadOnlyCollection<string> Drain()
    {
        var drained = _topics.ToList();
        _topics.Clear();
        return drained;
    }
}
