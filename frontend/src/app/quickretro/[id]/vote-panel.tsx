"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { groupCards, sumMyVotes, type CardGroup } from "@/lib/retro-groups";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import type { RetroSession, RetroCard } from "./page";

type Props = {
  session: RetroSession;
  cards: RetroCard[];
  currentUserId: string;
  onRefresh: () => void;
};

type VoteMap = Record<string, number>; // anchor cardId → count

function VoteGroup({
  group,
  myVotes,
  maxVotes,
  usedVotes,
  onChange,
}: {
  group: CardGroup<RetroCard>;
  myVotes: number;
  maxVotes: number;
  usedVotes: number;
  onChange: (anchorId: string, delta: number) => void;
}) {
  const remaining = maxVotes - usedVotes;

  // Total visible votes across the whole group (server already hides others' if needed)
  const totalVotes = group.totalVotes;

  return (
    <div
      className={[
        "rounded-lg border px-3 py-2.5 space-y-2",
        group.isGroup
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-card",
      ].join(" ")}
    >
      {group.label && (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
          {group.label}
        </p>
      )}

      {group.isGroup ? (
        <ul className="space-y-1">
          {group.cards.map((card) => (
            <li
              key={card.id}
              className="rounded-md border border-border/60 bg-card px-2 py-1.5 text-sm leading-snug whitespace-pre-wrap break-words"
            >
              {card.content}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-snug whitespace-pre-wrap break-words">
          {group.cards[0].content}
        </p>
      )}

      <div className="flex items-center justify-between">
        {/* Vote controls for own votes */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange(group.anchorId, -1)}
            disabled={myVotes === 0}
            className="size-6 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Minus className="size-3" />
          </button>
          <span className="text-sm font-semibold tabular-nums w-4 text-center">
            {myVotes}
          </span>
          <button
            onClick={() => onChange(group.anchorId, +1)}
            disabled={remaining === 0}
            className="size-6 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="size-3" />
          </button>
        </div>

        {/* Total visible votes */}
        {totalVotes > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

export function VotePanel({
  session,
  cards,
  currentUserId,
  onRefresh,
}: Props) {
  const columns: string[] = JSON.parse(session.columnsJson);
  const maxVotes = session.voteCount;

  // Grouped cards are voted on as a single item; the group's anchor card holds the votes.
  const groups = groupCards(cards);
  const columnOf = (group: CardGroup<RetroCard>) =>
    (group.cards.find((c) => c.id === group.anchorId) ?? group.cards[0]).column;

  // Initialize my votes from server state (votes anywhere in a group count for the group)
  function initVotes(): VoteMap {
    const map: VoteMap = {};
    for (const group of groups) {
      map[group.anchorId] = sumMyVotes(group.cards, currentUserId);
    }
    return map;
  }

  const [myVotes, setMyVotes] = useState<VoteMap>(initVotes);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);

  // Re-sync from the server unless the user has unsaved local vote changes.
  useEffect(() => {
    if (!syncTimer.current) {
      setMyVotes(initVotes());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const usedVotes = Object.values(myVotes).reduce((a, b) => a + b, 0);

  const syncVotes = useCallback(
    async (votes: VoteMap) => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      try {
        const entries = Object.entries(votes)
          .filter(([, count]) => count > 0)
          .map(([cardId, count]) => ({ cardId, count }));
        await api.put(`/api/quickretro/${session.id}/votes`, entries);
        onRefresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to save votes",
        );
      } finally {
        isSyncing.current = false;
      }
    },
    [session.id, onRefresh],
  );

  function handleChange(anchorId: string, delta: number) {
    setMyVotes((prev) => {
      const current = prev[anchorId] ?? 0;
      const used = Object.values(prev).reduce((a, b) => a + b, 0);

      if (delta > 0 && used >= maxVotes) return prev;
      if (delta < 0 && current === 0) return prev;

      const next = { ...prev, [anchorId]: current + delta };

      // Debounce sync
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        syncTimer.current = null;
        syncVotes(next);
      }, 800);

      return next;
    });
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header + budget */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Vote</h2>
          <p className="text-xs text-muted-foreground">
            Distribute your votes across cards. Grouped cards are voted on as
            one item.
          </p>
        </div>
        <div className="shrink-0 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tabular-nums">
          {usedVotes} / {maxVotes} votes used
        </div>
      </div>

      {/* Budget bar */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={[
            "h-full rounded-full transition-all",
            usedVotes >= maxVotes ? "bg-amber-500" : "bg-primary",
          ].join(" ")}
          style={{ width: `${Math.min((usedVotes / maxVotes) * 100, 100)}%` }}
        />
      </div>

      {/* Card columns */}
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
        }}
      >
        {columns.map((col) => {
          const colGroups = groups.filter((g) => columnOf(g) === col);
          return (
            <div key={col} className="space-y-2.5 min-w-0">
              <h3 className="text-sm font-semibold">{col}</h3>
              {colGroups.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No cards</p>
              ) : (
                colGroups.map((group) => (
                  <VoteGroup
                    key={group.key}
                    group={group}
                    myVotes={myVotes[group.anchorId] ?? 0}
                    maxVotes={maxVotes}
                    usedVotes={usedVotes}
                    onChange={handleChange}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
