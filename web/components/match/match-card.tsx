import Link from "next/link";
import { teamFlag, teamCode } from "@/lib/txline/flags";

export interface Fixture {
    FixtureId: number;
    Participant1?: string;
    Participant2?: string;
    Participant1IsHome?: boolean;
    Competition?: string;
    StartTime?: number;
}


function timeLeft(ms?: number): string {
    if (!ms) return "";
    const diff = ms - Date.now();
    if (diff <= 0) return "";
    const d = Math.floor(diff / 8.64e7);
    const h = Math.floor((diff % 8.64e7) / 3.6e6);
    const m = Math.floor((diff % 3.6e6) / 6e4);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

export function MatchCard({ f, score }: { f: Fixture; score?: { home: number; away: number } | null }) {
    const p1IsHome = f.Participant1IsHome ?? true;
    const home = p1IsHome ? f.Participant1 : f.Participant2;
    const away = p1IsHome ? f.Participant2 : f.Participant1;
    const start = f.StartTime ?? 0;
    const now = Date.now();
    const state = !start || start > now ? "upcoming" : now < start + 2.5 * 60 * 60 * 1000 ? "live" : "completed";
    const left = timeLeft(f.StartTime);


    if (state === "completed" && !score) return null;

    return (
        <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">

            <div className="flex items-center justify-between px-4 pt-4">
                <span className="font-mono text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {f.Competition ?? "Match"}
                </span>
                {state === "live" ? (
                    <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-widest text-emerald-400 uppercase">
                        <span className="relative flex size-1.5">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                        </span>
                        live
                    </span>
                ) : state === "completed" ? (
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                        {start ? new Date(start).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                    </span>
                ) : (
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                        {left ? `${left} left` : "TBD"}
                    </span>
                )}
            </div>


            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 px-4 py-6">
                <Team name={home} />
                {score ? (
                    <span className="shrink-0 px-1 font-mono text-lg font-bold tabular-nums">
                        {score.home}
                        <span className="mx-1 text-muted-foreground">-</span>
                        {score.away}
                    </span>
                ) : (
                    <VsBadge />
                )}
                <Team name={away} />
            </div>


            <div className="px-4 pb-4">
                <Link
                    href={
                        state === "completed"
                            ? `/match/${f.FixtureId}?h=${encodeURIComponent(home ?? "")}&a=${encodeURIComponent(away ?? "")}`
                            : `/match/${f.FixtureId}/room`
                    }
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 text-md font-semibold text-foreground shadow-inner shadow-white/5 backdrop-blur-md transition-colors hover:border-white/25 hover:bg-white/15"
                >
                    {state === "completed" ? "View result" : "Join contest"}
                </Link>
            </div>
        </div>
    );
}

function Team({ name }: { name?: string }) {
    const code = teamCode(name);
    return (
        <div className="flex flex-col items-center gap-2.5">
            {code ? (

                <img
                    src={`https://flagcdn.com/w160/${code}.png`}
                    alt={name ?? ""}
                    className="h-9 w-14 rounded-md object-cover ring-1 ring-border"
                />
            ) : (
                <span className="grid h-9 w-14 place-items-center rounded-md bg-muted text-xl ring-1 ring-border">
                    {teamFlag(name)}
                </span>
            )}
            <span className="line-clamp-1 text-center text-[13px] font-extrabold tracking-wide text-balance uppercase">
                {name ?? "—"}
            </span>
        </div>
    );
}

function VsBadge() {
    return (
        <span className="shrink-0 px-2 font-mono text-md font-semibold text-muted-foreground">
            vs
        </span>
    );
}
