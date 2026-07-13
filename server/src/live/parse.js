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
    substitution: "sub",
};

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

    // Lineups can arrive at any point; keep the latest.
    const squad = squadFrom(update);
    if (squad) state.squad = squad;

    if (typeof seconds === "number") {
        state.minute = Math.ceil(seconds / 60);
    }
    if (action === "game_finalised") state.finished = true;

    const kind = ACTION_KIND[action];
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
    return [event];
}

export const newState = () => ({
    score: [0, 0],
    minute: 0,
    finished: false,
    squad: null,
    seen: new Map(),
    p1IsHome: true,
});
