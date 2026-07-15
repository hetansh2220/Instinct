import { sql, eq, and } from "drizzle-orm";
import { db } from "../config/db.js";
import { users, entries, predictionWindows, predictions } from "../db/schema.js";
import { kindOf } from "./parse.js";

/**
 * Rolling live Yes/No windows driven by TxLINE Clock.Seconds + Seq.
 *
 * Window resolves TRUE when a matching event's Clock.Seconds falls inside
 * [windowStartClock, windowEndClock]. Resolves FALSE when the clock passes end.
 * Submissions close after 30s wall-clock (honesty), then the window observes.
 */

const EVENT_TYPES = ["goal", "corner", "card"];
const WINDOW_S = 180;
const ANSWER_MS = 30_000;
const POINTS = 20;
const FIRST_MS = 5_000;
const GRACE_MS = 45_000;

const LABELS = {
    goal: "a goal",
    corner: "a corner",
    card: "a card",
};

const matchesType = (eventType, kind) => {
    if (eventType === "goal") return kind === "goal";
    if (eventType === "corner") return kind === "corner";
    if (eventType === "card") return kind === "yellow" || kind === "red";
    return false;
};

/** fixtureId -> runtime game */
const games = new Map();
const pendingStops = new Map();

let emit = () => {};
let onLeaderboard = async () => {};

export function setWindowEmitter(fn, leaderboardFn) {
    emit = fn;
    if (leaderboardFn) onLeaderboard = leaderboardFn;
}

const tallyOf = (game) => {
    let yes = 0, no = 0;
    for (const g of game.guesses.values()) {
        if (g === "yes") yes++;
        else no++;
    }
    return { yes, no };
};

/** Payload the client needs to draw the prediction card. */
export function wireWindow(row, game) {
    if (!row) return null;
    const tally = game ? tallyOf(game) : { yes: 0, no: 0 };
    return {
        id: row.id,
        eventType: row.eventType,
        question: `Will there be ${LABELS[row.eventType] ?? row.eventType} in the next 3 min?`,
        points: POINTS,
        windowStartClock: row.windowStartClock,
        windowEndClock: row.windowEndClock,
        status: row.status,
        result: row.result ?? null,
        resolved: row.status === "resolved",
        locksAt: game?.locksAt ?? null,
        currentClock: game?.currentClock ?? row.windowStartClock,
        tally,
    };
}

export function activeWindow(fixtureId) {
    const game = games.get(Number(fixtureId));
    if (!game?.row) return null;
    return wireWindow(game.row, game);
}

export function guessOf(fixtureId, userId) {
    const game = games.get(Number(fixtureId));
    return game?.guesses.get(userId) ?? null;
}

/**
 * @param {{ lastSeq?: number, clockSeconds?: number, finished?: boolean }} seed
 */
export function startWindows(fixtureId, seed = {}) {
    fixtureId = Number(fixtureId);

    const stopping = pendingStops.get(fixtureId);
    if (stopping) {
        clearTimeout(stopping);
        pendingStops.delete(fixtureId);
    }

    if (games.has(fixtureId)) return;

    const game = {
        lastSeenSeq: seed.lastSeq ?? 0,
        currentClock: seed.clockSeconds ?? 0,
        turn: 0,
        row: null,
        guesses: new Map(), // userId -> "yes" | "no"
        wallets: new Map(), // userId -> wallet
        locksAt: null,
        timers: [],
        closed: false,
        finished: !!seed.finished,
        resolving: false,
    };
    games.set(fixtureId, game);

    console.log(
        `[windows] ${fixtureId} started @ clock ${game.currentClock}s seq ${game.lastSeenSeq}`
    );

    if (!game.finished) {
        game.timers.push(setTimeout(() => openNewWindow(fixtureId), FIRST_MS));
    }
}

export function stopWindows(fixtureId) {
    fixtureId = Number(fixtureId);
    if (!games.has(fixtureId) || pendingStops.has(fixtureId)) return;

    pendingStops.set(
        fixtureId,
        setTimeout(() => {
            pendingStops.delete(fixtureId);
            const game = games.get(fixtureId);
            if (!game) return;
            game.closed = true;
            for (const t of game.timers) clearTimeout(t);
            games.delete(fixtureId);
            console.log(`[windows] ${fixtureId} stopped (room stayed empty)`);
        }, GRACE_MS)
    );
}

/** Advance Seq/clock on an already-running game (no resolve). */
export function seedRuntime(fixtureId, { lastSeq = 0, clockSeconds = 0 } = {}) {
    const game = games.get(Number(fixtureId));
    if (!game) return;
    game.lastSeenSeq = Math.max(game.lastSeenSeq, lastSeq);
    if (clockSeconds) game.currentClock = clockSeconds;
}

export async function openNewWindow(fixtureId, eventType) {
    fixtureId = Number(fixtureId);
    const game = games.get(fixtureId);
    if (!game || game.closed || game.finished) return null;
    if (game.row && game.row.status !== "resolved") return game.row;

    const type = eventType ?? EVENT_TYPES[game.turn % EVENT_TYPES.length];
    game.turn += 1;

    const start = Math.max(0, Math.floor(game.currentClock));
    const end = start + WINDOW_S;

    try {
        const [row] = await db
            .insert(predictionWindows)
            .values({
                fixtureId,
                eventType: type,
                windowStartClock: start,
                windowEndClock: end,
                status: "open",
            })
            .returning();

        game.row = row;
        game.guesses = new Map();
        game.wallets = new Map();
        game.locksAt = Date.now() + ANSWER_MS;

        emit(fixtureId, "window_opened", wireWindow(row, game));

        const lockTimer = setTimeout(() => lockWindow(fixtureId, row.id), ANSWER_MS);
        game.timers.push(lockTimer);

        console.log(
            `[windows] ${fixtureId} opened ${type} [${start}, ${end}] clock`
        );
        return row;
    } catch (e) {
        console.log(`[windows] ${fixtureId} open failed: ${e.message}`);
        return null;
    }
}

async function lockWindow(fixtureId, windowId) {
    const game = games.get(Number(fixtureId));
    if (!game?.row || game.row.id !== windowId) return;
    if (game.row.status !== "open") return;

    try {
        const [row] = await db
            .update(predictionWindows)
            .set({ status: "locked" })
            .where(
                and(
                    eq(predictionWindows.id, windowId),
                    eq(predictionWindows.status, "open")
                )
            )
            .returning();

        if (!row) return;
        game.row = row;
        emit(fixtureId, "window_locked", {
            id: row.id,
            tally: tallyOf(game),
            status: "locked",
        });
    } catch (e) {
        console.log(`[windows] ${fixtureId} lock failed: ${e.message}`);
    }
}

/**
 * One guess per user per window. Rejects after lock / resolve.
 */
export async function submitPrediction(user, matchId, windowId, guess) {
    matchId = Number(matchId);
    const choice = guess === true || guess === "yes" ? "yes" : "no";
    const game = games.get(matchId);
    const row = game?.row;

    if (!row || row.id !== windowId) {
        return { ok: false, reason: "No open window." };
    }
    if (row.status === "resolved") {
        return { ok: false, reason: "Window already resolved." };
    }
    if (row.status === "locked" || (game.locksAt && Date.now() >= game.locksAt)) {
        return { ok: false, reason: "Too late — locked." };
    }
    if (game.guesses.has(user.id)) {
        return { ok: false, reason: "Already locked in." };
    }

    try {
        await db.insert(predictions).values({
            userId: user.id,
            fixtureId: matchId,
            windowId,
            guess: choice,
        });

        game.guesses.set(user.id, choice);
        game.wallets.set(user.id, user.wallet);

        const tally = tallyOf(game);
        emit(matchId, "window_tally", { id: windowId, tally });
        return { ok: true, guess: choice, tally };
    } catch (e) {
        // Unique conflict = already answered
        if (String(e.message).includes("unique") || e.code === "23505") {
            return { ok: false, reason: "Already locked in." };
        }
        return { ok: false, reason: e.message };
    }
}

/**
 * Poll/SSE handler: filter Seq > lastSeenSeq, sort ascending, walk all of them.
 */
export async function processNewEvents(matchId, allEvents) {
    matchId = Number(matchId);
    const game = games.get(matchId);
    if (!game || game.closed) return;

    const list = Array.isArray(allEvents) ? allEvents : [allEvents];
    const fresh = list
        .filter((e) => typeof e?.Seq === "number" && e.Seq > game.lastSeenSeq)
        .sort((a, b) => a.Seq - b.Seq);

    // Updates without Seq still advance the clock for timeout checks.
    for (const ev of list) {
        if (typeof ev?.Seq === "number") continue;
        if (typeof ev?.Clock?.Seconds === "number") {
            game.currentClock = ev.Clock.Seconds;
        }
    }

    for (const ev of fresh) {
        game.lastSeenSeq = Math.max(game.lastSeenSeq, ev.Seq);

        if (typeof ev.Clock?.Seconds === "number") {
            game.currentClock = ev.Clock.Seconds;
        }

        if (ev.Action === "action_discarded") continue;

        if (ev.Action === "game_finalised") {
            game.finished = true;
            // Close any open window as FALSE at full time.
            if (game.row && game.row.status !== "resolved") {
                await resolveWindow(game.row.id, false);
            }
            continue;
        }

        const row = game.row;
        if (row && row.status !== "resolved" && !game.resolving) {
            const kind = kindOf(ev.Action, ev.Data ?? {});
            const clock = ev.Clock?.Seconds;
            if (
                kind &&
                typeof clock === "number" &&
                matchesType(row.eventType, kind) &&
                clock >= row.windowStartClock &&
                clock <= row.windowEndClock
            ) {
                await resolveWindow(row.id, true);
                continue;
            }
        }

        await checkWindowTimeouts(matchId, game.currentClock);
    }

    await checkWindowTimeouts(matchId, game.currentClock);
}

export async function checkWindowTimeouts(matchId, currentClockSeconds) {
    matchId = Number(matchId);
    const game = games.get(matchId);
    if (!game?.row || game.row.status === "resolved" || game.resolving) return;

    const clock =
        typeof currentClockSeconds === "number"
            ? currentClockSeconds
            : game.currentClock;

    if (clock > game.row.windowEndClock) {
        await resolveWindow(game.row.id, false);
    }
}

export async function resolveWindow(windowId, result) {
    // Find the game holding this window.
    let fixtureId = null;
    let game = null;
    for (const [id, g] of games) {
        if (g.row?.id === windowId) {
            fixtureId = id;
            game = g;
            break;
        }
    }
    if (!game || game.resolving) return;
    if (game.row?.status === "resolved") return;

    game.resolving = true;

    try {
        const [row] = await db
            .update(predictionWindows)
            .set({
                status: "resolved",
                result: !!result,
                resolvedAt: new Date(),
            })
            .where(
                and(
                    eq(predictionWindows.id, windowId),
                    sql`${predictionWindows.status} <> 'resolved'`
                )
            )
            .returning();

        if (!row) {
            game.resolving = false;
            return;
        }
        game.row = row;

        const rows = await db
            .select()
            .from(predictions)
            .where(eq(predictions.windowId, windowId));

        const winners = [];

        for (const p of rows) {
            const isCorrect = (p.guess === "yes") === !!result;
            const pointsEarned = isCorrect ? POINTS : 0;

            await db
                .update(predictions)
                .set({ isCorrect, pointsEarned })
                .where(eq(predictions.id, p.id));

            if (pointsEarned > 0) {
                await db
                    .update(users)
                    .set({ points: sql`${users.points} + ${pointsEarned}` })
                    .where(eq(users.id, p.userId));

                winners.push({
                    userId: p.userId,
                    wallet: game.wallets.get(p.userId) ?? null,
                });
            }
        }

        // Fill wallets for winners missing from in-memory map (e.g. after restart).
        for (const w of winners) {
            if (w.wallet) continue;
            const [u] = await db.select({ wallet: users.wallet }).from(users).where(eq(users.id, w.userId));
            w.wallet = u?.wallet ?? null;
        }

        emit(fixtureId, "window_resolved", {
            id: row.id,
            eventType: row.eventType,
            result: !!result,
            points: POINTS,
            winners: winners.map((w) => w.wallet).filter(Boolean),
            tally: tallyOf(game),
            status: "resolved",
            resolved: true,
            question: `Will there be ${LABELS[row.eventType] ?? row.eventType} in the next 3 min?`,
            windowStartClock: row.windowStartClock,
            windowEndClock: row.windowEndClock,
            currentClock: game.currentClock,
        });

        console.log(
            `[windows] ${fixtureId} ${row.eventType} → ${result ? "YES" : "NO"} · ${winners.length}/${rows.length} correct`
        );

        game.resolving = false;
        await onLeaderboard(fixtureId);

        // Immediately open the next window (unless finished / room closed).
        if (!game.closed && !game.finished) {
            await openNewWindow(fixtureId);
        }
    } catch (e) {
        game.resolving = false;
        console.log(`[windows] resolve ${windowId} failed: ${e.message}`);
    }
}

/**
 * Computed per-match leaderboard:
 * sum(predictions.pointsEarned) + entries.points (match pick FT award).
 */
export async function matchLeaderboard(fixtureId) {
    fixtureId = Number(fixtureId);

    const entrants = await db
        .select({
            id: users.id,
            wallet: users.wallet,
            username: users.username,
            entryPoints: entries.points,
            pick: entries.pick,
        })
        .from(entries)
        .innerJoin(users, eq(entries.userId, users.id))
        .where(eq(entries.fixtureId, fixtureId));

    const windowPts = await db
        .select({
            userId: predictions.userId,
            pts: sql`coalesce(sum(${predictions.pointsEarned}), 0)`.mapWith(Number),
        })
        .from(predictions)
        .where(eq(predictions.fixtureId, fixtureId))
        .groupBy(predictions.userId);

    const byUser = new Map(windowPts.map((r) => [r.userId, r.pts]));

    const rows = entrants.map((e) => ({
        wallet: e.wallet,
        username: e.username,
        pick: e.pick,
        entryPoints: e.entryPoints ?? 0,
        windowPoints: byUser.get(e.id) ?? 0,
        totalPoints: (e.entryPoints ?? 0) + (byUser.get(e.id) ?? 0),
        points: (e.entryPoints ?? 0) + (byUser.get(e.id) ?? 0),
    }));

    rows.sort((a, b) => b.totalPoints - a.totalPoints || a.username.localeCompare(b.username));
    return rows;
}
