# Sprint Retro — Feature Spec

## Overview

A real-time, facilitator-driven retrospective tool. One retro per sprint. The session moves through **8 phases** controlled by the facilitator, with all team members synced live via Supabase Realtime.

---

## Phase Flow

```
CheckIn → Icebreaker → Write → Group → Vote → Discuss → WrapUp → Completed
```

The phase is stored in `retro_sessions.phase` (already an enum in the C# model). Only the facilitator can advance phases. Non-facilitators see a "Waiting for facilitator…" cue when a transition is pending.

> **Facilitator** = the team member who created the retro session (stored as `created_by`). Consider adding a `facilitator_id` column to `retro_sessions` so it can be transferred mid-session.

---

## Phase Details

### 1. CheckIn

**Goal:** Pulse check before the session starts.

- Each user submits an **entry mood** (1–5 scale) stored in `mood_checkins.entry_mood`
- Mood picker UI: 5 emoji faces or coloured circles (😫 😕 😐 🙂 😁)
- Once submitted, the user's avatar shows a ✓ checkmark — no numeric value visible to others
- Facilitator sees a progress counter: **"3 / 5 checked in"**
- Facilitator can advance even if not everyone has checked in (with a confirm prompt: "2 members haven't checked in yet — advance anyway?")
- Users who join late can still submit their mood retroactively during the session

---

### 2. Icebreaker

**Goal:** Warm up the team before diving in.

- On entering this phase, a question is **auto-picked randomly** from the `icebreakers` table (backend selects one and writes it to `retro_sessions.icebreaker_question`)
- The facilitator can **re-roll** for a different question
- **Spotlight mechanism:** one team member is "on stage" at a time (`current_speaker_id`). Their avatar is highlighted with a microphone icon.
- Speaker order is generated as a shuffled list of team member IDs → stored in `speaker_order_json`
- Facilitator advances spotlight with a **"Next →"** button
- Anyone can skip their own turn
- No text input required — answers are verbal
- Icebreaker category is shown (Quick / Fun / Team-Building / Retro-flavoured)
- Facilitator ends the phase manually when done

**Interesting idea:** Show the full speaker queue as an avatar strip at the bottom so everyone knows who's next.

---

### 3. Write

**Goal:** Everyone writes their cards independently, anonymously.

- Columns displayed side by side (default: **Went Well** | **Improve** | **Learnings** | **Questions**, configurable)
- Each column has a card input: text area + "Add card" button (or Enter to submit)
- A user can only see **their own cards**. Other users' cards show as face-down placeholders (`? cards from other team members`)
- Card count per column is visible (e.g. "4 cards total") so people know writing is happening
- Optional **phase timer** (configurable: 3 / 5 / 10 min). When it expires, a gentle nudge toast appears. Facilitator can extend or end the phase.
- Users can edit or delete their own cards during this phase only
- Column colours: Went Well = green, Improve = amber, Action Items = blue (or themed to the app colour scheme)

---

### 4. Group

**Goal:** Facilitator (or whole team) organises cards into themes.

- All cards are **revealed simultaneously** with a flip animation when entering this phase
- Authors are still hidden at this point (optional: `show_authors_in_group` setting, default off)
- Cards are displayed per column on a board
- **Grouping:** drag a card onto another card to group them. A `group_id` (UUID) is assigned to both. The first card dropped onto becomes the "parent".
- The facilitator sets a **group label** (written above the group)
- Anyone can suggest groups; facilitator confirms (or allow fully collaborative grouping — team preference)
- Ungroup: drag a card out of a group
- Lone cards are valid — not everything needs to be grouped

**Interesting idea:** An **"AI Group Suggestions"** button (future OpenAI integration) that analyses card content and proposes groupings. Facilitator reviews and accepts/rejects each suggestion.

---

### 5. Vote

**Goal:** Surface what matters most to the team.

- Each user gets **N votes** (default 5, stored in `retro_sessions.vote_count`, configurable at session creation)
- Votes are distributed across cards by clicking. Click once = +1 vote on that card. Click again = -1 vote.
- A user can **stack multiple votes** on a single card (e.g. put all 5 on one card)
- **Remaining budget** counter is shown prominently for each user (e.g. "2 votes left")
- If `hide_votes_until_revealed = true` (default **false**): vote counts are hidden from everyone until the facilitator triggers reveal. Useful to avoid bandwagon voting.
- If `hide_votes_until_revealed = false`: vote counts update live for all users
- Facilitator sees completion: **"4 / 5 members have voted"** (a member is considered "done" when they've used all their votes or clicked "Done voting")
- Facilitator can advance even if not everyone has voted

---

### 6. Discuss

**Goal:** Work through the most-voted cards together.

- Cards are **sorted by total votes descending** across all columns
- Facilitator selects the **active discussion card** (`active_discussion_card_id`) — it enters "spotlight" mode (enlarged, centred, or highlighted)
- A **discussion notes** area is attached to each card (`retro_cards.discussion_notes`) — collaborative, realtime text field. All team members can write simultaneously (like a shared scratchpad).
- Facilitator can **create action items** directly from the active card — these get linked to `action_items` with `type = Retro` and `sprint_id`
- Assigned to a team member, with optional due date
- Card can be **marked as discussed** (dimmed / moved to "done" pile) — does not delete it
- Facilitator controls pace: moves to next card when ready
- Speaker queue from Icebreaker can be reused here for "who talks first"

**Interesting additions:**
- **Emoji reactions** on cards (👍 ❤️ 😂 😮 💡) — lightweight engagement during discussion
- **"Parking lot" tag** — mark a card for follow-up outside the retro, without creating an action item yet

---

### 7. WrapUp

**Goal:** Close the session with reflection and capture.

- Each user submits their **exit mood** (1–5) — `mood_checkins.exit_mood` updated on the existing record
- Show **entry vs exit mood delta** for each user (e.g., ▲2 🙂 → 😁). Aggregate team mood shown.
- **Summary panel:**
  - Cards per column with final vote counts
  - Action items created this retro (list with assignees)
  - Any cards in the "parking lot"
- **Carry-over action items** from the previous sprint (Open/InProgress) are shown for awareness
- Facilitator clicks **"Complete Retro"** → session phase moves to `Completed`, sprint record could auto-update status to `Completed`

**Interesting idea:** Confetti animation when the retro is marked complete (use `canvas-confetti` or CSS). Small dopamine hit for the team.

---

## Realtime Strategy

Subscribe on the frontend when the retro page mounts. All subscriptions are filtered by `retro_session_id`.

| Table | Events | What updates |
|---|---|---|
| `retro_sessions` | UPDATE | Phase change, active speaker, active discussion card, icebreaker question |
| `retro_cards` | INSERT / UPDATE / DELETE | Card list (new cards appear, edits reflect, deletions remove) |
| `retro_votes` | INSERT / UPDATE / DELETE | Vote counts per card |
| `mood_checkins` | INSERT / UPDATE | CheckIn progress indicator, WrapUp mood display |

Cards received during **Write phase** from other users are only rendered as face-down placeholders (show count, not content). The actual content is revealed on transition to Group phase (the `is_revealed` flag is set server-side when advancing past Write).

---

## Backend Endpoints

All routes are team-scoped and require the user to be a team member. Facilitator-only actions are enforced server-side by checking `facilitator_id`.

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/teams/{teamId}/sprints/{sprintId}/retro` | Create retro session. Sets facilitator_id = current user. Generates speaker order. |
| `GET` | `/api/teams/{teamId}/sprints/{sprintId}/retro` | Get full session state: session + cards + votes + mood checkins |
| `PATCH` | `/api/teams/{teamId}/retro/{id}` | Update session config (columns, voteCount, hideVotesUntilRevealed). Facilitator only. |
| `POST` | `/api/teams/{teamId}/retro/{id}/advance` | Advance to next phase. Runs phase transition logic (e.g. reveal cards on Write→Group). Facilitator only. |
| `POST` | `/api/teams/{teamId}/retro/{id}/cards` | Add a card (Write phase only). Author = current user. |
| `PATCH` | `/api/teams/{teamId}/retro/{id}/cards/{cardId}` | Update card content (own card, Write phase) or group/notes (Group/Discuss phase). |
| `DELETE` | `/api/teams/{teamId}/retro/{id}/cards/{cardId}` | Delete own card. Write phase only. |
| `PUT` | `/api/teams/{teamId}/retro/{id}/votes` | Upsert vote batch for current user. Body: `[{ cardId, count }]`. Vote phase only. |
| `POST` | `/api/teams/{teamId}/retro/{id}/mood` | Submit entry or exit mood. Body: `{ entryMood? exitMood? }`. Upsert on (sessionId, userId). |
| `POST` | `/api/teams/{teamId}/retro/{id}/icebreaker/roll` | Pick a new random icebreaker question. Facilitator only. |
| `PATCH` | `/api/teams/{teamId}/retro/{id}/speaker` | Advance to next speaker in queue. Facilitator only. Body: `{ speakerId? }` to jump. |
| `PATCH` | `/api/teams/{teamId}/retro/{id}/discuss` | Set active discussion card. Body: `{ cardId }`. Facilitator only. |
| `POST` | `/api/teams/{teamId}/retro/{id}/action-items` | Create action item from retro. Reuses existing `action_items` table with `type = Retro`. |

### Phase Transition Logic (server-side)

When `POST .../advance` is called, the backend runs side-effects before saving the new phase:

| From → To | Side-effects |
|---|---|
| `CheckIn → Icebreaker` | Generate `speaker_order_json` (shuffle team member IDs). Set `current_speaker_id` to first. Pick random icebreaker question. |
| `Write → Group` | Set `is_revealed = true` on all cards in this session. |
| `Vote → Discuss` | If `hide_votes_until_revealed = true`: no-op (votes already exist, just now rendered). Order cards client-side by vote total. |
| `Discuss → WrapUp` | No server side-effect. |
| `WrapUp → Completed` | Set session `phase = Completed`. Optionally update sprint `status = Completed`. |

---

## Data Model Notes

Everything already exists in the DB. No new migrations needed for core retro. Optional additions:

- Add `facilitator_id uuid references auth.users(id)` to `retro_sessions` (currently inferred from sprint champion or first user — worth making explicit)
- Add `is_discussed boolean default false` to `retro_cards` for tracking discussed cards in Discuss phase
- Add `reactions_json text` to `retro_cards` if emoji reactions are implemented  
- Add `timer_seconds int` to `retro_sessions` for phase timer config

> These are small and can be added in a `004_retro_improvements.sql` migration.

---

## Frontend Component Tree

```
RetroPage (page.tsx)
├── RetroHeader          — sprint name, phase progress bar, facilitator badge
├── FacilitatorBar       — "Advance to [next phase]" button + phase config (facilitator only)
│
├── CheckInPanel         — mood picker, avatar progress grid
├── IcebreakerPanel      — question card, speaker spotlight, queue strip, re-roll button
├── WritePanel           — columns grid, card input per column, face-down others' cards
├── GroupPanel           — full card board, drag-to-group, group labels
├── VotePanel            — cards with vote dots, budget counter
├── DiscussPanel         — sorted card list, spotlight card, collab notes, action item creator
└── WrapUpPanel          — mood delta, session summary, action items list, complete button

Shared components:
├── RetroCardComponent   — card UI used in Write/Group/Vote/Discuss (adapts per phase)
├── MoodPicker           — 1–5 emoji selector
├── PhaseProgressBar     — visual step indicator (8 phases)
├── ParticipantAvatars   — avatar strip with status (checked-in, voted, etc.)
└── ActionItemCreator    — inline form to create action item from retro
```

---

## Route

```
/dashboard/retro?sprintId={sprintId}&teamId={teamId}
```

or team-scoped:

```
/dashboard/teams/[teamId]/sprints/[sprintId]/retro
```

Consistent with how sprint planning is already routed as `/dashboard/planning?sprintId=...`.

---

## Open Questions / Decisions to Make

| # | Question | Options |
|---|---|---|
| 1 | **Who can group cards?** | Facilitator only vs. everyone simultaneously |
| 2 | **Author reveal after vote?** | Never / Optional toggle / Always revealed in Discuss |
| 3 | **Vote count reset?** | Can a user change their votes during Vote phase, or are they locked once submitted? |
| 4 | **Column config — when?** | At session creation only, or can facilitator change columns during Write phase? |
| 5 | **Multiple retros per sprint?** | Currently schema enforces 1 per sprint (`unique` on `sprint_id`). Keep that? |
| 6 | **Facilitator transfer** | Should a facilitator be able to hand off control mid-session? |
| 7 | **Timer** | Built-in phase timer, or is manual facilitator control enough? |

---

## Nice-to-Have Ideas (Post-MVP)

| Idea | Notes |
|---|---|
| **AI card grouping suggestions** | Send cards to OpenAI, return suggested groups. Facilitator approves. |
| **AI retro summary** | End-of-session: generate a 3-bullet summary of themes + action items. |
| **Emoji reactions on cards** | Lightweight engagement during Discuss phase. `reactions_json` on card. |
| **Export summary** | PDF or markdown export of the retro (cards + votes + action items + mood). |
| **Mood trend chart** | Compare entry/exit mood across last N retros on the Health Dashboard. |
| **Kudos column** | Special "Shoutout 🎉" column — cards highlighted in gold, not voted on. |
| **"Parking lot"** | Tag cards for async follow-up without creating a formal action item. |
| **Confetti at WrapUp** | `canvas-confetti` npm package, triggered when facilitator completes the retro. |
| **Previous retro quick-view** | Sidebar panel: last retro's top voted cards + unresolved action items. |
| **Anonymous mode** | Author is never revealed, even in Discuss phase. Toggle at session creation. |
