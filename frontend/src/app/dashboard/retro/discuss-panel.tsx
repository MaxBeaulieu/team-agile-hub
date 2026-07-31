"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { groupCards, type CardGroup } from "@/lib/retro-groups";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  ListChecks,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  RetroSession,
  RetroCard,
  TeamMemberData,
  ActionItemData,
} from "./page";

type Props = {
  session: RetroSession;
  cards: RetroCard[];
  teamMembers: TeamMemberData[];
  actionItems: ActionItemData[];
  currentUserId: string;
  teamId: string;
  isFacilitator: boolean;
  onRefresh: () => void;
};

// Inline debounced notes editor per card
function NotesEditor({
  card,
  session,
  teamId,
  onRefresh,
}: {
  card: RetroCard;
  session: RetroSession;
  teamId: string;
  onRefresh: () => void;
}) {
  const [notes, setNotes] = useState(card.discussionNotes ?? "");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setNotes(val);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.patch(
          `/api/teams/${teamId}/retro/${session.id}/cards/${card.id}`,
          {
            discussionNotes: val,
          },
        );
        onRefresh();
      } catch {
        /* ignore transient save errors */
      }
    }, 700);
  }

  return (
    <textarea
      ref={textareaRef}
      value={notes}
      onChange={handleChange}
      placeholder="Discussion notes… (shared, last-write-wins)"
      rows={2}
      className="w-full resize-none bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/60 leading-snug"
      style={{ minHeight: "2.5rem" }}
    />
  );
}

// Action items already saved against a card — kept visible so they don't
// vanish the moment they're created (EE-160).
export function CardActionItems({
  items,
  teamMembers,
  className,
}: Readonly<{
  items: ActionItemData[];
  teamMembers: TeamMemberData[];
  className?: string;
}>) {
  if (items.length === 0) return null;

  return (
    <ul className={["space-y-1", className].filter(Boolean).join(" ")}>
      {items.map((item) => {
        const assignee = item.assigneeId
          ? teamMembers.find((m) => m.userId === item.assigneeId)?.displayName
          : null;
        return (
          <li
            key={item.id}
            className="flex items-start gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-[11px] leading-snug"
          >
            <ListChecks className="size-3 shrink-0 mt-0.5 text-primary" />
            <span className="break-words min-w-0">{item.text}</span>
            <span className="ml-auto shrink-0 text-muted-foreground">
              {assignee ?? "Unassigned"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// Action item creator attached to a specific card
function ActionItemCreator({
  card,
  session,
  teamMembers,
  teamId,
  onRefresh,
}: {
  card: RetroCard;
  session: RetroSession;
  teamMembers: TeamMemberData[];
  teamId: string;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await api.post(`/api/teams/${teamId}/retro/${session.id}/action-items`, {
        text: trimmed,
        assigneeId: assignee || null,
        retroCardId: card.id,
      });
      setText("");
      setAssignee("");
      setOpen(false);
      onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create action item",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
      >
        <Plus className="size-3" /> Add action item
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") create();
        }}
        placeholder="Action item text…"
        autoFocus
        className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center gap-2">
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="flex-1 bg-transparent text-xs border border-border rounded px-1 py-0.5 outline-none text-muted-foreground"
        >
          <option value="">Unassigned</option>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={create}
          disabled={saving || !text.trim()}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// One discussion topic: a single card, or a whole group collapsed into one
// entry so grouped cards aren't discussed (and counted) twice.
function DiscussionTopic({
  group,
  isActive,
  isFacilitator,
  session,
  teamMembers,
  topicActionItems,
  teamId,
  onRefresh,
  onSetActive,
}: Readonly<{
  group: CardGroup<RetroCard>;
  isActive: boolean;
  isFacilitator: boolean;
  session: RetroSession;
  teamMembers: TeamMemberData[];
  topicActionItems: ActionItemData[];
  teamId: string;
  onRefresh: () => void;
  onSetActive: (cardId: string) => void;
}>) {
  const [marking, setMarking] = useState(false);

  const anchor =
    group.cards.find((c) => c.id === group.anchorId) ?? group.cards[0];
  // A group is discussed once every card in it is.
  const isDiscussed = group.cards.every((c) => c.isDiscussed);
  // Notes written before the cards were grouped live on whichever card holds
  // them; keep editing that one so nothing is orphaned.
  const notesCard =
    group.cards.find((c) => c.discussionNotes?.trim()) ?? anchor;
  const title = group.isGroup
    ? (group.label ?? anchor.content)
    : anchor.content;

  async function toggleDiscussed() {
    const next = !isDiscussed;
    setMarking(true);
    try {
      await Promise.all(
        group.cards.map((c) =>
          api.patch(`/api/teams/${teamId}/retro/${session.id}/cards/${c.id}`, {
            isDiscussed: next,
          }),
        ),
      );
      onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to mark discussed",
      );
    } finally {
      setMarking(false);
    }
  }

  const statusIcon = isDiscussed ? (
    <CheckCircle2 className="size-4 text-primary shrink-0" />
  ) : (
    <Circle className="size-4 text-muted-foreground shrink-0" />
  );

  let toneClass = "border-border bg-card";
  if (isActive) toneClass = "border-primary bg-primary/5 shadow-md";
  else if (isDiscussed) toneClass = "border-border bg-muted/30 opacity-60";

  return (
    <div className={`rounded-xl border-2 transition-all ${toneClass}`}>
      <div className="px-4 py-3 space-y-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {isFacilitator ? (
              <button
                onClick={toggleDiscussed}
                disabled={marking}
                aria-pressed={isDiscussed}
                title={
                  isDiscussed ? "Mark as not discussed" : "Mark as discussed"
                }
                className="shrink-0 rounded-full text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
              >
                {statusIcon}
              </button>
            ) : (
              statusIcon
            )}
            <p className="text-sm leading-snug whitespace-pre-wrap break-words">
              {title}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {group.totalVotes > 0 && (
              <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[11px] font-semibold px-2 py-0.5 tabular-nums">
                {group.totalVotes} 🔥
              </span>
            )}
          </div>
        </div>

        {/* Grouped cards: the individual card texts behind this one topic */}
        {group.isGroup && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.cards.length} cards
            </p>
            <ul className="space-y-1">
              {group.cards.map((card) => (
                <li
                  key={card.id}
                  className="rounded-md border border-border/60 bg-card px-2 py-1.5 text-xs leading-snug whitespace-pre-wrap break-words"
                >
                  {card.content}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Notes editor (only on the spotlight topic) */}
        {isActive && (
          <div className="mt-2 rounded-md border border-border bg-background px-2.5 py-2">
            <NotesEditor
              card={notesCard}
              session={session}
              teamId={teamId}
              onRefresh={onRefresh}
            />
          </div>
        )}

        {/* Saved notes stay readable once the topic is no longer the spotlight */}
        {!isActive && notesCard.discussionNotes?.trim() && (
          <p className="mt-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground whitespace-pre-wrap break-words">
            {notesCard.discussionNotes}
          </p>
        )}

        {/* Action items saved on any card in this topic */}
        <CardActionItems
          items={topicActionItems}
          teamMembers={teamMembers}
          className="pt-1"
        />

        {/* Action items + controls */}
        {isActive && (
          <div className="space-y-2 pt-1">
            <ActionItemCreator
              card={anchor}
              session={session}
              teamMembers={teamMembers}
              teamId={teamId}
              onRefresh={onRefresh}
            />
            {isFacilitator && !isDiscussed && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={toggleDiscussed}
                disabled={marking}
              >
                <CheckCircle2 className="size-3" />
                Mark Discussed
              </Button>
            )}
          </div>
        )}

        {/* Jump to topic (facilitator, non-active) */}
        {isFacilitator && !isActive && !isDiscussed && (
          <button
            onClick={() => onSetActive(anchor.id)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
          >
            <ChevronRight className="size-3" /> Discuss this
          </button>
        )}
      </div>
    </div>
  );
}

export function DiscussPanel({
  session,
  cards,
  teamMembers,
  actionItems,
  currentUserId,
  teamId,
  isFacilitator,
  onRefresh,
}: Props) {
  const [settingActive, setSettingActive] = useState(false);

  async function setActiveCard(cardId: string) {
    if (settingActive) return;
    setSettingActive(true);
    try {
      await api.patch(`/api/teams/${teamId}/retro/${session.id}/discuss`, {
        cardId,
        isDiscussed: false,
      });
      onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to set active card",
      );
    } finally {
      setSettingActive(false);
    }
  }

  // Votes belong to the group a card sits in, not to the individual card
  const groups = groupCards(cards);
  const isGroupDiscussed = (g: CardGroup<RetroCard>) =>
    g.cards.every((c) => c.isDiscussed);

  // Sort: not-discussed by votes desc, then discussed
  const sorted = [...groups].sort((a, b) => {
    const aDone = isGroupDiscussed(a);
    const bDone = isGroupDiscussed(b);
    if (aDone !== bDone) return aDone ? 1 : -1;
    const diff = b.totalVotes - a.totalVotes;
    if (diff !== 0) return diff;
    return a.key.localeCompare(b.key);
  });

  const discussedCount = groups.filter(isGroupDiscussed).length;
  const totalTopics = groups.length;

  const itemsByCard = actionItems.reduce<Record<string, ActionItemData[]>>(
    (acc, item) => {
      if (item.retroCardId) {
        const bucket = acc[item.retroCardId] ?? [];
        bucket.push(item);
        acc[item.retroCardId] = bucket;
      }
      return acc;
    },
    {},
  );

  return (
    <div className="p-6 space-y-4 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Discuss</h2>
          <p className="text-xs text-muted-foreground">
            Cards sorted by votes. Facilitator selects what to discuss next.
          </p>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums shrink-0">
          {discussedCount}/{totalTopics} topics discussed
        </div>
      </div>

      {/* Progress */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{
            width:
              totalTopics > 0
                ? `${(discussedCount / totalTopics) * 100}%`
                : "0%",
          }}
        />
      </div>

      {/* Topics */}
      <div className="space-y-3">
        {sorted.map((group) => (
          <DiscussionTopic
            key={group.key}
            group={group}
            isActive={group.cards.some(
              (c) => c.id === session.activeDiscussionCardId,
            )}
            isFacilitator={isFacilitator}
            session={session}
            teamMembers={teamMembers}
            topicActionItems={group.cards.flatMap(
              (c) => itemsByCard[c.id] ?? [],
            )}
            teamId={teamId}
            onRefresh={onRefresh}
            onSetActive={setActiveCard}
          />
        ))}
      </div>
    </div>
  );
}
