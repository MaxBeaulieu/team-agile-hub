"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { RetroSession, MoodCheckin, TeamMemberData } from "./page";
import { CheckCircle2 } from "lucide-react";

const MOODS = [
  { value: 1, emoji: "😔", label: "Not great" },
  { value: 2, emoji: "😕", label: "Meh" },
  { value: 3, emoji: "😐", label: "Ok" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
];

type Props = {
  session: RetroSession;
  moodCheckins: MoodCheckin[];
  teamMembers: TeamMemberData[];
  currentUserId: string;
  onRefresh: () => void;
};

export function CheckInPanel({
  session,
  moodCheckins,
  teamMembers,
  currentUserId,
  onRefresh,
}: Props) {
  const [saving, setSaving] = useState(false);

  const myCheckin = moodCheckins.find((m) => m.userId === currentUserId);
  const myMood = myCheckin?.entryMood ?? null;

  async function pickMood(value: number) {
    if (saving) return;
    setSaving(true);
    try {
      await api.post(`/api/quickretro/${session.id}/mood`, {
        entryMood: value,
      });
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save mood");
    } finally {
      setSaving(false);
    }
  }

  const checkedInSet = new Set(
    moodCheckins.filter((m) => m.entryMood !== null).map((m) => m.userId),
  );
  const count = checkedInSet.size;
  const total = teamMembers.length;

  return (
    <div className="flex flex-col items-center justify-center gap-10 p-10">
      {/* Title */}
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold">Check-In</h2>
        <p className="text-sm text-muted-foreground">
          How are you feeling heading into this retro?
        </p>
      </div>

      {/* Mood picker */}
      <div className="flex gap-3">
        {MOODS.map((m) => {
          const selected = myMood === m.value;
          return (
            <button
              key={m.value}
              onClick={() => pickMood(m.value)}
              disabled={saving}
              title={m.label}
              className={[
                "flex flex-col items-center gap-1.5 rounded-2xl px-4 py-3 text-2xl",
                "border-2 transition-all hover:scale-110 active:scale-100",
                selected
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
          );
        })}
      </div>

      {myMood && (
        <p className="text-sm text-muted-foreground -mt-4">
          You selected {MOODS.find((m) => m.value === myMood)?.emoji} — click to
          change
        </p>
      )}

      {/* Team status */}
      <div className="w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Team check-in</span>
          <span className="font-medium tabular-nums">
            {count}/{total}
          </span>
        </div>

        {/* Progress */}
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: total > 0 ? `${(count / total) * 100}%` : "0%" }}
          />
        </div>

        {/* Avatar grid */}
        <div className="flex flex-wrap gap-2 pt-1">
          {teamMembers.map((m) => {
            const checkedIn = checkedInSet.has(m.userId);
            const initials = m.displayName
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            const myMoodEntry = moodCheckins.find(
              (c) => c.userId === m.userId,
            )?.entryMood;
            const emojiDisplay = myMoodEntry
              ? MOODS.find((mo) => mo.value === myMoodEntry)?.emoji
              : null;
            return (
              <div
                key={m.id}
                title={`${m.displayName}${checkedIn ? ` — ${MOODS.find((mo) => mo.value === myMoodEntry)?.label}` : " — not checked in"}`}
                className="relative flex flex-col items-center gap-0.5"
              >
                <div
                  className={[
                    "size-10 rounded-full flex items-center justify-center text-sm font-medium",
                    "border-2 transition-colors",
                    checkedIn
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {emojiDisplay ?? initials}
                </div>
                {checkedIn && (
                  <CheckCircle2 className="size-3 text-primary absolute -bottom-0.5 -right-0.5 bg-background rounded-full" />
                )}
                <span className="text-[10px] text-muted-foreground max-w-[44px] truncate text-center leading-tight">
                  {m.displayName.split(" ")[0]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
