import { backendUrl } from "./config";
import type { TxlineCreds } from "./creds";

async function call(path: string, creds: TxlineCreds): Promise<unknown> {
    const r = await fetch(`${backendUrl}${path}`, {
        headers: { "x-jwt": creds.jwt, "x-api-token": creds.apiToken },
    });
    const text = await r.text();
    let data: unknown;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        // non-JSON (e.g. Express 404 HTML page) — the route probably isn't mounted
        throw new Error(
            `Backend returned non-JSON (HTTP ${r.status}) for ${path}. ` +
                `Is the server running with the data routes? Restart it (npm run dev).`
        );
    }
    const err = (data as { error?: unknown })?.error;
    if (!r.ok || err) {
        throw new Error(err ? JSON.stringify(err) : `HTTP ${r.status}`);
    }
    return data;
}

export function getFixtures(creds: TxlineCreds, opts?: { startEpochDay?: number; competitionId?: number }) {
    const p = new URLSearchParams();
    if (opts?.startEpochDay != null) p.set("startEpochDay", String(opts.startEpochDay));
    if (opts?.competitionId != null) p.set("competitionId", String(opts.competitionId));
    const qs = p.toString() ? `?${p}` : "";
    return call(`/api/fixtures/snapshot${qs}`, creds);
}

/** Days since Unix epoch (UTC) — for startEpochDay. */
export function epochDay(ms = Date.now()): number {
    return Math.floor(ms / 86_400_000);
}

export type FinalScore = { p1: number; p2: number } | null;

/** Batch final scores — one request; the backend computes them server-side. */
export async function getFinalScores(
    creds: TxlineCreds,
    fixtureIds: number[]
): Promise<Record<string, FinalScore>> {
    if (!fixtureIds.length) return {};
    const r = await fetch(`${backendUrl}/api/scores/final`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-jwt": creds.jwt,
            "x-api-token": creds.apiToken,
        },
        body: JSON.stringify({ fixtureIds }),
    });
    if (!r.ok) return {};
    return r.json();
}
