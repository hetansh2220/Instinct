"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { avatarUrl } from "@/lib/user";
import { useLeaderboard, winRate, type Standing } from "@/lib/room/leaderboard";
import { RequireWallet } from "@/components/auth/require-wallet";
import { cn } from "@/lib/utils";

const PER_PAGE = 10;

export default function LeaderboardPage() {
    const { publicKey } = useWallet();
    const wallet = publicKey?.toBase58();
    const { data: standings = [], isPending } = useLeaderboard();
    const [page, setPage] = useState(0);

    const myIndex = standings.findIndex((s) => s.wallet === wallet);
    const me = myIndex >= 0 ? standings[myIndex] : undefined;

    const pages = Math.max(1, Math.ceil(standings.length / PER_PAGE));
    const visible = standings.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

    return (
        <RequireWallet>
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 py-10 sm:px-8">
            <header className="flex flex-col gap-1">
                <h1 className="font-heading text-3xl font-semibold tracking-tight">Leaderboard</h1>
                <p className="text-sm text-muted-foreground">
                    The best predictors on Instinct, ranked by points.
                </p>
            </header>

            {/* Your standing, pulled out of the table so you don't have to hunt for it. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Your rank" value={me ? `#${myIndex + 1}` : "—"} />
                <Stat label="Points" value={me ? me.points.toLocaleString() : "0"} accent={!!me?.points} />
                {/* Settled only — an unfinished pick isn't a result yet, so it can't count. */}
                <Stat label="Settled" value={me ? String(me.predictions) : "0"} />
                <Stat label="Win rate" value={me ? `${winRate(me)}%` : "0%"} />
            </div>

            <section className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="grid grid-cols-[2.5rem_1fr_5rem_5rem_6rem] items-center gap-3 border-b border-border px-5 py-3.5 font-mono text-[10px] tracking-widest text-muted-foreground uppercase sm:grid-cols-[2.5rem_1fr_6rem_6rem_7rem]">
                    <span>#</span>
                    <span>Player</span>
                    <span className="text-right">Settled</span>
                    <span className="text-right">Wins</span>
                    <span className="text-right">Points</span>
                </div>

                {isPending ? (
                    Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-16 animate-pulse border-b border-border last:border-0" />
                    ))
                ) : standings.length === 0 ? (
                    <p className="py-16 text-center text-sm text-muted-foreground">
                        Nobody has scored yet. Join a contest.
                    </p>
                ) : (
                    visible.map((s, i) => (
                        <Row
                            key={s.wallet}
                            standing={s}
                            rank={page * PER_PAGE + i + 1}
                            mine={s.wallet === wallet}
                        />
                    ))
                )}
            </section>

            {pages > 1 && (
                <nav className="flex items-center justify-center gap-2">
                    <button
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
                    >
                        <ChevronLeft className="size-4" /> Previous
                    </button>

                    {Array.from({ length: pages }).map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setPage(i)}
                            className={cn(
                                "size-9 rounded-lg border text-sm font-medium transition-colors",
                                page === i
                                    ? "border-border bg-muted text-foreground"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {i + 1}
                        </button>
                    ))}

                    <button
                        onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                        disabled={page === pages - 1}
                        className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
                    >
                        Next <ChevronRight className="size-4" />
                    </button>
                </nav>
            )}
        </main>
        </RequireWallet>
    );
}

function Row({ standing, rank, mine }: { standing: Standing; rank: number; mine: boolean }) {
    const short = `${standing.wallet.slice(0, 4)}…${standing.wallet.slice(-4)}`;

    return (
        <div
            className={cn(
                "grid grid-cols-[2.5rem_1fr_5rem_5rem_6rem] items-center gap-3 border-b border-border px-5 py-3.5 transition-colors last:border-0 sm:grid-cols-[2.5rem_1fr_6rem_6rem_7rem]",
                mine ? "bg-muted/60" : "hover:bg-muted/30"
            )}
        >
            <span
                className={cn(
                    "font-mono text-sm font-bold tabular-nums",
                    rank <= 3 ? "text-foreground" : "text-muted-foreground"
                )}
            >
                {rank}
            </span>

            <span className="flex min-w-0 items-center gap-3">
                <img
                    src={avatarUrl(standing.wallet)}
                    alt=""
                    className="size-8 shrink-0 rounded-full bg-muted ring-1 ring-border"
                />
                <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                        {mine ? "You" : (standing.username ?? short)}
                    </span>
                    <span className="truncate font-mono text-[10px] text-muted-foreground">{short}</span>
                </span>
            </span>

            <span className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                {standing.predictions}
            </span>
            <span className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                {standing.wins}
            </span>
            <span
                className={cn(
                    "text-right font-mono text-sm font-bold tabular-nums",
                    standing.points > 0 ? "text-emerald-400" : "text-muted-foreground"
                )}
            >
                {standing.points.toLocaleString()}
            </span>
        </div>
    );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-5">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span
                className={cn(
                    "font-heading text-2xl font-bold tabular-nums",
                    accent && "text-emerald-400"
                )}
            >
                {value}
            </span>
        </div>
    );
}
