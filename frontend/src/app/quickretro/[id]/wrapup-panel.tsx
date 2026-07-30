"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import type {
  RetroSession,
  MoodCheckin,
  RetroCard,
  TeamMemberData,
} from "./page";
import type { RosterMember } from "@/components/retro/types";

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
  roster: RosterMember[];
  currentUserId: string;
  isFacilitator: boolean;
  onRefresh: () => void;
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
  roster,
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

  // Action items = retro cards that were marked with type = action
  // We surface this from discuss panel server data; for wrapup we just show discussed stats
  const discussedCards = cards.filter((c) => c.isDiscussed);
  const totalCards = cards.length;

  // Entry vs exit mood comparison — measured against who's actually here.
  const rosterUserIds = new Set(roster.map((m) => m.userId));
  const exitCheckedCount = moodCheckins.filter(
    (m) => m.exitMood !== null && rosterUserIds.has(m.userId),
  ).length;
  const totalMembers = roster.length;

  return (
    <div className="flex flex-col gap-8 p-8 max-w-xl mx-auto w-full">
      {/* Title */}
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold">Wrap-Up</h2>
        <p className="text-sm text-muted-foreground">
          Submit your exit mood and review the session summary.
        </p>
      </div>

      {/* Exit mood picker */}
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

      {/* Mood comparison */}
      <div className="grid grid-cols-2 gap-6 rounded-xl border border-border bg-card p-4">
        <MoodSummary moodCheckins={moodCheckins} label="entry" />
        <MoodSummary moodCheckins={moodCheckins} label="exit" />
      </div>

      {/* Session summary */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold">Session Summary</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted p-3">
            <p className="text-2xl font-bold">{totalCards}</p>
            <p className="text-[11px] text-muted-foreground">Cards written</p>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-2xl font-bold">{discussedCards.length}</p>
            <p className="text-[11px] text-muted-foreground">Discussed</p>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-2xl font-bold">{totalMembers}</p>
            <p className="text-[11px] text-muted-foreground">Participants</p>
          </div>
        </div>
      </div>

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
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">
                      {card.column}
                    </p>
                    <p className="text-sm leading-snug">{card.content}</p>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Facilitator: complete session */}
      {isFacilitator && (
        <p className="text-xs text-muted-foreground text-center">
          Use the <strong>Complete Retro</strong> button in the header to finish
          the session.
        </p>
      )}
    </div>
  );
}
