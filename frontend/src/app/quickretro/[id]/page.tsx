"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { useLiveTopic } from "@/lib/live";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CheckInPanel } from "./checkin-panel";
import { IcebreakerPanel } from "./icebreaker-panel";
import { WritePanel } from "./write-panel";
import { GroupPanel } from "./group-panel";
import { VotePanel } from "./vote-panel";
import { DiscussPanel } from "./discuss-panel";
import { WrapUpPanel } from "./wrapup-panel";
import { ParticipantsBar } from "@/components/retro/participants-bar";
import { useRetroRoster } from "@/components/retro/use-retro-roster";
import type { RetroParticipantData } from "@/components/retro/types";

export type RetroPhase =
  | "CheckIn"
  | "Icebreaker"
  | "Write"
  | "Group"
  | "Vote"
  | "Discuss"
  | "WrapUp"
  | "Completed";

export type RetroSession = {
  id: string;
  name: string;
  facilitatorId: string | null;
  phase: RetroPhase;
  columnsJson: string;
  voteCount: number;
  hideVotesUntilRevealed: boolean;
  skipMoodCheckins: boolean;
  skipIcebreaker: boolean;
  currentSpeakerId: string | null;
  speakerOrderJson: string | null;
  icebreakerQuestion: string | null;
  activeDiscussionCardId: string | null;
  createdAt: string;
};

export type RetroVote = {
  id: string;
  retroCardId: string;
  userId: string;
  count: number;
};

export type RetroCard = {
  id: string;
  retroSessionId: string;
  authorId: string;
  column: string;
  content: string;
  groupId: string | null;
  groupLabel: string | null;
  discussionNotes: string | null;
  isRevealed: boolean;
  isDiscussed: boolean;
  createdAt: string;
  retro_votes: RetroVote[];
};

export type MoodCheckin = {
  id: string;
  retroSessionId: string;
  userId: string;
  entryMood: number | null;
  exitMood: number | null;
};

export type ActionItemData = {
  id: string;
  sprintId: string | null;
  retroSessionId: string | null;
  retroCardId: string | null;
  type: string;
  assigneeId: string | null;
  text: string;
  dueDate: string | null;
  status: string;
  createdAt: string;
};

export type RetroData = {
  session: RetroSession;
  cards: RetroCard[];
  hiddenCounts: Record<string, number>;
  moodCheckins: MoodCheckin[];
  actionItems: ActionItemData[];
  participants: RetroParticipantData[];
  finishedVotingUserIds: string[];
};

const PHASE_ORDER: RetroPhase[] = [
  "CheckIn",
  "Icebreaker",
  "Write",
  "Group",
  "Vote",
  "Discuss",
  "WrapUp",
  "Completed",
];

const PHASE_LABELS: Record<RetroPhase, string> = {
  CheckIn: "Check-In",
  Icebreaker: "Icebreaker",
  Write: "Write",
  Group: "Group",
  Vote: "Vote",
  Discuss: "Discuss",
  WrapUp: "Wrap-Up",
  Completed: "Completed",
};

function PhaseProgressBar({ session }: { session: RetroSession }) {
  // Check-In only exists to collect entry moods, so it disappears from the
  // progress bar when the retro opted out of them (EE-165). The icebreaker is
  // opt-out in the same way.
  const phases = PHASE_ORDER.filter(
    (p) =>
      p !== "Completed" &&
      !(p === "CheckIn" && session.skipMoodCheckins) &&
      !(p === "Icebreaker" && session.skipIcebreaker),
  );
  const current =
    session.phase === "Completed"
      ? phases.length
      : phases.indexOf(session.phase);

  return (
    <div className="flex items-center gap-1">
      {phases.map((p, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={p} className="flex items-center gap-1">
            <div
              className={[
                "h-1.5 rounded-full transition-all",
                active
                  ? "w-10 bg-primary"
                  : done
                    ? "w-6 bg-primary/40"
                    : "w-6 bg-muted",
              ].join(" ")}
            />
            {i < phases.length - 1 && <div className="h-px w-2 bg-border" />}
          </div>
        );
      })}
      <span className="ml-2 text-xs text-muted-foreground font-medium">
        {PHASE_LABELS[session.phase]}
      </span>
    </div>
  );
}

const PHASE_NEXT_LABEL: Partial<Record<RetroPhase, string>> = {
  CheckIn: "Start Icebreaker →",
  Icebreaker: "Start Writing →",
  Write: "Reveal & Group Cards →",
  Group: "Start Voting →",
  Vote: "Start Discussion →",
  Discuss: "Wrap Up →",
  WrapUp: "Complete Retro",
};

function FacilitatorBar({
  session,
  checkedInCount,
  totalMembers,
  votedCount,
  onRefresh,
}: {
  session: RetroSession;
  checkedInCount: number;
  totalMembers: number;
  votedCount: number;
  onRefresh: () => void;
}) {
  const [advancing, setAdvancing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const label =
    session.phase === "CheckIn" && session.skipIcebreaker
      ? "Start Writing →"
      : PHASE_NEXT_LABEL[session.phase];
  if (!label || session.phase === "Completed") return null;

  const warnCheckin =
    session.phase === "CheckIn" && checkedInCount < totalMembers;
  const warnVote = session.phase === "Vote" && votedCount < totalMembers;

  function handleAdvanceClick() {
    if (warnCheckin || warnVote) {
      setConfirmOpen(true);
    } else {
      doAdvance();
    }
  }

  async function doAdvance() {
    setConfirmOpen(false);
    setAdvancing(true);
    try {
      await api.post(`/api/quickretro/${session.id}/advance`, {});
      onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to advance phase",
      );
    } finally {
      setAdvancing(false);
    }
  }

  const warnMsg = warnCheckin
    ? `${totalMembers - checkedInCount} member(s) haven't checked in yet.`
    : `${totalMembers - votedCount} member(s) haven't finished voting yet.`;

  return (
    <>
      <div className="flex items-center justify-between border-b border-border bg-card/50 px-6 py-2">
        <span className="text-xs text-muted-foreground">
          You are the facilitator
        </span>
        <Button
          size="sm"
          className="h-7 text-xs px-4"
          onClick={handleAdvanceClick}
          disabled={advancing}
        >
          {advancing ? (
            <Loader2 className="size-3 animate-spin mr-1.5" />
          ) : null}
          {label}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Advance phase?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {warnMsg} Advance anyway?
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(false)}
            >
              Wait
            </Button>
            <Button size="sm" onClick={doAdvance}>
              Advance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RetroHeader({
  session,
  showBackLink,
}: {
  session: RetroSession;
  showBackLink: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
      <div className="flex items-center gap-3">
        {showBackLink && (
          <Link
            href="/quickretro"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
          </Link>
        )}
        <div>
          <h1 className="text-sm font-semibold">{session.name} — Retro</h1>
          <PhaseProgressBar session={session} />
        </div>
      </div>
    </div>
  );
}

function RetroInner({ retroId }: { retroId: string }) {
  const [data, setData] = useState<RetroData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const result = await api.get<RetroData>(`/api/quickretro/${retroId}`);
      setData(result);
      setNotFound(false);
    } catch (err: unknown) {
      // `api` throws `API <status>: <body>`; match the status, not any 404 that
      // happens to appear in the message.
      if (err instanceof Error && err.message.startsWith("API 404")) {
        setNotFound(true);
        setData(null);
      } else {
        toast.error("Failed to load retro");
      }
    } finally {
      setLoading(false);
    }
  }, [retroId]);

  useEffect(() => {
    const session = getSession();
    if (session?.userId) setCurrentUserId(session.userId);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Quick retros and sprint retros are the same retro_sessions row and share one
  // topic family — "retro:{id}", not "quickretro:{id}" (architecture doc §2.1).
  useLiveTopic(data?.session.id ? `retro:${data.session.id}` : null, load);

  // Roster = everyone who joined this retro *and* currently has it open.
  // Hooks must run before the early returns below.
  const participants = useMemo(() => data?.participants ?? [], [data]);
  const roster = useRetroRoster(
    data?.session.id ?? null,
    participants,
    currentUserId,
  );

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center space-y-3">
          <h1 className="text-lg font-semibold">Retro not found</h1>
          <p className="text-sm text-muted-foreground">
            This retro does not exist or you do not have access to it.
          </p>
          <Link
            href="/quickretro"
            className="text-sm text-primary hover:underline"
          >
            Back to My Retros
          </Link>
        </div>
      </div>
    );
  }

  const {
    session,
    cards,
    hiddenCounts,
    moodCheckins,
    actionItems,
    finishedVotingUserIds,
  } = data;
  const isFacilitator = session.facilitatorId === currentUserId;

  // Progress is measured against the people actually in the retro right now,
  // so invite-link guests count too.
  const rosterUserIds = new Set(roster.map((m) => m.userId));
  const checkedInCount = new Set(
    moodCheckins
      .filter((m) => m.entryMood !== null && rosterUserIds.has(m.userId))
      .map((m) => m.userId),
  ).size;
  // A member counts as done only once their whole vote budget is spent. Comes
  // from the server rather than from `cards`, whose vote rows are stripped down
  // to the caller's own while "hide votes until revealed" is on.
  const votedMembers = new Set(
    (finishedVotingUserIds ?? []).filter((id) => rosterUserIds.has(id)),
  ).size;

  const panelProps = {
    session,
    cards,
    hiddenCounts,
    moodCheckins,
    actionItems: actionItems ?? [],
    roster,
    participants,
    currentUserId,
    isFacilitator,
    onRefresh: load,
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <RetroHeader session={session} showBackLink={isFacilitator} />

      <ParticipantsBar
        sessionId={session.id}
        roster={roster}
        isHost={isFacilitator}
        onRosterChange={load}
      />

      {isFacilitator && (
        <FacilitatorBar
          session={session}
          checkedInCount={checkedInCount}
          totalMembers={roster.length}
          votedCount={votedMembers}
          onRefresh={load}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        {session.phase === "CheckIn" && <CheckInPanel {...panelProps} />}
        {session.phase === "Icebreaker" && <IcebreakerPanel {...panelProps} />}
        {session.phase === "Write" && <WritePanel {...panelProps} />}
        {session.phase === "Group" && <GroupPanel {...panelProps} />}
        {session.phase === "Vote" && <VotePanel {...panelProps} />}
        {session.phase === "Discuss" && <DiscussPanel {...panelProps} />}
        {session.phase === "WrapUp" && <WrapUpPanel {...panelProps} />}
        {session.phase === "Completed" && (
          <>
            <div className="px-6 py-2 border-b border-border bg-muted/40">
              <p className="text-xs text-muted-foreground text-center">
                This retro is complete — read-only summary
              </p>
            </div>
            <WrapUpPanel {...panelProps} />
          </>
        )}
      </div>
    </div>
  );
}

function QuickRetroPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const retroId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  useEffect(() => {
    if (!retroId) router.replace("/quickretro");
  }, [retroId, router]);

  if (!retroId) return null;

  return <RetroInner retroId={retroId} />;
}

export default function QuickRetroPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <QuickRetroPageContent />
    </Suspense>
  );
}
