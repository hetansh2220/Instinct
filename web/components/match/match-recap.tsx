"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { useContest } from "@/lib/room/contest";
import { ContestLeaderboard } from "./contest-result";
import { ArrowLeft, ArrowDown, ArrowUp, Timer } from "lucide-react";
import { getHistorical, getUpdates } from "@/lib/txline/data";
import { teamCode, teamFlag } from "@/lib/txline/flags";
import {
    EVENT_LABEL,
    parseHistorical,
    type Player,
    type Side,
    type Snapshot,
    type TimelineEvent,
} from "@/lib/txline/timeline";
import { cn } from "@/lib/utils";

const TABS = ["timeline", "stats", "leaderboard"] as const;
type Tab = (typeof TABS)[number];

export function MatchRecap({ matchId, home, away }: { matchId: number; home?: string; away?: string }) {
    const { publicKey } = useWallet();
    const wallet = publicKey?.toBase58();

    // Opening a finished match settles the contest (idempotent, server-side) —
    // that's what fills in the leaderboard's points.
    const { data: contest } = useContest(matchId);

    const [active, setActive] = useState<Tab>("timeline");

    /**
     * /scores/historical only covers FINISHED matches — it returns nothing while a
     * game is in play, which is why this page used to show "FULL TIME 0-0" over a
     * live match. So: try historical, and if it's empty fall back to the live
     * updates feed, which has the identical shape and parses the same way.
     */
    const { data, isLoading } = useQuery({
        queryKey: ["recap", matchId],
        // Refresh while a match is live; harmless once it's finished and cached.
        refetchInterval: (q) => (q.state.data?.live ? 20_000 : false),
        queryFn: async () => {
            const done = (await getHistorical(matchId)) as unknown;
            if (Array.isArray(done) && done.length) {
                return { snapshots: done as Snapshot[], live: false };
            }
            const now = (await getUpdates(matchId)) as unknown;
            return {
                snapshots: Array.isArray(now) ? (now as Snapshot[]) : [],
                live: Array.isArray(now) && now.length > 0,
            };
        },
    });

    const live = data?.live ?? false;
    const parsed = useMemo(
        () => (data?.snapshots.length ? parseHistorical(data.snapshots, live) : null),
        [data, live]
    );
    const p1IsHome = parsed?.p1IsHome ?? true;

    /** Participant side (1|2) -> the team name shown to the user. */
    const teamOf = (side: Side): string | undefined =>
        side === 1 ? (p1IsHome ? home : away) : p1IsHome ? away : home;
    const toHome = <T,>(p1: T, p2: T): [T, T] => (p1IsHome ? [p1, p2] : [p2, p1]);

    const [homeGoals, awayGoals] = toHome(parsed?.finalScore[0] ?? 0, parsed?.finalScore[1] ?? 0);

    return (
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-5 py-8 sm:px-8">
            <section className="rounded-2xl border border-border bg-card p-6">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <TeamCol name={home} />
                    <div className="flex flex-col items-center gap-2">
                        <span className="font-mono text-4xl font-bold tabular-nums">
                            {isLoading ? "–" : homeGoals}
                            <span className="mx-2 text-muted-foreground">-</span>
                            {isLoading ? "–" : awayGoals}
                        </span>
                        {live ? (
                            <span className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-red-500 uppercase">
                                <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
                                live {parsed?.minute ? `${parsed.minute}'` : ""}
                            </span>
                        ) : (
                            <span className="rounded-full border border-border px-2.5 py-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                                full time
                            </span>
                        )}
                    </div>
                    <TeamCol name={away} />
                </div>
            </section>

            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-card p-1.5">
                {TABS.map((t) => (
                    <button
                        key={t}
                        onClick={() => setActive(t)}
                        className={cn(
                            "rounded-xl py-3 font-mono text-xs font-bold tracking-widest uppercase transition-colors",
                            active === t
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {isLoading || !parsed ? (
                <div className="flex flex-col gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-28 animate-pulse rounded-2xl bg-card" />
                    ))}
                </div>
            ) : active === "leaderboard" ? (
                contest ? (
                    <ContestLeaderboard contest={contest} home={home} away={away} meWallet={wallet} />
                ) : (
                    <Empty>No contest for this match.</Empty>
                )
            ) : active === "timeline" ? (
                parsed.timeline.length ? (
                    <section className="flex flex-col gap-3">
                        {parsed.timeline.map((e) => (
                            <EventCard
                                key={e.id}
                                event={e}
                                teamOf={teamOf}
                                toHome={toHome}
                                home={home}
                                away={away}
                            />
                        ))}
                    </section>
                ) : (
                    <Empty>No timeline events for this match.</Empty>
                )
            ) : (
                <StatsPanel
                    rows={parsed.stats.map((s) => {
                        const [h, a] = toHome(s.p1, s.p2);
                        return { label: s.label, h, a };
                    })}
                    home={home}
                    away={away}
                />
            )}
        </main>
    );
}

/* --------------------------------------------------------------- timeline */

function EventCard({
    event,
    teamOf,
    toHome,
    home,
    away,
}: {
    event: TimelineEvent;
    teamOf: (s: Side) => string | undefined;
    toHome: <T>(p1: T, p2: T) => [T, T];
    home?: string;
    away?: string;
}) {
    if (event.kind === "period") {
        return (
            <div className="flex flex-col items-center gap-1 py-6">
                <Timer className="size-5 text-muted-foreground" />
                <span className="font-heading text-sm font-bold tracking-widest text-muted-foreground uppercase">
                    {event.label}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{event.minute}&apos;</span>
            </div>
        );
    }

    const team = event.side ? teamOf(event.side) : undefined;
    const [hs, as] = toHome(event.score[0], event.score[1]);

    // Minor events stay compact — a full player card per corner would bury the goals.
    if (event.kind === "corner") {
        return (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
                <span className="w-8 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {event.minute}&apos;
                </span>
                <span className="text-sm">🚩</span>
                <span className="flex-1 text-sm text-muted-foreground">
                    Corner <span className="font-medium text-foreground">{team ?? "—"}</span>
                </span>
                <Flag name={team} className="h-3 w-4" />
            </div>
        );
    }

    return (
        <article className="overflow-hidden rounded-2xl border border-border bg-card">
            {event.kind === "goal" ? (
                <header className="bg-emerald-600 text-center text-white">
                    <div className="flex flex-col items-center gap-0.5 py-3">
                        <span className="text-lg leading-none">⚽</span>
                        <span className="font-heading text-lg font-extrabold tracking-widest">GOOOAAALLL!!!</span>
                        <span className="font-mono text-xs font-bold">{event.minute}&apos;</span>
                    </div>
                    <div className="bg-black/15 py-1.5 font-mono text-xs font-semibold">
                        {home ?? "Home"} {hs}
                        <span className="mx-2 opacity-70">-</span>
                        {as} {away ?? "Away"}
                    </div>
                </header>
            ) : (
                <header className="flex items-center justify-between border-b border-border px-4 py-3">
                    <span className="flex items-center gap-2.5">
                        <KindIcon kind={event.kind} />
                        <span className="font-heading text-sm font-bold tracking-widest uppercase">
                            {EVENT_LABEL[event.kind]}
                        </span>
                    </span>
                    <span className="font-mono text-sm font-bold tabular-nums">{event.minute}&apos;</span>
                </header>
            )}

            <div className="flex flex-col gap-4 p-4">
                {event.kind === "sub" ? (
                    <>
                        <PlayerRow player={event.player} team={team} tag="in" />
                        <PlayerRow player={event.playerOut} team={team} tag="out" />
                    </>
                ) : (
                    <PlayerRow player={event.player} team={team} />
                )}
                {describe(event, team) && (
                    <p className="border-t border-border pt-4 text-sm text-muted-foreground">
                        {describe(event, team)}
                    </p>
                )}
            </div>
        </article>
    );
}

/**
 * The feed carries data, not prose, so commentary is templated from it. Returns
 * "" when there is nothing to add beyond what the card already shows — repeating
 * "Belgium pick up a yellow card" under a card headed YELLOW CARD / Belgium is
 * noise, so those cards render without a description at all.
 */
function describe(event: TimelineEvent, team?: string): string {
    const who = event.player?.name;
    const side = team ?? "The team";

    switch (event.kind) {
        case "goal":
            return who
                ? `${who} scores to make it ${event.score[0]} - ${event.score[1]}.`
                : "";
        case "yellow":
            return who ? `${who} (${side}) has been booked and must now be careful not to get a second yellow card.` : "";
        case "red":
            return who
                ? `${who} (${side}) is sent off, and ${side} are down to ten men.`
                : `${side} are reduced to ten men.`;
        case "sub":
            return event.player && event.playerOut
                ? `${event.player.name} is replacing ${event.playerOut.name} for ${side}.`
                : "";
        default:
            return "";
    }
}

function KindIcon({ kind }: { kind: TimelineEvent["kind"] }) {
    if (kind === "yellow") return <span className="block h-5 w-3.5 rounded-xs bg-yellow-400" />;
    if (kind === "red") return <span className="block h-5 w-3.5 rounded-xs bg-red-500" />;
    return (
        <span className="flex">
            <ArrowUp className="size-4 text-emerald-500" />
            <ArrowDown className="-ml-1 size-4 text-red-500" />
        </span>
    );
}

/**
 * The scores feed publishes aggregate counters, not player identities, so most
 * events resolve to a team only. That's the common case, not an error state —
 * so it renders as a clean team row (flag + name), with no repeated team line
 * and no placeholder avatar. The player layout only appears when we truly have
 * a player, which the feed may start providing for other competitions.
 */
function PlayerRow({ player, team, tag }: { player?: Player; team?: string; tag?: "in" | "out" }) {
    return (
        <div className="flex flex-col gap-1.5">
            {tag && (
                <span
                    className={cn(
                        "font-mono text-[10px] font-bold tracking-widest uppercase",
                        tag === "in" ? "text-emerald-500" : "text-red-500"
                    )}
                >
                    {tag}
                </span>
            )}

            {player ? (
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate font-heading text-lg font-semibold">{player.name}</span>
                        <span className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                            <Flag name={team} className="h-3 w-4" />
                            {team ?? "—"}
                            {player.number !== undefined ? ` · #${player.number}` : ""}
                        </span>
                    </div>
                    <Avatar name={player.name} />
                </div>
            ) : (
                <div className="flex items-center gap-2.5">
                    <Flag name={team} className="h-5 w-7" />
                    <span className="truncate font-heading text-lg font-semibold">{team ?? "—"}</span>
                </div>
            )}
        </div>
    );
}

function Avatar({ name }: { name: string }) {
    const initials = name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
    return (
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-muted font-heading text-sm font-bold text-muted-foreground ring-2 ring-border">
            {initials}
        </span>
    );
}

/* ------------------------------------------------------------------ stats */

function StatsPanel({
    rows,
    home,
    away,
}: {
    rows: { label: string; h: number; a: number }[];
    home?: string;
    away?: string;
}) {
    return (
        <section className="rounded-2xl border border-border bg-card p-6">
            <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3 pb-5">
                <Flag name={home} className="h-6 w-9 justify-self-center" />
                <span className="text-center font-heading text-sm font-bold tracking-widest uppercase">
                    Team stats
                </span>
                <Flag name={away} className="h-6 w-9 justify-self-center" />
            </div>

            <div className="flex flex-col">
                {rows.map((r) => (
                    <div
                        key={r.label}
                        className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3 border-t border-border py-3.5"
                    >
                        <StatValue value={r.h} leads={r.h > r.a} />
                        <span className="text-center text-sm text-muted-foreground">{r.label}</span>
                        <StatValue value={r.a} leads={r.a > r.h} />
                    </div>
                ))}
            </div>

            <p className="mt-6 text-center font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                via TxODDS
            </p>
        </section>
    );
}

/** The higher side is pilled, so the winner of each row reads at a glance. */
function StatValue({ value, leads }: { value: number; leads: boolean }) {
    return (
        <span
            className={cn(
                "justify-self-center rounded-full px-2.5 py-1 font-mono text-sm font-semibold tabular-nums",
                leads ? "bg-emerald-600 text-white" : "text-foreground"
            )}
        >
            {value}
        </span>
    );
}

/* ------------------------------------------------------------------ atoms */

function Empty({ children }: { children: React.ReactNode }) {
    return <p className="py-16 text-center text-sm text-muted-foreground">{children}</p>;
}


function Flag({ name, className }: { name?: string; className?: string }) {
    const c = teamCode(name);
    return c ? (
        <img
            src={`https://flagcdn.com/w160/${c}.png`}
            alt=""
            className={cn("shrink-0 rounded-xs object-cover ring-1 ring-border", className)}
        />
    ) : (
        <span className={cn("shrink-0", className)}>{teamFlag(name)}</span>
    );
}

function TeamCol({ name }: { name?: string }) {
    return (
        <div className="flex flex-col items-center gap-2.5">
            <Flag name={name} className="h-9 w-12" />
            <span className="text-center text-sm font-extrabold tracking-wide uppercase">{name ?? "—"}</span>
        </div>
    );
}
