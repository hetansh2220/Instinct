"use client";

import { useEffect, useState } from "react";
import type { Round } from "@/lib/room/types";
import { cn } from "@/lib/utils";

/**
 * Live mini-event prediction card. Sits below Key Events in the match rail —
 * styled like Your Pick so it reads as part of the contest UI, not chat chrome.
 */

const ASKED: Record<string, { verb: string }> = {
    goal: { verb: "Goal" },
    corner: { verb: "Corner" },
    card: { verb: "Card" },
    yellow: { verb: "Card" },
};

/** Seconds left on a wall-clock deadline. */
function useCountdown(until: number | null | undefined): number {
    const [left, setLeft] = useState(() =>
        until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0
    );

    useEffect(() => {
        if (!until) {
            setLeft(0);
            return;
        }
        const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [until]);

    return left;
}

export function RoundCard({
    round,
    onAnswer,
}: {
    round: Round;
    onAnswer?: (id: string, choice: boolean) => void;
}) {
    const toLock = useCountdown(round.status === "open" ? round.locksAt : null);
    const clockLeft = Math.max(0, round.windowEndClock - round.currentClock);
    const clockLeftLabel =
        clockLeft >= 60
            ? `${Math.ceil(clockLeft / 60)}m left`
            : `${clockLeft}s left`;

    const { verb } = ASKED[round.event] ?? { verb: round.event };
    const open = round.status === "open" && toLock > 0 && !round.resolved;
    const answered = round.mine !== undefined;
    const votes = round.tally.yes + round.tally.no;

    const right = round.resolved && answered && round.mine === round.outcome;
    const wrong = round.resolved && answered && round.mine !== round.outcome;

    return (
        <section
            className={cn(
                "shrink-0 overflow-hidden rounded-2xl border bg-card p-4 transition-colors",
                round.resolved
                    ? right
                        ? "border-emerald-500/40"
                        : "border-border"
                    : "border-border"
            )}
        >
            <div className="mb-3 flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                    {round.resolved ? "Called it" : "Next 3 min"}
                </span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
                    {round.resolved
                        ? `${verb} ${round.outcome ? "YES" : "NO"}`
                        : open
                            ? `${toLock}s to answer`
                            : `locked · ${clockLeftLabel}`}
                </span>
            </div>

            <p className="text-sm font-semibold">{round.question}</p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                +{round.points} pts if you call it right
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
                {([true, false] as const).map((choice) => {
                    const label = choice ? "Yes" : "No";
                    const count = choice ? round.tally.yes : round.tally.no;
                    const mine = round.mine === choice;
                    const won = round.resolved && round.outcome === choice;

                    return (
                        <button
                            key={label}
                            disabled={!open || answered || !onAnswer}
                            onClick={() => onAnswer?.(round.id, choice)}
                            className={cn(
                                "flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-bold transition-colors disabled:opacity-60",
                                won
                                    ? "bg-emerald-500 text-white"
                                    : mine
                                        ? "bg-emerald-500 text-white"
                                        : "bg-muted/60 text-muted-foreground",
                                open && !answered && "hover:bg-muted hover:text-foreground"
                            )}
                        >
                            {label}
                            {votes > 0 && (
                                <span className="font-mono text-[10px] opacity-70 tabular-nums">
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {round.resolved ? (
                <p
                    className={cn(
                        "mt-3 text-center font-mono text-[10px] font-bold tracking-widest uppercase",
                        right ? "text-emerald-400" : "text-muted-foreground"
                    )}
                >
                    {right ? `+${round.points} pts` : wrong ? "Not this time" : "You sat this one out"}
                </p>
            ) : answered ? (
                <p className="mt-3 text-center font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                    Locked in — {round.mine ? "yes" : "no"}
                </p>
            ) : (
                <p className="mt-3 text-center font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                    {open ? "Tap yes or no" : "Answers locked — watching the clock"}
                </p>
            )}
        </section>
    );
}
