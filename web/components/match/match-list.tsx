"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTxlineCreds } from "@/lib/txline/creds";
import { getFixtures, getFinalScores, epochDay } from "@/lib/txline/data";
import { MatchCard, type Fixture } from "./match-card";
import { cn } from "@/lib/utils";

const LIVE_WINDOW = 2.5 * 60 * 60 * 1000; // treat first ~2.5h after kickoff as "live"

function matchesFilter(f: Fixture, filter: string): boolean {
    if (filter === "All") return true;
    const now = Date.now();
    const start = f.StartTime ?? 0;
    if (filter === "Upcoming") return start > now;
    if (filter === "Live") return start <= now && now < start + LIVE_WINDOW;
    if (filter === "Completed") return start > 0 && now >= start + LIVE_WINDOW;
    return f.Competition === filter; // competition name
}

const toList = (raw: unknown): Fixture[] =>
    (Array.isArray(raw) ? raw : ((raw as { fixtures?: Fixture[] })?.fixtures ?? [])) as Fixture[];

export function MatchList() {
    const creds = useTxlineCreds();
    const [filter, setFilter] = useState("All");

    const {
        data: fixtures = [],
        isPending: loading,
        error,
    } = useQuery({
        queryKey: ["fixtures"],
        enabled: !!creds,
        queryFn: async () => {
            // upcoming (default window) + one past window (~2 weeks, the only range
            // where completed matches still have a fetchable score)
            const today = epochDay();
            const requests = [
                getFixtures(creds!),
                getFixtures(creds!, { startEpochDay: today - 14 }).catch(() => []),
            ];
            const results = await Promise.all(requests);
            const byId = new Map<number, Fixture>();
            for (const r of results) {
                for (const f of toList(r)) {
                    if (f?.FixtureId) byId.set(f.FixtureId, f);
                }
            }
            return [...byId.values()].sort((a, b) => (b.StartTime ?? 0) - (a.StartTime ?? 0));
        },
    });

    const tabs = useMemo(() => {
        const comps = Array.from(new Set(fixtures.map((f) => f.Competition).filter(Boolean))) as string[];
        return ["All", ...comps, "Upcoming", "Live", "Completed"];
    }, [fixtures]);

    // ids of completed matches within the ~2-week scoreable window
    const completedIds = useMemo(() => {
        const now = Date.now();
        return fixtures
            .filter((f) => f.StartTime && f.StartTime <= now - LIVE_WINDOW && f.StartTime > now - 14 * 24 * 60 * 60 * 1000)
            .map((f) => f.FixtureId)
            .sort((a, b) => a - b);
    }, [fixtures]);

    // one request for ALL completed scores (computed server-side) → fast + together
    const { data: scoreMap, isLoading: scoresLoading } = useQuery({
        queryKey: ["scores", completedIds],
        enabled: !!creds && completedIds.length > 0,
        staleTime: Infinity,
        gcTime: 30 * 60_000,
        queryFn: () => getFinalScores(creds!, completedIds),
    });

    const scoreFor = (f: Fixture): { home: number; away: number } | undefined => {
        const raw = scoreMap?.[f.FixtureId];
        if (!raw) return undefined;
        const p1IsHome = f.Participant1IsHome ?? true;
        return { home: p1IsHome ? raw.p1 : raw.p2, away: p1IsHome ? raw.p2 : raw.p1 };
    };

    if (!creds) return null;

    // hold the skeleton until fixtures AND completed scores are ready → all cards appear at once
    if (loading || scoresLoading) {
        return (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-48 animate-pulse rounded-2xl bg-card" />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm break-all text-destructive">
                {(error as Error).message}
            </p>
        );
    }

    const visible = fixtures.filter((f) => matchesFilter(f, filter));

    return (
        <div className="flex flex-col gap-6">
            {/* filter tabs */}
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {tabs.map((t) => (
                    <button
                        key={t}
                        onClick={() => setFilter(t)}
                        className={cn(
                            "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                            filter === t
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {/* grid */}
            {visible.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">No matches here.</p>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {visible.map((f) => (
                        <MatchCard key={f.FixtureId} f={f} score={scoreFor(f)} />
                    ))}
                </div>
            )}
        </div>
    );
}
