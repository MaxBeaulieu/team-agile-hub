"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { CardActionItems } from "./discuss-panel";
import type {
  RetroSession,
  MoodCheckin,
  RetroCard,
  TeamMemberData,
  ActionItemData,
} from "./page";

const MOODS = [
  { value: 1, emoji: "😔", label: "Not great" },
  { value: 2, emoji: "😕", label: "Meh" },
  { value: 3, emoji: "😐", label: "Ok" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
];

type Props = {
  session: RetroSession;
  cards: RetroCard[];
  moodCheckins: MoodCheckin[];
  teamMembers: TeamMemberData[];
  actionItems: ActionItemData[];
  currentUserId: string;
  isFacilitator: boolean;
  onRefresh: () => void;
};

// Action items sharing a card are rendered together, with the card shown once.
type ActionItemGroup = {
  key: string;
  card: RetroCard | null;
  items: ActionItemData[];
};

function MoodSummary({
  moodCheckins,
  label,
}: {
  moodCheckins: MoodCheckin[];
  label: string;
}) {
  const moods = moodCheckins
    .map((m) => (label === "entry" ? m.entryMood : m.exitMood))
    .filter((v): v is number => v !== null);

  if (moods.length === 0) return null;

  const avg = moods.reduce((a, b) => a + b, 0) / moods.length;
  const avgMood = MOODS.find((m) => m.value === Math.round(avg));

  const dist = MOODS.map((m) => ({
    ...m,
    count: moods.filter((v) => v === m.value).length,
  }));

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label === "entry" ? "Entry Mood" : "Exit Mood"}
      </p>
      <div className="flex items-end gap-2 h-12">
        {dist.map((m) => (
          <div
            key={m.value}
            className="flex flex-col items-center gap-1 flex-1"
          >
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {m.count > 0 ? m.count : ""}
            </span>
            <div
              className="w-full rounded-t bg-primary/60 transition-all min-h-[2px]"
              style={{ height: `${(m.count / moods.length) * 40}px` }}
            />
            <span className="text-base leading-none">{m.emoji}</span>
          </div>
        ))}
      </div>
      {avgMood && (
        <p className="text-xs text-muted-foreground text-center">
          Average: {avgMood.emoji} {avgMood.label} ({avg.toFixed(1)})
        </p>
      )}
    </div>
  );
}

export function WrapUpPanel({
  session,
  cards,
  moodCheckins,
  teamMembers,
  actionItems,
  currentUserId,
  isFacilitator,
  onRefresh,
}: Props) {
  const [saving, setSaving] = useState(false);
  const myCheckin = moodCheckins.find((m) => m.userId === currentUserId);
  const myExitMood = myCheckin?.exitMood ?? null;

  async function pickExitMood(value: number) {
    if (saving) return;
    setSaving(true);
    try {
      await api.post(`/api/quickretro/${session.id}/mood`, {
        exitMood: value,
      });
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save mood");
    } finally {
      setSaving(false);
    }
  }

  // Entry vs exit mood comparison
  const exitCheckedCount = moodCheckins.filter(
    (m) => m.exitMood !== null,
  ).length;
  const totalMembers = teamMembers.length;

  // Action items grouped by the card they came from, so a card with several
  // items reads as one row instead of repeating the card (EE-160).
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const actionGroups = actionItems.reduce<ActionItemGroup[]>((acc, item) => {
    const card = item.retroCardId
      ? (cardById.get(item.retroCardId) ?? null)
      : null;
    const key = card?.id ?? "unlinked";
    const existing = acc.find((g) => g.key === key);
    if (existing) existing.items.push(item);
    else acc.push({ key, card, items: [item] });
    return acc;
  }, []);

  // Once the retro is completed this panel is a read-only recap — no more input.
  const isCompleted = session.phase === "Completed";

  return (
    <div className="flex flex-col gap-8 p-8 max-w-xl mx-auto w-full">
      {/* Title */}
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold">Wrap-Up</h2>
        <p className="text-sm text-muted-foreground">
          {isCompleted
            ? "Session summary."
            : "Submit your exit mood and review the session summary."}
        </p>
      </div>

      {/* Exit mood picker */}
      {!isCompleted && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-center">
            How are you feeling after this retro?
          </p>
          <div className="flex justify-center gap-3">
            {MOODS.map((m) => (
              <button
                key={m.value}
                onClick={() => pickExitMood(m.value)}
                disabled={saving}
                title={m.label}
                className={[
                  "flex flex-col items-center gap-1.5 rounded-2xl px-3 py-2 text-2xl",
                  "border-2 transition-all hover:scale-110 active:scale-100",
                  myExitMood === m.value
                    ? "border-primary bg-primary/10 scale-110 shadow-md"
                    : "border-border hover:border-primary/40 bg-card",
                  saving ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
                ].join(" ")}
              >
                {m.emoji}
                <span className="text-[10px] text-muted-foreground font-medium">
                  {m.label}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center tabular-nums">
            {exitCheckedCount}/{totalMembers} submitted exit mood
          </p>
        </div>
      )}

      {/* Mood comparison */}
      <div className="grid grid-cols-2 gap-6 rounded-xl border border-border bg-card p-4">
        <MoodSummary moodCheckins={moodCheckins} label="entry" />
        <MoodSummary moodCheckins={moodCheckins} label="exit" />
      </div>

      {/* Action items */}
      {actionGroups.length > 0 && (
        <div className="@container space-y-2">
          <p className="text-sm font-semibold">Action Items</p>
          {actionGroups.map((group) => (
            <div
              key={group.key}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2.5 @sm:flex-row @sm:items-start"
            >
              <CardActionItems items={group.items} className="flex-1 min-w-0" />
              <div className="shrink-0 border-t border-border pt-2 @sm:w-40 @sm:border-t-0 @sm:border-l @sm:pl-3 @sm:pt-0">
                {group.card ? (
                  <>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {group.card.column}
                    </p>
                    <p className="text-[11px] leading-snug text-muted-foreground break-words line-clamp-3">
                      {group.card.content}
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] italic text-muted-foreground">
                    Not linked to a card
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top voted cards */}
      {cards.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Top Voted Cards</p>
          {[...cards]
            .sort((a, b) => {
              const va = a.retro_votes.reduce((s, v) => s + v.count, 0);
              const vb = b.retro_votes.reduce((s, v) => s + v.count, 0);
              return vb - va;
            })
            .slice(0, 5)
            .map((card) => {
              const votes = card.retro_votes.reduce((s, v) => s + v.count, 0);
              const notes = card.discussionNotes?.trim();
              return (
                <div
                  key={card.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
                >
                  <div className="flex items-center gap-1.5 shrink-0">
                    {card.isDiscussed ? (
                      <CheckCircle2 className="size-3.5 text-primary" />
                    ) : (
                      <div className="size-3.5 rounded-full border border-border" />
                    )}
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                      {votes > 0 ? `${votes}🔥` : "—"}
                    </span>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-[11px] text-muted-foreground font-medium">
                      {card.column}
                    </p>
                    <p className="text-xs leading-snug whitespace-pre-wrap break-words">
                      {card.content}
                    </p>
                    {notes && (
                      <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground whitespace-pre-wrap break-words">
                        {notes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Facilitator: complete session */}
      {isFacilitator && !isCompleted && (
        <p className="text-xs text-muted-foreground text-center">
          Use the <strong>Complete Retro</strong> button in the header to finish
          the session.
        </p>
      )}
    </div>
  );
}
