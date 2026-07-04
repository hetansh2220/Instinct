import Link from "next/link";
import { TrendingUp } from "lucide-react";
import {
    formatKickoff,
    formatUsd,
    impliedProb,
    outcomeShort,
    teamFlag,
    totalPool,
    type Market,
    type Outcome,
    type OutcomeKey,
} from "@/lib/markets/types";
import { cn } from "@/lib/utils";

// tint per outcome, echoing the reference's green "up" / red "down" buttons
const OUTCOME_TINT: Record<OutcomeKey, string> = {
    HOME: "border-emerald-500/15 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
    DRAW: "border-border bg-muted/50 text-foreground hover:bg-muted",
    AWAY: "border-rose-500/15 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20",
};

export function MarketCard({
    market,
    onPick,
}: {
    market: Market;
    onPick: (market: Market, outcome: Outcome) => void;
}) {
    const resolved = market.status === "resolved";

    return (
        <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-border/70">

            <Link href={`/market/${market.id}`} className="flex items-start gap-3.5">
                <MatchAvatar home={market.home} away={market.away} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                        {market.competition}
                    </span>
                    <span className="text-base leading-snug font-semibold tracking-tight">
                        {market.home} <span className="text-muted-foreground">vs</span> {market.away}
                    </span>
                </div>
            </Link>


            <div className="grid grid-cols-3 gap-2">
                {market.outcomes.map((o) => {
                    const pct = Math.round(impliedProb(market, o) * 100);
                    const isWinner = resolved && market.resolved === o.key;
                    const isLoser = resolved && market.resolved !== o.key;
                    return (
                        <button
                            key={o.key}
                            type="button"
                            disabled={resolved}
                            onClick={() => onPick(market, o)}
                            className={cn(
                                "flex items-center justify-center gap-1.5 rounded-md border px-3 py-3.5 text-[15px] font-semibold transition-colors",
                                OUTCOME_TINT[o.key],
                                isWinner && "[#18251C]",
                                isLoser && "[#2A191A]"
                            )}
                        >
                            <span>{outcomeShort(o.key)}</span>
                            <span className="font-mono tabular-nums">{pct}%</span>
                        </button>
                    );
                })}
            </div>


            <div className="flex items-center justify-between text-xs">
                <StatusFoot market={market} />
                <span className="flex items-center gap-1 font-mono tabular-nums text-muted-foreground">
                    <TrendingUp className="size-3.5" />
                    {formatUsd(totalPool(market))} USDC
                </span>
            </div>
        </div>
    );
}

function MatchAvatar({ home, away }: { home: string; away: string }) {
    return (
        <div className="relative size-12 shrink-0">
            <span className="absolute top-0 left-0 grid size-9 place-items-center rounded-full bg-muted text-base ring-2 ring-card">
                {teamFlag(home)}
            </span>
            <span className="absolute right-0 bottom-0 grid size-9 place-items-center rounded-full bg-muted text-base ring-2 ring-card">
                {teamFlag(away)}
            </span>
        </div>
    );
}

function StatusFoot({ market }: { market: Market }) {
    if (market.status === "live") {
        return (
            <span className="flex items-center gap-1.5 font-mono font-medium tracking-wider text-emerald-400 uppercase">
                <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                </span>
                live
            </span>
        );
    }
    if (market.status === "resolved") {
        return (
            <span className="font-mono tracking-wider text-muted-foreground uppercase">
                settled · {outcomeShort(market.resolved ?? "HOME")}
            </span>
        );
    }
    return (
        <span className="font-mono tracking-wide text-muted-foreground tabular-nums">
            {formatKickoff(market.kickoff)}
        </span>
    );
}
