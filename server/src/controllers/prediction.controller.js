import { createEntry } from "./room.controller.js";
import { submitPrediction, matchLeaderboard, activeWindow, guessOf } from "../live/windows.js";
import { db } from "../config/db.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

/**
 * POST /api/predictions/match  { matchId, guess, wallet, kickoff? }
 * Alias for the pre-match Home/Draw/Away entry.
 */
export async function predictMatch(req, res) {
    const { matchId, guess, wallet, kickoff } = req.body ?? {};
    req.body = {
        wallet,
        fixtureId: matchId,
        pick: guess,
        kickoff,
    };
    return createEntry(req, res);
}

/**
 * POST /api/predictions/window  { matchId, windowId, guess, wallet }
 * guess: "yes" | "no" | true | false
 */
export async function predictWindow(req, res) {
    const { matchId, windowId, guess, wallet } = req.body ?? {};
    if (!wallet || !matchId || !windowId) {
        return res.status(400).json({ error: "wallet, matchId and windowId required" });
    }
    if (guess !== "yes" && guess !== "no" && guess !== true && guess !== false) {
        return res.status(400).json({ error: "guess must be yes or no" });
    }

    try {
        const [user] = await db.select().from(users).where(eq(users.wallet, wallet));
        if (!user) return res.status(404).json({ error: "no profile for wallet" });

        const result = await submitPrediction(
            { id: user.id, wallet: user.wallet },
            matchId,
            windowId,
            guess
        );

        if (!result.ok) {
            const status = result.reason?.includes("late") ? 409 : 400;
            return res.status(status).json({ error: result.reason });
        }

        res.json({
            ok: true,
            guess: result.guess,
            tally: result.tally,
            window: activeWindow(matchId),
            mine: guessOf(matchId, user.id),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

/** GET /api/leaderboard/:matchId — computed window + match-pick points. */
export async function matchPointsLeaderboard(req, res) {
    try {
        const members = await matchLeaderboard(Number(req.params.matchId));
        res.json({ members });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
