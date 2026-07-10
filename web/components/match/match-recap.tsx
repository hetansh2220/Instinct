"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTxlineCreds } from "@/lib/txline/creds";
import { getHistorical } from "@/lib/txline/data";
import { teamCode, teamFlag } from "@/lib/txline/flags";
import { cn } from "@/lib/utils";

interface HistEvent {
    Action?: string;
    Clock?: { Seconds?: number };
    Ts?: number;
    Stats?: Record<string, number>;
    Participant1Id?: number;
    Participant2Id?: number;
    Participant1IsHome?: boolean;
    ParticipantId?: number;
    TeamId?: number;
    Data?: Record<string, unknown> & { Type?: string };
}

const META = new Set([
    "coverage_update", "comment", "connected", "disconnected", "venue", "pitch", "lineups",
]);

function statTotal(stats: Record<string, number> | undefined, base: number): number {
    if (!stats) return 0;
    const d = stats[String(base)];
    if (typeof d === "number") return d;
    let sum = 0;
    for (const p of [1, 2, 3, 4, 5]) {
        const v = stats[String(p * 1000 + base)];
        if (typeof v === "number") sum += v;
    }
    return sum;
}


function sideOf(ev: HistEvent, p1Id?: number, p2Id?: number, p1IsHome?: boolean): 1 | 2 | null {
    const pid = ev.ParticipantId ?? ev.TeamId ?? (ev.Data?.["ParticipantId"] as number | undefined);
    if (pid != null && pid === p1Id) return 1;
    if (pid != null && pid === p2Id) return 2;
    const t = ev.Data?.Type;
    if (t === "home") return p1IsHome ? 1 : 2;
    if (t === "away") return p1IsHome ? 2 : 1;
    return null;
}

interface TimelineItem {
    min: number;
    kind: string;
    label: string;
    detail?: string;
    side: 1 | 2 | null;
}

function iconFor(kind: string): string {
    if (kind.includes("goal")) return "⚽";
    if (kind.includes("red")) return "🟥";
    if (kind.includes("yellow") || kind.includes("card")) return "🟨";
    if (kind.includes("sub")) return "🔁";
    if (kind.includes("penalt")) return "⚪";
    if (kind.includes("shot")) return "🎯";
    if (kind.includes("corner")) return "🚩";
    if (kind.includes("offside")) return "🚫";
    return "•";
}

function titleFor(action: string): string {
    const a = action.replace(/_/g, " ");
    return a.charAt(0).toUpperCase() + a.slice(1);
}

function parse(events: HistEvent[]) {
    const first = events[0] ?? {};
    const p1Id = first.Participant1Id;
    const p2Id = first.Participant2Id;
    const p1IsHome = first.Participant1IsHome ?? true;

    const maxStat = (base: number) => events.reduce((m, ev) => Math.max(m, statTotal(ev.Stats, base)), 0);


    const goals: [number, number] = [maxStat(1), maxStat(2)];
    const corners: [number, number] = [maxStat(7), maxStat(8)];
    const yellow: [number, number] = [maxStat(3), maxStat(4)];
    const red: [number, number] = [maxStat(5), maxStat(6)];


    const shots: [number, number] = [0, 0];
    const shotsOnTarget: [number, number] = [0, 0];
    const offsides: [number, number] = [0, 0];
    const timeline: TimelineItem[] = [];

    for (const ev of events) {
        const action = (ev.Action ?? "").toLowerCase();
        if (!action || META.has(action)) continue;
        const side = sideOf(ev, p1Id, p2Id, p1IsHome);
        const blob = JSON.stringify(ev.Data ?? {}).toLowerCase();

        if (side) {
            const i = side - 1;
            if (action.includes("shot")) {
                shots[i]++;
                if (blob.includes("on target")) shotsOnTarget[i]++;
            }
            if (action.includes("offside")) offsides[i]++;
        }

        const sec = ev.Clock?.Seconds;
        if (sec != null && sec > 0) {
            const detailStr = (ev.Data?.["detail"] ?? ev.Data?.["Detail"]) as string | undefined;
            timeline.push({
                min: Math.floor(sec / 60),
                kind: action,
                label: titleFor(ev.Action ?? ""),
                detail: detailStr,
                side,
            });
        }
    }
    timeline.sort((a, b) => b.min - a.min);

    return { p1IsHome, goals, corners, yellow, red, shots, shotsOnTarget, offsides, timeline };
}

export function MatchRecap({ matchId, home, away }: { matchId: number; home?: string; away?: string }) {
    const creds = useTxlineCreds();
    const [tab, setTab] = useState<"stats" | "timeline">("stats");

    const { data, isLoading } = useQuery({
        queryKey: ["historical", matchId],
        enabled: !!creds,
        staleTime: Infinity,
        queryFn: async () => {
            const raw = (await getHistorical(creds!, matchId)) as unknown;
            return Array.isArray(raw) ? (raw as HistEvent[]) : [];
        },
    });

    const parsed = useMemo(() => (data ? parse(data) : null), [data]);
    const p1IsHome = parsed?.p1IsHome ?? true;

    const toHA = (t?: [number, number]): [number, number] =>
        !t ? [0, 0] : p1IsHome ? t : [t[1], t[0]];

    const [hg, ag] = toHA(parsed?.goals);

    const rows: { label: string; h: number; a: number }[] = parsed
        ? [
            { label: "Shots", ...pair(toHA(parsed.shots)) },
            { label: "Shots on target", ...pair(toHA(parsed.shotsOnTarget)) },
            { label: "Corners", ...pair(toHA(parsed.corners)) },
            { label: "Offsides", ...pair(toHA(parsed.offsides)) },
            { label: "Yellow cards", ...pair(toHA(parsed.yellow)) },
            { label: "Red cards", ...pair(toHA(parsed.red)) },
        ].filter((r) => r.h + r.a > 0 || ["Corners", "Yellow cards", "Red cards"].includes(r.label))
        : [];

    return (
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-5 py-8 sm:px-8">
            <Link href="/" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                <ArrowLeft className="size-4" /> Matches
            </Link>


            <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <TeamCol name={home} />
                    <div className="flex flex-col items-center gap-2">
                        <span className="font-mono text-4xl font-bold tabular-nums">
                            {isLoading ? "–" : hg}
                            <span className="mx-2 text-muted-foreground">-</span>
                            {isLoading ? "–" : ag}
                        </span>
                        <span className="rounded-full border border-border px-2.5 py-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                            full time
                        </span>
                    </div>
                    <TeamCol name={away} />
                </div>
            </section>


            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-1.5">
                {(["stats", "timeline"] as const).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                            "rounded-xl py-3 font-mono text-xs font-bold tracking-widest uppercase transition-colors",
                            tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div className="h-64 animate-pulse rounded-2xl bg-card" />
            ) : tab === "stats" ? (
                <section className="rounded-2xl border border-border bg-card p-6">
                    <div className="mb-5 grid grid-cols-[auto_1fr_auto] items-center font-mono text-[11px] tracking-wider uppercase">
                        <span className="text-foreground">{code(home)}</span>
                        <span className="text-center text-muted-foreground">Match stats</span>
                        <span className="text-right text-foreground">{code(away)}</span>
                    </div>
                    <div className="flex flex-col gap-4">
                        {rows.map((r) => {
                            const total = r.h + r.a || 1;
                            return (
                                <div key={r.label} className="flex flex-col gap-1.5">
                                    <div className="grid grid-cols-[auto_1fr_auto] items-center text-sm">
                                        <span className="w-10 font-mono font-semibold tabular-nums">{r.h}</span>
                                        <span className="text-center text-[11px] tracking-wide text-muted-foreground uppercase">
                                            {r.label}
                                        </span>
                                        <span className="w-10 text-right font-mono font-semibold tabular-nums">{r.a}</span>
                                    </div>
                                    <div className="flex h-1 gap-0.5">
                                        <div className="flex flex-1 justify-end overflow-hidden rounded-l-full bg-muted">
                                            <div className="h-full bg-foreground/60" style={{ width: `${(r.h / total) * 100}%` }} />
                                        </div>
                                        <div className="flex flex-1 overflow-hidden rounded-r-full bg-muted">
                                            <div className="h-full bg-foreground/30" style={{ width: `${(r.a / total) * 100}%` }} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <p className="mt-6 text-center font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                        via TxLINE
                    </p>
                </section>
            ) : (
                <section className="flex flex-col gap-2">
                    {parsed && parsed.timeline.length > 0 ? (
                        parsed.timeline.map((e, i) => (
                            <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                                <span className="w-10 font-mono text-xs tabular-nums text-muted-foreground">{e.min}&apos;</span>
                                <span className="text-base">{iconFor(e.kind)}</span>
                                <span className="flex-1 text-sm">
                                    <span className="font-semibold">{e.label}</span>
                                    {e.detail && <span className="ml-2 text-muted-foreground">{e.detail}</span>}
                                </span>
                                {e.side && (
                                    <FlagImg name={e.side === 1 ? (p1IsHome ? home : away) : p1IsHome ? away : home} small />
                                )}
                            </div>
                        ))
                    ) : (
                        <p className="py-12 text-center text-sm text-muted-foreground">No timeline events.</p>
                    )}
                </section>
            )}
        </main>
    );
}

function code(name?: string) {
    return name?.slice(0, 3).toUpperCase() ?? "—";
}

function pair([h, a]: [number, number]) {
    return { h, a };
}

function FlagImg({ name, small }: { name?: string; small?: boolean }) {
    const c = teamCode(name);
    const size = small ? "h-6 w-8" : "h-9 w-12";
    return c ? (

        <img src={`https://flagcdn.com/w160/${c}.png`} alt={name ?? ""} className={cn("rounded object-cover ring-1 ring-border", size)} />
    ) : (
        <span className={cn("grid place-items-center rounded bg-muted ring-1 ring-border", size)}>{teamFlag(name)}</span>
    );
}

function TeamCol({ name }: { name?: string }) {
    return (
        <div className="flex flex-col items-center gap-2.5">
            <FlagImg name={name} />
            <span className="text-center text-sm font-extrabold tracking-wide uppercase">{name ?? "—"}</span>
        </div>
    );
}
