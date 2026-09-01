using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.SignalR;

namespace Backend.Realtime;

/// <summary>
/// Registered globally (Program.cs) so no controller action calls <see cref="IHubContext{T}"/>
/// directly. Runs after the action has produced its result, so a hub failure can never
/// turn a successful mutation into a 500, and nothing broadcasts on a 4xx — the status
/// check makes that ordering impossible to get wrong regardless of where in a controller
/// action a <see cref="ILiveNotifier.Touch"/> call happens to land. See
/// docs/architecture/selfhost-migration.md §2.2.
/// </summary>
public class LiveBroadcastFilter(
    ILiveNotifier notifier,
    IHubContext<LiveHub> hub,
    ITopicVersionCounter versions,
    ILogger<LiveBroadcastFilter> logger) : IAsyncResultFilter
{
    public async Task OnResultExecutionAsync(ResultExecutingContext context, ResultExecutionDelegate next)
    {
        var executed = await next();

        if (executed.HttpContext.Response.StatusCode is < 200 or >= 300)
        {
            return;
        }

        foreach (var topic in notifier.Drain())
        {
            try
            {
                await hub.Clients.Group(topic).SendAsync("Invalidate", topic, versions.Next(topic));
            }
            catch (Exception ex)
            {
                // A broadcast failure must never surface as an error on the (already
                // successful) HTTP response — log and move on.
                logger.LogError(ex, "Broadcast failed for topic {Topic}", topic);
            }
        }
    }
}
