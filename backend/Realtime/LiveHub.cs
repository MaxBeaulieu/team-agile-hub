using Backend.Data;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Backend.Realtime;

/// <summary>
/// One hub for every collaborative surface, mapped at <c>/hub/live</c>. Groups (not hub
/// count) provide topic isolation. Server→client methods, complete list:
/// <c>Invalidate(topic, version)</c> (sent by <see cref="LiveBroadcastFilter"/>, never
/// from here) and <c>Presence(topic, entries)</c> (sent from here, retro topics only).
/// See docs/architecture/selfhost-migration.md §2.1/§2.3.
/// </summary>
[Authorize]
public class LiveHub(
    AppDbContext db,
    AuthorizationService auth,
    RetroParticipantService participants,
    IPresenceRegistry presence) : Hub
{
    private Guid CurrentUserId => RetroParticipantService.UserIdOf(Context.User!);

    /// <summary>
    /// Authorizes against the exact same checks the corresponding GET endpoints use,
    /// joins the SignalR group, and — retro topics only — registers and broadcasts
    /// presence. Unauthorized throws rather than no-ops, so the client gets an explicit
    /// signal instead of a permanently empty roster with no explanation.
    /// </summary>
    public async Task JoinTopic(string topic)
    {
        if (Topics.TryParseRetro(topic, out var sessionId))
        {
            var session = await db.RetroSessions.AsNoTracking().FirstOrDefaultAsync(s => s.Id == sessionId);
            var authorized = session is not null
                && (session.FacilitatorId == CurrentUserId
                    || await participants.IsParticipantAsync(sessionId, CurrentUserId));
            if (!authorized) throw new HubException("Forbidden");

            await Groups.AddToGroupAsync(Context.ConnectionId, topic);
            JoinedTopics().Add(topic);

            var entry = await BuildRetroPresenceEntryAsync(sessionId, session!);
            var snapshot = presence.Join(topic, Context.ConnectionId, entry);
            await Clients.Group(topic).SendAsync("Presence", topic, snapshot);
            return;
        }

        if (Topics.TryParsePoker(topic, out var sprintId))
        {
            var sprint = await db.Sprints.AsNoTracking().FirstOrDefaultAsync(s => s.Id == sprintId);
            var authorized = sprint is not null && await auth.IsTeamMemberAsync(CurrentUserId, sprint.TeamId);
            if (!authorized) throw new HubException("Forbidden");

            // No presence tracking — poker has no roster UI (only retro does, via
            // use-retro-roster.ts). Group join is still required for Invalidate.
            await Groups.AddToGroupAsync(Context.ConnectionId, topic);
            JoinedTopics().Add(topic);
            return;
        }

        if (Topics.TryParseBlockers(topic, out var teamId))
        {
            if (!await auth.IsTeamMemberAsync(CurrentUserId, teamId)) throw new HubException("Forbidden");

            // Same as poker — no roster UI, group join only.
            await Groups.AddToGroupAsync(Context.ConnectionId, topic);
            JoinedTopics().Add(topic);
            return;
        }

        // Not a recognised topic shape at all.
        throw new HubException("Forbidden");
    }

    public async Task LeaveTopic(string topic)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, topic);
        JoinedTopics().Remove(topic);

        if (Topics.TryParseRetro(topic, out _))
        {
            var snapshot = presence.Leave(topic, Context.ConnectionId);
            await Clients.Group(topic).SendAsync("Presence", topic, snapshot);
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        foreach (var topic in JoinedTopics())
        {
            if (Topics.TryParseRetro(topic, out _))
            {
                var snapshot = presence.Leave(topic, Context.ConnectionId);
                await Clients.Group(topic).SendAsync("Presence", topic, snapshot);
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Built from the caller's claims plus their <c>retro_participants</c> row — never
    /// from a client-supplied argument (<c>JoinTopic</c> takes only the topic string).
    /// This is the one place Phase 4 changes behaviour rather than relocates it: today
    /// <c>channel.track(payload)</c> lets the browser assert its own <c>isHost</c>.
    /// </summary>
    private async Task<PresenceEntry> BuildRetroPresenceEntryAsync(Guid sessionId, Models.RetroSession session)
    {
        var user = Context.User!;
        var userId = CurrentUserId;
        var isHost = session.FacilitatorId == userId;

        var participant = await participants.FindParticipantAsync(sessionId, userId);
        if (participant is not null)
        {
            return new PresenceEntry(userId, participant.DisplayName, participant.IsAnonymous, isHost);
        }

        // Shouldn't normally happen — every retro-loading REST endpoint calls
        // EnsureParticipantAsync before the frontend opens the hub connection — but
        // fall back to claims-based resolution rather than fail the join outright.
        var teamId = await participants.GetTeamIdForSessionAsync(session);
        var displayName = await participants.ResolveDisplayNameAsync(user, teamId);
        return new PresenceEntry(userId, displayName, RetroParticipantService.IsAnonymous(user), isHost);
    }

    /// <summary>
    /// <c>Context.Items</c> is not thread-safe, but SignalR's
    /// <c>MaximumParallelInvocationsPerClient</c> defaults to 1, which serialises hub
    /// method invocations for a single connection — safe only as long as that default
    /// holds. Don't raise it without revisiting this.
    /// </summary>
    private HashSet<string> JoinedTopics()
    {
        if (Context.Items.TryGetValue("topics", out var value) && value is HashSet<string> set)
        {
            return set;
        }

        set = [];
        Context.Items["topics"] = set;
        return set;
    }
}
