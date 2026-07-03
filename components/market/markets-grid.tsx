"use client";

import { useEffect, useMemo, useState } from "react";
import { type Market, type Outcome } from "@/lib/markets/types";
import { fixtureToMarket } from "@/lib/markets/from-fixtures";
import { useTxlineCreds } from "@/lib/txline/creds";
import { useFixtures } from "@/lib/txline/queries";
import { MarketCard } from "./market-card";
import { MarketCardSkeleton } from "./market-card-skeleton";
import { BetSheet } from "./bet-sheet";
import { cn } from "@/lib/utils";

export function MarketsGrid() {
    const creds = useTxlineCreds();
    const [markets, setMarkets] = useState<Market[]>([]);

    const [filter, setFilter] = useState<string>("All");
    const [selection, setSelection] = useState<{ market: Market; outcome: Outcome } | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);

    const fixtures = useFixtures(creds);

    // map live fixtures into markets (kept in state so local bet bumps work)
    useEffect(() => {
        if (!fixtures.data) return;
        const now = Date.now();
        const mapped = fixtures.data
            .filter((f) => f?.FixtureId && f?.Participant1 && f?.Participant2)
            .slice(0, 30)
            .map((f) => fixtureToMarket(f, now));
        setMarkets(mapped);
    }, [fixtures.data]);

    const filters = useMemo(() => {
        const comps = Array.from(new Set(markets.map((m) => m.competition)));
        return ["All", ...comps.slice(0, 6), "Live"];
    }, [markets]);

    function matchesFilter(m: Market): boolean {
        if (filter === "All") return true;
        if (filter === "Live") return m.status === "live";
        if (filter === "Settled") return m.status === "resolved";
        return m.competition === filter;
    }

    const visible = markets.filter(matchesFilter);

    function pick(market: Market, outcome: Outcome) {
        setSelection({ market, outcome });
        setSheetOpen(true);
    }

    // Locally bump the pool so the UI reacts to a bet (no chain yet).
    function place(stake: number) {
        if (!selection) return;
        const { market, outcome } = selection;
        setMarkets((prev) =>
            prev.map((m) =>
                m.id === market.id
                    ? {
                        ...m,
                        bettors: m.bettors + 1,
                        outcomes: m.outcomes.map((o) =>
                            o.key === outcome.key ? { ...o, pool: o.pool + stake } : o
                        ),
                    }
                    : m
            )
        );
    }

    const loading = fixtures.isLoading;

    return (
        <div className="flex flex-col gap-6">



            {fixtures.error && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm break-all text-destructive">
                    Couldn’t load live fixtures: {(fixtures.error as Error).message}
                </p>
            )}

            {/* filter pills — only once we have markets */}
            {markets.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    {filters.map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={cn(
                                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                                filter === f
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            )}

            {/* content states */}
            {loading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <MarketCardSkeleton key={i} />
                    ))}
                </div>
            ) : !creds ? (
                <div className="flex flex-col items-center gap-2 py-20 text-center">
                    <p className="text-sm font-medium">No live markets yet</p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                        Connect your wallet and hit{" "}
                        <span className="font-medium text-foreground">Subscribe &amp; Activate</span> in
                        the top bar to load live markets.
                    </p>
                </div>
            ) : visible.length === 0 ? (
                <p className="py-20 text-center text-sm text-muted-foreground">
                    No markets available right now.
                </p>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {visible.map((m) => (
                        <MarketCard key={m.id} market={m} onPick={pick} />
                    ))}
                </div>
            )}

            {markets.length > 0 && (
                <p className="text-center text-xs text-muted-foreground">
                    Matches, competitions & kickoff times are live from TxLINE. Pools are simulated
                    until the on-chain market program ships.
                </p>
            )}

            <BetSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                selection={selection}
                onPlace={place}
            />
        </div>
    );
}
