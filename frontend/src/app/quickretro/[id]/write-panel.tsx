"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RetroSession, RetroCard } from "./page";

type Props = {
  session: RetroSession;
  cards: RetroCard[];
  hiddenCounts: Record<string, number>;
  currentUserId: string;
  onRefresh: () => void;
};

function CardColumn({
  column,
  cards,
  hiddenCount,
  currentUserId,
  session,
  onRefresh,
}: {
  column: string;
  cards: RetroCard[];
  hiddenCount: number;
  currentUserId: string;
  session: RetroSession;
  onRefresh: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function addCard() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await api.post(`/api/quickretro/${session.id}/cards`, {
        column,
        content: trimmed,
      });
      setText("");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add card");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCard(cardId: string) {
    setDeletingId(cardId);
    try {
      await api.delete(`/api/quickretro/${session.id}/cards/${cardId}`);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete card");
    } finally {
      setDeletingId(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addCard();
    }
  }

  // Auto-resize textarea
  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }

  const myCards = cards.filter((c) => c.column === column);

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {/* Column header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{column}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {myCards.length} card{myCards.length !== 1 ? "s" : ""}
          {hiddenCount > 0 && ` · ${hiddenCount} hidden`}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2">
        {myCards.map((card) => (
          <div
            key={card.id}
            className="group rounded-lg border border-border bg-card px-3 py-2.5 text-sm leading-snug relative"
          >
            <p className="pr-5 whitespace-pre-wrap break-words">
              {card.content}
            </p>
            {card.authorId === currentUserId && (
              <button
                onClick={() => deleteCard(card.id)}
                disabled={deletingId === card.id}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}

        {/* Hidden placeholders */}
        {hiddenCount > 0 && (
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: Math.min(hiddenCount, 3) }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-lg border border-dashed border-border bg-muted/30 animate-pulse"
              />
            ))}
            {hiddenCount > 3 && (
              <p className="text-xs text-center text-muted-foreground">
                +{hiddenCount - 3} more hidden
              </p>
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="rounded-lg border border-border bg-card overflow-hidden focus-within:ring-1 focus-within:ring-primary transition-shadow">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={`Add to "${column}"…`}
          rows={2}
          className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="flex justify-end px-2 pb-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs gap-1"
            onClick={addCard}
            disabled={saving || !text.trim()}
          >
            <Plus className="size-3" /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}

export function WritePanel({
  session,
  cards,
  hiddenCounts,
  currentUserId,
  onRefresh,
}: Props) {
  const columns: string[] = JSON.parse(session.columnsJson);

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Write</h2>
        <p className="text-xs text-muted-foreground">
          Add cards to any column. Cards are hidden from others until the next
          phase. Press Enter to add quickly.
        </p>
      </div>

      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
        }}
      >
        {columns.map((col) => (
          <CardColumn
            key={col}
            column={col}
            cards={cards.filter((c) => c.column === col)}
            hiddenCount={hiddenCounts[col] ?? 0}
            currentUserId={currentUserId}
            session={session}
            onRefresh={onRefresh}
          />
        ))}
      </div>
    </div>
  );
}
