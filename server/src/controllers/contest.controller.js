import { and, eq, sql } from "drizzle-orm";
import { db } from "../config/db.js";
import { users, entries } from "../db/schema.js";
import { txlineHeaders } from "../config/txline.js";

const txline = process.env.TXLINE_ORIGIN;
const CORRECT_POINTS = 15;

/**
 * The final score, straight from TxLINE — NOT from anything the client sends, and
 * NOT from live events. Settling on live events would pay out for goals the feed
 * later retracts (VAR); the historical feed is only published once the match is
 * over, so it is already the corrected version.
 *
 * Goals are counted from `Action: "goal"` events, NOT from the Stats counters.
 * The counters proved unreliable here (they settled a 2-3 win as a draw); the
 * event stream is what the frontend timeline uses and it matches reality.
 *
 * The feed RE-EMITS each goal as it learns more about it, so identical goals are
 * deduped by (clock, participant) — counting raw emissions would treble the score.
 */
async function finalScore(req, fixtureId) {
    const r = await fetch(`${txline}/api/scores/historical/${fixtureId}`, {
        headers: await txlineHeaders(req),
    });
    if (!r.ok) throw new Error(`TxLINE ${r.status}`);

    const events = (await r.text())
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => {
            try { return JSON.parse(l.slice(l.indexOf(":") + 1).trim()); } catch { return null; }
        })
        .filter(Boolean);

    if (!events.length) throw new Error("no events — match may not be finished");

    const goals = new Set();
    for (const ev of events) {
        if (ev.Action !== "goal") continue;
        const side = ev.Participant ?? ev.Data?.Participant;
        if (side !== 1 && side !== 2) continue;
        goals.add(`${ev.Clock?.Seconds ?? "?"}|${side}`);
    }

    let p1 = 0, p2 = 0;
    for (const key of goals) {
        if (key.endsWith("|1")) p1++;
        else p2++;
    }

    const p1IsHome = events[0]?.Participant1IsHome ?? true;
    const home = p1IsHome ? p1 : p2;
    const away = p1IsHome ? p2 : p1;
    return { home, away, result: home > away ? "home" : home < away ? "away" : "draw" };
}

async function leaderboardOf(fixtureId) {
    const rows = await db
        .select({
            wallet: users.wallet,
            username: users.username,
            pick: entries.pick,
            points: entries.points,
            settled: entries.settled,
            total: users.points,
        })
        .from(entries)
        .innerJoin(users, eq(entries.userId, users.id))
        .where(eq(entries.fixtureId, Number(fixtureId)));

    // Winners first, then by lifetime points so the order is stable.
    rows.sort((a, b) => b.points - a.points || b.total - a.total);

    const distribution = { home: 0, draw: 0, away: 0 };
    for (const r of rows) distribution[r.pick] = (distribution[r.pick] ?? 0) + 1;

    return { entries: rows, distribution };
}

/**
 * POST /api/contests/:fixtureId/settle
 *
 * Settles lazily — the first person to open a finished match pays everyone out.
 * No cron, no job queue. The `settled` flag makes it idempotent, so a second
 * caller (or a double-mounted effect) can't pay twice.
 */
export async function settle(req, res) {
    const fixtureId = Number(req.params.fixtureId);

    try {
        const pending = await db
            .select()
            .from(entries)
            .where(and(eq(entries.fixtureId, fixtureId), eq(entries.settled, false)));

        // Nothing to settle — just report.
        if (!pending.length) {
            const board = await leaderboardOf(fixtureId);
            return res.json({ settled: false, ...board });
        }

        const score = await finalScore(req, fixtureId);

        for (const entry of pending) {
            const award = entry.pick === score.result ? CORRECT_POINTS : 0;

            // Guarded on settled=false, so two concurrent callers can't both pay
            // this row: the second update matches nothing.
            const [updated] = await db
                .update(entries)
                .set({ points: award, settled: true })
                .where(and(eq(entries.id, entry.id), eq(entries.settled, false)))
                .returning();

            if (updated && award > 0) {
                await db
                    .update(users)
                    .set({ points: sql`${users.points} + ${award}` })
                    .where(eq(users.id, entry.userId));
            }
        }

        const board = await leaderboardOf(fixtureId);
        res.json({ settled: true, score, ...board });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

/** GET /api/contests/:fixtureId/leaderboard — results without settling. */
export async function leaderboard(req, res) {
    try {
        res.json(await leaderboardOf(Number(req.params.fixtureId)));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

/**
 * GET /api/leaderboard — all-time standings.
 *
 * Points live on the user (settlement adds to them), but predictions and wins are
 * counted from `entries` so the table stays honest even if points are ever
 * adjusted by hand.
 */
export async function globalLeaderboard(_req, res) {
    try {
        const rows = await db
            .select({
                wallet: users.wallet,
                username: users.username,
                points: users.points,
                // SETTLED entries only. A pick on a match that hasn't finished isn't a
                // loss yet — counting it would drag your win rate down for matches you
                // might still win.
                predictions: sql`count(*) filter (where ${entries.settled})`.mapWith(Number),
                wins: sql`count(*) filter (where ${entries.points} > 0)`.mapWith(Number),
                // Still in play — shown separately, never mixed into the win rate.
                pending: sql`count(*) filter (where ${entries.id} is not null and not ${entries.settled})`.mapWith(
                    Number
                ),
            })
            .from(users)
            .leftJoin(entries, eq(entries.userId, users.id))
            .groupBy(users.id)
            // Points first; ties broken by who won more, then by who needed fewer
            // settled matches to get there.
            .orderBy(
                sql`${users.points} desc,
                    count(*) filter (where ${entries.points} > 0) desc,
                    count(*) filter (where ${entries.settled}) asc`
            );

        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
