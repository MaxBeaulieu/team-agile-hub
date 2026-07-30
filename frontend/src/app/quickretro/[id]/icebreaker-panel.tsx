"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { RefreshCw, ChevronRight, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RetroSession, TeamMemberData } from "./page";

type Props = {
  session: RetroSession;
  teamMembers: TeamMemberData[];
  currentUserId: string;
  isFacilitator: boolean;
  onRefresh: () => void;
};

export function IcebreakerPanel({
  session,
  teamMembers,
  currentUserId,
  isFacilitator,
  onRefresh,
}: Props) {
  const [rolling, setRolling] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftQuestion, setDraftQuestion] = useState("");

  const speakerOrder: string[] = session.speakerOrderJson
    ? JSON.parse(session.speakerOrderJson)
    : [];

  const currentIndex = speakerOrder.indexOf(session.currentSpeakerId ?? "");
  const upNextId = speakerOrder[currentIndex + 1] ?? null;

  const memberById = Object.fromEntries(teamMembers.map((m) => [m.userId, m]));
  const currentMember = session.currentSpeakerId
    ? memberById[session.currentSpeakerId]
    : null;
  const isMyTurn = session.currentSpeakerId === currentUserId;

  async function reRoll() {
    setRolling(true);
    try {
      await api.post(`/api/quickretro/${session.id}/icebreaker/roll`, {});
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to re-roll");
    } finally {
      setRolling(false);
    }
  }

  // Same endpoint as the re-roll, with the wording supplied instead of picked.
  async function saveQuestion() {
    const question = draftQuestion.trim();
    if (!question) {
      toast.error("Question cannot be empty");
      return;
    }

    setRolling(true);
    try {
      await api.post(`/api/quickretro/${session.id}/icebreaker/roll`, {
        question,
      });
      setEditing(false);
      onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save question",
      );
    } finally {
      setRolling(false);
    }
  }

  async function nextSpeaker() {
    setAdvancing(true);
    try {
      await api.patch(`/api/quickretro/${session.id}/speaker`, {});
      onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to advance speaker",
      );
    } finally {
      setAdvancing(false);
    }
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    <div className="flex flex-col items-center gap-8 p-8 max-w-xl mx-auto w-full">
      {/* Question card */}
      <div className="w-full rounded-2xl border border-border bg-card shadow-sm p-6 text-center space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Icebreaker Question
        </p>

        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draftQuestion}
              onChange={(e) => setDraftQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  saveQuestion();
                }
                if (e.key === "Escape") setEditing(false);
              }}
              rows={2}
              maxLength={500}
              autoFocus
              placeholder="Type your own icebreaker question…"
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-center text-lg font-semibold leading-snug outline-none placeholder:text-sm placeholder:font-normal placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
            />
            <div className="flex items-center justify-center gap-1.5">
              <Button
                size="sm"
                className="gap-1.5 text-xs"
                onClick={saveQuestion}
                disabled={rolling}
              >
                <Check className="size-3" />
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setEditing(false)}
              >
                <X className="size-3" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-lg font-semibold leading-snug">
              {session.icebreakerQuestion ?? "Loading question…"}
            </p>
            {isFacilitator && (
              <div className="flex items-center justify-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={reRoll}
                  disabled={rolling}
                >
                  <RefreshCw
                    className={["size-3", rolling ? "animate-spin" : ""].join(
                      " ",
                    )}
                  />
                  New question
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setDraftQuestion(session.icebreakerQuestion ?? "");
                    setEditing(true);
                  }}
                  disabled={rolling}
                >
                  <Pencil className="size-3" />
                  Write my own
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Current speaker spotlight */}
      {currentMember && (
        <div
          className={[
            "flex flex-col items-center gap-3 rounded-2xl border-2 px-8 py-5",
            isMyTurn
              ? "border-primary bg-primary/5 shadow-lg"
              : "border-border bg-card",
          ].join(" ")}
        >
          <div
            className={[
              "size-16 rounded-full flex items-center justify-center text-xl font-bold",
              isMyTurn
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            ].join(" ")}
          >
            {getInitials(currentMember.displayName)}
          </div>
          <div className="text-center">
            <p className="font-semibold">{currentMember.displayName}</p>
            <p
              className={[
                "text-xs",
                isMyTurn ? "text-primary font-medium" : "text-muted-foreground",
              ].join(" ")}
            >
              {isMyTurn ? "It's your turn!" : "Currently sharing"}
            </p>
          </div>
        </div>
      )}

      {/* Facilitator: next speaker button */}
      {isFacilitator && upNextId && (
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={nextSpeaker}
          disabled={advancing}
        >
          <ChevronRight className="size-3.5" />
          Next: {memberById[upNextId]?.displayName ?? "Next"}
        </Button>
      )}

      {/* Queue strip */}
      {speakerOrder.length > 0 && (
        <div className="w-full space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">
            Speaking order
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {speakerOrder.map((uid, i) => {
              const m = memberById[uid];
              const done = i < currentIndex;
              const isCur = i === currentIndex;
              const initials = m ? getInitials(m.displayName) : "?";
              return (
                <div
                  key={uid}
                  title={m?.displayName}
                  className={[
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-all",
                    isCur
                      ? "border-primary bg-primary/10 text-primary"
                      : done
                        ? "border-border bg-muted text-muted-foreground line-through opacity-50"
                        : "border-border bg-background text-foreground",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "size-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                      isCur
                        ? "bg-primary text-primary-foreground"
                        : done
                          ? "bg-muted-foreground/20 text-muted-foreground"
                          : "bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    {initials}
                  </span>
                  {m?.displayName.split(" ")[0] ?? "Unknown"}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All done */}
      {!upNextId && currentMember && (
        <p className="text-xs text-muted-foreground text-center">
          Everyone has shared
          {isFacilitator ? ". Advance to Writing when ready." : "."}
        </p>
      )}
    </div>
  );
}
