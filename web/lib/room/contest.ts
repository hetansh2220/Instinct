"use client";

import { useQuery } from "@tanstack/react-query";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export type Pick = "home" | "draw" | "away";

export interface ContestEntry {
    wallet: string;
    username: string;
    pick: Pick;
    /** Points from THIS match. */
    points: number;
    settled: boolean;
    /** Lifetime points. */
    total: number;
}

export interface Contest {
    settled: boolean;
    score?: { home: number; away: number; result: Pick };
    entries: ContestEntry[];
    distribution: Record<Pick, number>;
}

/**
 * The contest result for a finished match.
 *
 * Settlement is LAZY: opening the page settles it if nobody has yet. The server
 * is idempotent (guarded on `settled`), so mounting twice can't double-pay — no
 * cron or job queue needed.
 */
export function useContest(fixtureId: number, enabled = true) {
    return useQuery({
        queryKey: ["contest", fixtureId],
        enabled,
        staleTime: 60_000,
        retry: false,
        queryFn: async (): Promise<Contest> => {
            // No credentials — the server holds the TxLINE token and fetches the
            // final score itself.
            const res = await fetch(`${API}/api/contests/${fixtureId}/settle`, {
                method: "POST",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? `settle failed (${res.status})`);
            return data;
        },
    });
}

