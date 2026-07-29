# Daily Standup Feature Plan

## Overview

A dedicated standup page that acts as a lightweight facilitator UI for daily meetings.
It replaces DrawTheShortStraw for screen-share picking, and gives each dev a focused
view of their current sprint work to structure their update.

---

## 1. Screen-Share Picker

The facilitator opens the picker before the meeting starts and picks a mode for that day.

### Modes

| Mode | What happens |
|---|---|
| **Short Straw** | Classic draw — animated straws, one is shorter. Tap to reveal. |
| **Spin the Wheel** | A spinning wheel with team member names, slows to a stop. |
| **Hot Potato** | A potato bounces between avatars rapidly then freezes on someone. Visual only, not random until stopped. |
| **Random Card Draw** | Each member gets a playing card dealt face-down, highest card wins (or loses). |
| **Dice Roll** | Each member gets a die roll simultaneously, highest goes first. |

All modes are purely visual/animated — the randomness is determined upfront (seeded on page load so everyone sees the same result if they reload).

### UX flow
1. Facilitator clicks **"Pick who shares"** button at top of standup page.
2. A modal opens showing the 5 mode tiles. Facilitator picks one.
3. Animation plays (lasts ~3 seconds).
4. Winner is highlighted with confetti. Their card in the standup list scrolls into view.
5. Result is remembered for the rest of the session (refresh resets it).

---

## 2. Standup View

### Layout
- Header shows: today's date, sprint name, days remaining in sprint.
- One card per team member, sorted alphabetically (or by picker result — winner first).

### Each member card shows:
- **Avatar / initials** + display name
- **In Progress** tickets from Jira (PAT board, current sprint, status = "In Progress")
- **Done since yesterday** — tickets moved to Done in the last 24 hours (requires `updated >= -1d` filter)
- **Blockers** — open blockers from the app's own blockers table
- A **"Presents today"** crown/star badge if this person was picked by the picker

### Standup talking points (displayed as a checklist per card):
- ✅ What did you work on? *(powered by In Progress + Done tickets)*
- ✅ What are you working on next? *(To Do tickets assigned to them)*
- ✅ Any blockers?

Cards collapse/expand so the facilitator can focus on the current speaker.

---

## 3. Data Sources

| Data | Source |
|---|---|
| Team members | `/api/teams/{teamId}/workload` (already built) |
| In Progress tickets | Jira: `project = PAT AND sprint in openSprints() AND status = "In Progress" AND assignee = X` |
| Done yesterday | Jira: `project = PAT AND sprint in openSprints() AND statusCategory = Done AND updated >= -1d` |
| To Do tickets | Jira: `project = PAT AND sprint in openSprints() AND statusCategory = "To Do" AND assignee = X` |
| Blockers | Already in workload endpoint |

To avoid N+1 Jira calls, a single query fetches all sprint tickets once and partitions them client-side by assignee and status.

---

## 4. Page Structure

```
/dashboard/standup
```

```
┌─────────────────────────────────────────────────────┐
│  Daily Standup  ·  Mon Apr 6  ·  Sprint 42  ·  3d left   [Pick who shares ▾]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  👑 Max K          [In Progress] [Done] [Blockers]  │  ← expanded (current speaker)
│     PAT-1246  FE: Block account modal   In Progress │
│     PAT-1100  FE & BE: Return message   In Progress │
│     ─────────────────────────────────               │
│     No blockers                                     │
│                                                     │
│  Alex B  ▶ (collapsed)                              │
│  Sarah M  ▶ (collapsed)                             │
│  ...                                                │
└─────────────────────────────────────────────────────┘
```

---

## 5. Navigation

Add **"Standup"** to the sidebar between Workload and Sprints, with a `Coffee` or `Sun` icon from lucide.

---

## 6. What's NOT in scope (for now)

- Saving standup notes / history
- Timer per speaker
- Async standup (text-based updates)
- Notifications / Slack integration

These can be added later if useful.

---

## 7. Implementation Order

1. `StandupPage` shell + sidebar nav item
2. Jira data fetching (single call, partition client-side)
3. Member cards with expand/collapse
4. Picker modal — Short Straw first (simplest), then other modes
5. Polish: confetti on pick, sprint countdown, crown badge
