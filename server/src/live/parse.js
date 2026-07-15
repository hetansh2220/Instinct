/**
 * Turns raw TxLINE score updates into match events the room can render.
 *
 * Everything here is a consequence of how the feed actually behaves:
 *
 *   - `Action` names the event ("goal", "yellow_card", "substitution"), and the
 *     player is referenced by Data.PlayerId — which is the player's *normativeId*
 *     in the Lineups, not their fixturePlayerId.
 *
 *   - The feed RE-EMITS an event as it learns more about it. A goal first arrives
 *     with Data:{}, and the PlayerId only turns up in a later copy at the same
 *     clock. So events are keyed by (action, clock, side) and enriched as the
 *     amendments land — never taken at first sight.
 *
 *   - Minutes round UP: 1761s is the 30th minute, not the 29th.
 */

const ACTION_KIND = {
    goal: "goal",
    yellow_card: "yellow",
    red_card: "red",
    corner: "corner",
    substitution: "sub",
};

/**
 * What kind of event this update is — NOT a plain lookup on Action, because a
 * penalty that goes in is never reported as a "goal".
 *
 * It arrives as `penalty_outcome` with `Data.Outcome: "Scored"`, and that is the
 * ONLY record of it: France v Spain's 22nd-minute penalty put Spain 1-0 up with
 * no `goal` action anywhere in the feed. A missed or saved penalty is the same
 * action with a different Outcome, so the Outcome is what decides.
 */
export function kindOf(action, data) {
    if (action === "penalty_outcome") {
        return data?.Outcome === "Scored" ? "goal" : null;
    }
    return ACTION_KIND[action] ?? null;
}

const displayName = (raw) => {
    if (!raw) return undefined;
    const [last, first] = raw.split(",").map((s) => s.trim());
    return first ? `${first} ${last}` : raw;
};

/** Build a playerId -> {name, number, side} map from a Lineups snapshot. */
export function squadFrom(update) {
    const teams = update?.Lineups ?? update?.lineups;
    if (!Array.isArray(teams) || !teams.length) return null;

    const squad = new Map();
    teams.forEach((team, i) => {
        const side =
            team.normativeId === update.Participant1Id ? 1
                : team.normativeId === update.Participant2Id ? 2
                    : i === 0 ? 1 : 2;

        for (const entry of team.lineups ?? []) {
            const name = displayName(entry.player?.preferredName);
            if (!name) continue;
            const number = Number(entry.rosterNumber);
            const player = { name, number: Number.isFinite(number) ? number : undefined, side };

            // Events reference the normativeId, but index both so a feed change
            // can't silently break attribution.
            for (const id of [entry.player?.normativeId, entry.fixturePlayerId]) {
                if (typeof id === "number") squad.set(id, player);
            }
        }
    });
    return squad.size ? squad : null;
}

/**
 * Fold one update into the running match state.
 * Returns the events that are NEW as a result (usually none, sometimes one).
 */
export function applyUpdate(state, update) {
    const action = update.Action;
    const data = update.Data ?? {};
    const seconds = update.Clock?.Seconds;

    /**
     * VAR. The feed retracts an event by re-sending it as `action_discarded` with
     * the SAME `Id` — that is the only link back to what it cancels. France v Spain
     * had a 61st-minute goal chalked off this way; without this the room sat on a
     * phantom 0-3 for the rest of the match, and settlement would have paid it out.
     */
    if (action === "action_discarded") {
        const key = state.byId.get(update.Id);
        const event = key && state.seen.get(key);
        if (!event) return [];

        state.seen.delete(key);
        state.byId.delete(update.Id);
        if (event.kind === "goal" && event.side) {
            state.score[event.side - 1] = Math.max(0, state.score[event.side - 1] - 1);
        }
        return [{ ...event, retracted: true }];
    }

    // Lineups can arrive at any point; keep the latest.
    const squad = squadFrom(update);
    if (squad) state.squad = squad;

    if (typeof seconds === "number") {
        // Latest clock wins — it is NOT monotonic. TxLINE retracts readings
        // (`clock_adjustment`, `action_discarded`), so a 52nd-minute event can be
        // withdrawn and the true clock corrected back down to 51'. Taking the max
        // would freeze the room on a minute the feed had already taken back.
        state.minute = Math.ceil(seconds / 60);
        state.clockSeconds = seconds;
    }
    if (typeof update.Seq === "number") {
        state.lastSeq = Math.max(state.lastSeq ?? 0, update.Seq);
    }
    if (action === "game_finalised") state.finished = true;

    const kind = kindOf(action, data);
    if (!kind) return [];

    const side = update.Participant ?? data.Participant;
    const player = state.squad?.get(data.PlayerId);

    // Substitutions only exist once both players are named; earlier copies are stubs.
    if (kind === "sub") {
        if (data.PlayerInId === undefined || data.PlayerOutId === undefined) return [];
        const key = `sub|${data.PlayerInId}|${data.PlayerOutId}`;
        if (state.seen.has(key)) return [];

        const playerIn = state.squad?.get(data.PlayerInId);
        const playerOut = state.squad?.get(data.PlayerOutId);
        const event = {
            id: key,
            kind,
            minute: state.minute,
            side: side ?? playerIn?.side ?? 1,
            player: playerIn?.name,
            playerOut: playerOut?.name,
        };
        state.seen.set(key, event);
        state.byId.set(update.Id, key);
        return [event];
    }

    if (side !== 1 && side !== 2) return [];

    const key = `${kind}|${seconds}|${side}`;
    const existing = state.seen.get(key);

    if (existing) {
        // A re-emission. If it finally names the player, patch the event and tell
        // the room so it can update in place.
        if (player && !existing.player) {
            existing.player = player.name;
            existing.number = player.number;
            return [{ ...existing, amended: true }];
        }
        return [];
    }

    if (kind === "goal") {
        state.score[side - 1] += 1;
    }

    const event = {
        id: key,
        kind,
        minute: state.minute,
        side,
        player: player?.name,
        number: player?.number,
        score: [state.score[0], state.score[1]],
    };
    state.seen.set(key, event);
    state.byId.set(update.Id, key); // so a later action_discarded can find it
    return [event];
}

export const newState = () => ({
    score: [0, 0],
    minute: 0,
    /** Raw Clock.Seconds from the feed — used by prediction windows. */
    clockSeconds: 0,
    /** Highest TxLINE Seq folded so far. */
    lastSeq: 0,
    finished: false,
    squad: null,
    seen: new Map(),
    /** TxLINE event Id -> our event key. The only way to honour a retraction. */
    byId: new Map(),
    p1IsHome: true,
});
