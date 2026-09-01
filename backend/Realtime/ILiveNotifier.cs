namespace Backend.Realtime;

/// <summary>
/// Scoped, injected into controllers and services. Collects the topics a request's
/// mutations touched; never sends anything itself — <see cref="LiveBroadcastFilter"/>
/// drains and sends after the response is produced. See
/// docs/architecture/selfhost-migration.md §2.2, "controllers mark, a filter sends."
/// </summary>
public interface ILiveNotifier
{
    void Touch(string topic);
    IReadOnlyCollection<string> Drain();
}
