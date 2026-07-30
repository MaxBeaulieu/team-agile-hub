"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2, ChevronRight, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RetroSession, RetroCard } from "./page";

type Props = {
  session: RetroSession;
  cards: RetroCard[];
  isFacilitator: boolean;
  onRefresh: () => void;
};

// Inline debounced notes editor per card
function NotesEditor({
  card,
  session,
  onRefresh,
}: {
  card: RetroCard;
  session: RetroSession;
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
        await api.patch(`/api/quickretro/${session.id}/cards/${card.id}`, {
          discussionNotes: val,
        });
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

// A highlighted discussion card (the "spotlight" card)
function DiscussionCard({
  card,
  isActive,
  isFacilitator,
  session,
  onRefresh,
  onSetActive,
}: {
  card: RetroCard;
  isActive: boolean;
  isFacilitator: boolean;
  session: RetroSession;
  onRefresh: () => void;
  onSetActive: (cardId: string) => void;
}) {
  const [marking, setMarking] = useState(false);

  async function markDiscussed() {
    setMarking(true);
    try {
      await api.patch(`/api/quickretro/${session.id}/cards/${card.id}`, {
        isDiscussed: true,
      });
      onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to mark discussed",
      );
    } finally {
      setMarking(false);
    }
  }

  const totalVotes = card.retro_votes.reduce((a, v) => a + v.count, 0);

  return (
    <div
      className={[
        "rounded-xl border-2 transition-all",
        isActive
          ? "border-primary bg-primary/5 shadow-md"
          : card.isDiscussed
            ? "border-border bg-muted/30 opacity-60"
            : "border-border bg-card",
      ].join(" ")}
    >
      <div className="px-4 py-3 space-y-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {card.isDiscussed ? (
              <CheckCircle2 className="size-4 text-primary shrink-0" />
            ) : (
              <Circle className="size-4 text-muted-foreground shrink-0" />
            )}
            <p className="text-sm leading-snug whitespace-pre-wrap break-words">
              {card.content}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {totalVotes > 0 && (
              <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[11px] font-semibold px-2 py-0.5 tabular-nums">
                {totalVotes} 🔥
              </span>
            )}
          </div>
        </div>

        {/* Group label */}
        {card.groupLabel && (
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {card.groupLabel}
          </p>
        )}

        {/* Notes editor (only on active card) */}
        {isActive && (
          <div className="mt-2 rounded-md border border-border bg-background px-2.5 py-2">
            <NotesEditor card={card} session={session} onRefresh={onRefresh} />
          </div>
        )}

        {/* Saved notes stay readable once the card is no longer the spotlight */}
        {!isActive && card.discussionNotes?.trim() && (
          <p className="mt-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground whitespace-pre-wrap break-words">
            {card.discussionNotes}
          </p>
        )}

        {/* Controls */}
        {isActive && (
          <div className="space-y-2 pt-1">
            {isFacilitator && !card.isDiscussed && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={markDiscussed}
                disabled={marking}
              >
                <CheckCircle2 className="size-3" />
                Mark Discussed
              </Button>
            )}
          </div>
        )}

        {/* Jump to card (facilitator, non-active) */}
        {isFacilitator && !isActive && !card.isDiscussed && (
          <button
            onClick={() => onSetActive(card.id)}
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
  isFacilitator,
  onRefresh,
}: Props) {
  const [settingActive, setSettingActive] = useState(false);

  async function setActiveCard(cardId: string) {
    if (settingActive) return;
    setSettingActive(true);
    try {
      await api.patch(`/api/quickretro/${session.id}/discuss`, {
        cardId,
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

  // Sort: not-discussed by votes desc, then discussed
  const sorted = [...cards].sort((a, b) => {
    if (a.isDiscussed !== b.isDiscussed) return a.isDiscussed ? 1 : -1;
    const va = a.retro_votes.reduce((s, v) => s + v.count, 0);
    const vb = b.retro_votes.reduce((s, v) => s + v.count, 0);
    return vb - va;
  });

  const discussedCount = cards.filter((c) => c.isDiscussed).length;
  const totalCards = cards.length;

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
          {discussedCount}/{totalCards} discussed
        </div>
      </div>

      {/* Progress */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{
            width:
              totalCards > 0 ? `${(discussedCount / totalCards) * 100}%` : "0%",
          }}
        />
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {sorted.map((card) => (
          <DiscussionCard
            key={card.id}
            card={card}
            isActive={card.id === session.activeDiscussionCardId}
            isFacilitator={isFacilitator}
            session={session}
            onRefresh={onRefresh}
            onSetActive={setActiveCard}
          />
        ))}
      </div>
    </div>
  );
}
