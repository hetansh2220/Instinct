"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { teamCode, teamFlag } from "@/lib/txline/flags";
import type { TimelineEvent } from "@/lib/txline/timeline";
import { cn } from "@/lib/utils";

const ICON: Record<string, string> = { goal: "⚽", yellow: "🟨", red: "🟥", sub: "🔁" };
const LIVE_WINDOW = 2.5 * 60 * 60 * 1000;

export type MatchState = "upcoming" | "live" | "completed";
export type Pick = "home" | "draw" | "away";

export function matchState(kickoff?: number): MatchState {
    if (!kickoff) return "completed";
    const now = Date.now();
    if (now < kickoff) return "upcoming";
    return now < kickoff + LIVE_WINDOW ? "live" : "completed";
}

/**
 * The left rail. Fixed height, never scrolls — the chat is the only scrolling
 * area, and that only holds if the rails fit. Its job changes with the match:
 * before kickoff it's the entry form, after it's the scoreboard.
 */
export function MatchRail({
    matchId,
    home,
    away,
    score,
    events,
    state,
    minute,
    kickoff,
    pick,
    onPick,
    pending,
    error,
}: {
    matchId: number;
    home?: string;
    away?: string;
    score?: [number, number];
    events: TimelineEvent[];
    state: MatchState;
    /** Live match clock, pushed from the feed. */
    minute?: number;
    kickoff?: number;
    pick?: Pick;
    onPick: (p: Pick) => void;
    pending?: boolean;
    error?: string | null;
}) {
    const key = events.filter((e) => e.kind === "goal" || e.kind === "red");

    return (
        // Cards size to their contents and the column stops there — stretching the
        // last card to full height left a big empty bordered box below the content.
        <aside className="flex max-h-full w-full flex-col gap-3 self-start overflow-hidden">
            <section className="shrink-0 rounded-2xl border border-border bg-card p-5">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <Team name={home} />
                    {state === "upcoming" ? (
                        <span className="font-heading text-xl font-bold text-muted-foreground">v</span>
                    ) : (
                        <span className="font-mono text-2xl font-bold tabular-nums">
                            {score ? `${score[0]} - ${score[1]}` : "0 - 0"}
                        </span>
                    )}
                    <Team name={away} />
                </div>

                <div className="mt-4 flex justify-center">
                    <Status state={state} kickoff={kickoff} minute={minute} />
                </div>
            </section>

            {/* Before kickoff the rail's job is to take your entry. */}
            {state === "upcoming" ? (
                <PickCard
                    home={home}
                    away={away}
                    pick={pick}
                    onPick={onPick}
                    pending={pending}
                    error={error}
                />
            ) : (
                <YourPick pick={pick} home={home} away={away} />
            )}

            <section className="flex min-h-0 flex-col rounded-2xl border border-border bg-card p-4">
                <span className="mb-3 shrink-0 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                    Key events
                </span>

                <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto">
                    {key.length === 0 ? (
                        <p className="py-3 text-xs text-muted-foreground">
                            {state === "upcoming" ? "Match hasn't started." : "No goals yet."}
                        </p>
                    ) : (
                        key.map((e) => (
                            <div key={e.id} className="flex items-center gap-2.5">
                                <span className="w-7 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                                    {e.minute}&apos;
                                </span>
                                <span className="shrink-0 text-xs">{ICON[e.kind] ?? "•"}</span>
                                <span className="truncate text-xs">{e.player?.name ?? "—"}</span>
                            </div>
                        ))
                    )}
                </div>

                <Link
                    href={`/match/${matchId}?h=${encodeURIComponent(home ?? "")}&a=${encodeURIComponent(away ?? "")}`}
                    className="mt-3 flex shrink-0 items-center justify-center gap-1 border-t border-border pt-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                    Full recap <ArrowUpRight className="size-3" />
                </Link>
            </section>
        </aside>
    );
}

function Status({ state, kickoff, minute }: { state: MatchState; kickoff?: number; minute?: number }) {
    const [left, setLeft] = useState("");

    useEffect(() => {
        if (state !== "upcoming" || !kickoff) return;
        const update = () => {
            const ms = kickoff - Date.now();
            if (ms <= 0) return setLeft("any moment");
            const d = Math.floor(ms / 86_400_000);
            const h = Math.floor((ms % 86_400_000) / 3_600_000);
            const m = Math.floor((ms % 3_600_000) / 60_000);
            setLeft(d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`);
        };
        update();
        const id = setInterval(update, 30_000);
        return () => clearInterval(id);
    }, [state, kickoff]);

    if (state === "live") {
        return (
            <span className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-red-500 uppercase">
                <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
                {/* The real match clock, straight from the feed. */}
                {minute ? `live ${minute}'` : "live"}
            </span>
        );
    }
    if (state === "completed") {
        return (
            <span className="rounded-full border border-border px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                full time
            </span>
        );
    }
    return (
        <span className="rounded-full border border-border px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
            {/* `left` is client-only (it reads the clock), so it's empty on first paint. */}
            {left ? `kicks off in ${left}` : "upcoming"}
        </span>
    );
}

/**
 * The contest entry: three pills, the chosen one filled solid. Locks at kickoff,
 * otherwise you could back a team that is already winning.
 */
function PickCard({
    home,
    away,
    pick,
    onPick,
    pending,
    error,
}: {
    home?: string;
    away?: string;
    pick?: Pick;
    onPick: (p: Pick) => void;
    pending?: boolean;
    error?: string | null;
}) {
    // The pick is a commitment that locks at kickoff, so it gets a confirm step
    // rather than firing on a stray click.
    const [confirming, setConfirming] = useState<Pick | null>(null);

    const options: { key: Pick; team?: string }[] = [
        { key: "home", team: home },
        { key: "draw" },
        { key: "away", team: away },
    ];
    const nameOf = (p: Pick) =>
        p === "draw" ? "a draw" : p === "home" ? (home ?? "Home") : (away ?? "Away");

    return (
        <section className="shrink-0 rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                    Your pick
                </span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
                    +15 PTS
                </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {options.map((o) => {
                    const selected = pick === o.key;
                    const label = o.key === "draw" ? "Draw" : (o.team ?? "—");

                    return (
                        <button
                            key={o.key}
                            onClick={() => setConfirming(o.key)}
                            disabled={pending}
                            title={label}
                            className={cn(
                                "h-12 truncate rounded-2xl px-2 text-sm font-bold transition-colors disabled:opacity-60",
                                selected
                                    ? "bg-emerald-500 text-white hover:bg-emerald-500/90"
                                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>

            {/* A join that fails must SAY so — it used to roll back silently, which
                looked exactly like a join that worked. */}
            {error && (
                <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
                    {error}
                </p>
            )}

            <p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Lock className="size-3" /> Locks at kickoff
            </p>

            <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
                <DialogContent className="gap-0 p-0 sm:max-w-md">
                    <DialogHeader className="gap-2 px-6 pt-6 pb-5">
                        <DialogTitle className="font-heading text-xl">
                            {pick ? "Change your pick?" : "Join this contest?"}
                        </DialogTitle>
                        <DialogDescription className="text-sm">
                            You&apos;re backing{" "}
                            <span className="font-semibold text-foreground">
                                {confirming ? nameOf(confirming) : ""}
                            </span>
                            . You can change it until kickoff — after that it&apos;s locked.
                            A correct call is worth 15 points.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Same treatment as the join dialog: no muted strip, no top border,
                        two equal-width buttons spanning the footer. */}
                    <DialogFooter className="m-0 grid grid-cols-2 gap-2.5 border-t-0 bg-transparent px-6 pb-6 sm:grid-cols-2 sm:gap-2.5">
                        <Button
                            variant="outline"
                            size="lg"
                            className="h-12 w-full"
                            onClick={() => setConfirming(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="lg"
                            disabled={pending}
                            className="h-12 w-full"
                            onClick={() => {
                                if (confirming) onPick(confirming);
                                setConfirming(null);
                            }}
                        >
                            {pending ? "Saving…" : pick ? "Change pick" : "Join contest"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}

/** After kickoff the pick is frozen, so it collapses to a single locked row. */
function YourPick({ pick, home, away }: { pick?: Pick; home?: string; away?: string }) {
    if (!pick) return null;

    const team = pick === "home" ? home : pick === "away" ? away : undefined;
    const label = pick === "draw" ? "Draw" : (team ?? "—");

    return (
        <section className="shrink-0 rounded-2xl border border-border bg-card p-4">
            <span className="mb-3 flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                <Lock className="size-3" /> Your pick
            </span>
            <div className="grid h-12 place-items-center truncate rounded-2xl bg-emerald-500 px-3 text-sm font-bold text-white">
                {label}
            </div>
        </section>
    );
}

function Team({ name }: { name?: string }) {
    const code = teamCode(name);
    return (
        <div className="flex flex-col items-center gap-1.5">
            {code ? (
                <img
                    src={`https://flagcdn.com/w160/${code}.png`}
                    alt=""
                    className="h-7 w-10 rounded-xs object-cover ring-1 ring-border"
                />
            ) : (
                <span className="text-lg">{teamFlag(name)}</span>
            )}
            <span className="text-center text-[11px] font-bold tracking-wide uppercase">{name ?? "—"}</span>
        </div>
    );
}
