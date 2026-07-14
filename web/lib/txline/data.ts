import { backendUrl } from "./config";

/**
 * TxLINE data, via our backend.
 *
 * The browser sends NO credentials: the server holds the TxLINE API token and
 * proxies every call. That's what lets anyone open the app and see matches
 * immediately — previously each visitor had to run an on-chain activation
 * (15-30s, and it needs devnet SOL) before a single fixture would load.
 */
async function call(path: string): Promise<unknown> {
    const r = await fetch(`${backendUrl}${path}`);
    const text = await r.text();

    let data: unknown;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        // Non-JSON (e.g. an Express HTML 404) — the route probably isn't mounted.
        throw new Error(`Backend returned non-JSON (HTTP ${r.status}) for ${path}.`);
    }

    const err = (data as { error?: unknown })?.error;
    if (!r.ok || err) throw new Error(err ? JSON.stringify(err) : `HTTP ${r.status}`);
    return data;
}

export function getFixtures(opts?: { startEpochDay?: number; competitionId?: number }) {
    const p = new URLSearchParams();
    if (opts?.startEpochDay != null) p.set("startEpochDay", String(opts.startEpochDay));
    if (opts?.competitionId != null) p.set("competitionId", String(opts.competitionId));
    const qs = p.toString() ? `?${p}` : "";
    return call(`/api/fixtures/snapshot${qs}`);
}

/** Days since Unix epoch (UTC) — for startEpochDay. */
export function epochDay(ms = Date.now()): number {
    return Math.floor(ms / 86_400_000);
}

/** Full historical event stream for a finished fixture. */
export function getHistorical(fixtureId: number) {
    return call(`/api/scores/historical/${fixtureId}`);
}

export type FinalScore = { p1: number; p2: number } | null;

/** Batch final scores — one request; the backend computes them server-side. */
export async function getFinalScores(fixtureIds: number[]): Promise<Record<string, FinalScore>> {
    if (!fixtureIds.length) return {};

    const r = await fetch(`${backendUrl}/api/scores/final`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureIds }),
    });
    if (!r.ok) return {};
    return r.json();
}
