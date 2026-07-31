"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  MessageSquare,
  Plus,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ColumnTemplatePicker,
  MAX_TEMPLATE_COLUMNS,
  parseColumns,
} from "@/components/retro/column-template-picker";

type RetroPhase =
  | "CheckIn"
  | "Icebreaker"
  | "Write"
  | "Group"
  | "Vote"
  | "Discuss"
  | "WrapUp"
  | "Completed";

type QuickRetroSession = {
  id: string;
  name: string;
  phase: RetroPhase;
  createdAt: string;
};

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

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

// Shown greyed out in the name field and used as-is when nothing is typed.
function defaultRetroName() {
  return `Retro ${new Date().toLocaleDateString("en-CA")}`;
}

export default function QuickRetroListPage() {
  const router = useRouter();

  const [sessions, setSessions] = useState<QuickRetroSession[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [columns, setColumns] = useState(
    "Went Well, Improve, Learnings, Questions",
  );
  const [votes, setVotes] = useState(5);
  const [hideVotes, setHideVotes] = useState(false);
  const [skipMood, setSkipMood] = useState(false);
  const [skipIcebreaker, setSkipIcebreaker] = useState(false);

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [sessions],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<QuickRetroSession[]>("/api/quickretro");
      setSessions(result);
    } catch {
      toast.error("Failed to load retros");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createRetro() {
    const trimmed = name.trim() || defaultRetroName();
    const cols = parseColumns(columns);

    // A board with no columns has nowhere to write, and the server rejects it
    // anyway — say so before the round trip.
    if (cols.length === 0) {
      toast.error("Add at least one column");
      return;
    }
    if (cols.length > MAX_TEMPLATE_COLUMNS) {
      toast.error(`A retro can have at most ${MAX_TEMPLATE_COLUMNS} columns`);
      return;
    }

    setCreating(true);
    try {
      const created = await api.post<QuickRetroSession>("/api/quickretro", {
        name: trimmed,
        columnsJson: JSON.stringify(cols),
        voteCount: votes,
        hideVotesUntilRevealed: hideVotes,
        skipMoodCheckins: skipMood,
        skipIcebreaker,
      });

      setOpen(false);
      setName("");
      setColumns("Went Well, Improve, Learnings, Questions");
      setVotes(5);
      setHideVotes(false);
      setSkipMood(false);
      setSkipIcebreaker(false);
      router.push(`/quickretro/${created.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create retro",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">QuickRetro</h1>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to Dashboard
          </Link>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setOpen(true)}
          >
            <Plus className="size-3.5" />
            New Retro
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : sortedSessions.length === 0 ? (
          <div className="mx-auto flex h-56 max-w-lg flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-8 text-center">
            <h2 className="text-lg font-semibold">No retros yet</h2>
            <p className="text-sm text-muted-foreground">
              Create your first retro to get started.
            </p>
            <Button className="gap-2" onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              Create Retro
            </Button>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-2">
            {sortedSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{session.name}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3" />
                      {fmtDate(session.createdAt)}
                    </span>
                    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px]">
                      {PHASE_LABELS[session.phase]}
                    </span>
                  </div>
                </div>

                <Link
                  href={`/quickretro/${session.id}`}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Open
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New Retro</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Retro Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={defaultRetroName()}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
              />
            </div>

            <ColumnTemplatePicker value={columns} onChange={setColumns} />

            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Votes per person:{" "}
                <span className="font-semibold text-foreground">{votes}</span>
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={votes}
                onChange={(e) => setVotes(Number(e.target.value))}
                className="h-1.5 w-full accent-primary"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={hideVotes}
                onChange={(e) => setHideVotes(e.target.checked)}
                className="accent-primary"
              />
              Hide votes until facilitator reveals
            </label>

            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={skipMood}
                onChange={(e) => setSkipMood(e.target.checked)}
                className="accent-primary"
              />
              Skip mood check-in steps
            </label>

            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={skipIcebreaker}
                onChange={(e) => setSkipIcebreaker(e.target.checked)}
                className="accent-primary"
              />
              Skip icebreaker round
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={createRetro} disabled={creating}>
              {creating ? (
                <Loader2 className="mr-1.5 size-3 animate-spin" />
              ) : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
