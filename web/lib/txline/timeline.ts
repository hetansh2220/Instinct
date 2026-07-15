// Turns the TxLINE historical feed into a match timeline, lineups and stats.
//
// Two things about the feed drive the whole design:
//
//   1. `Action` names the event ("goal", "yellow_card", "substitution"), and the
//      player is referenced by Data.PlayerId — which is the player's
//      *normativeId* in the Lineups, not their fixturePlayerId.
//
//   2. The feed RE-EMITS an event as it learns more about it. A goal first
//      arrives with Data:{}, and the PlayerId only turns up in a later copy at
//      the same clock. So events must be collected and enriched across
//      re-emissions, never taken at first sight — reading the first copy is why
//      an earlier version of this file showed every event as team-only.
//
// The Stats counters are absolute totals, used only for the stats panel.

export type EventKind = "goal" | "yellow" | "red" | "corner" | "sub" | "period";
export type Side = 1 | 2;

export interface Player {
    /**
     * Every id this player answers to. SoccerData references players by PlayerId /
     * PlayerInId / PlayerOutId, and the docs don't say whether that's the
     * fixture-scoped id or the player's normative id — so we keep both and match
     * against either.
     */
    ids: number[];
    name: string;
    number?: number;
    side: Side;
    starter: boolean;
}

export const EVENT_LABEL: Record<EventKind, string> = {
    goal: "Goal",
    yellow: "Yellow card",
    red: "Red card",
    corner: "Corner",
    sub: "Substitution",
    period: "Period",
};

export interface TimelineEvent {
    id: string;
    kind: EventKind;
    minute: number;
    side: Side | null;
    /** Running score [p1, p2] at this point in the match. */
    score: [number, number];
    player?: Player;
    /** Only for substitutions: the player coming off. */
    playerOut?: Player;
    /** Period dividers ("HALF TIME", "END OF MATCH"). */
    label?: string;
}

export interface Lineups {
    p1: Player[];
    p2: Player[];
}

export interface Parsed {
    p1IsHome: boolean;
    lineups: Lineups;
    timeline: TimelineEvent[];
    finalScore: [number, number];
    stats: { label: string; p1: number; p2: number }[];
    /** Latest clock seen in the feed — the live minute while a match is on. */
    minute: number;
}

/** Per the OpenAPI spec (SoccerData): the per-update event detail. */
export interface SoccerData {
    Action?: string;
    Goal?: boolean;
    YellowCard?: boolean;
    RedCard?: boolean;
    Corner?: boolean;
    Penalty?: boolean;
    VAR?: boolean;
    /** Which participant (1 or 2) the event belongs to. */
    Participant?: number;
    Minutes?: number;
    PlayerId?: number;
    /** On `penalty_outcome`: "Scored" | "Missed" | "Saved" — a scored one IS the goal. */
    Outcome?: string;
    PlayerInId?: number;
    PlayerOutId?: number;
    Type?: string;
}

/** Per the spec (PlayerData / PlayerLineupData / LineupData). */
export interface PlayerLineupData {
    fixturePlayerId?: number;
    rosterNumber?: string;
    starter?: boolean;
    player?: { normativeId?: number; preferredName?: string };
}
export interface LineupData {
    normativeId?: number;
    preferredName?: string;
    lineups?: PlayerLineupData[];
}

export interface Snapshot {
    Action?: string;
    /** The event's identity. A retraction (`action_discarded`) reuses it. */
    Id?: number;
    Clock?: { Seconds?: number; Period?: number };
    Ts?: number;
    Stats?: Record<string, number>;
    Participant1Id?: number;
    Participant2Id?: number;
    Participant1IsHome?: boolean;
    /** Which side (1|2) the event belongs to. Top-level for most actions; substitutions put it in Data. */
    Participant?: number;
    Data?: SoccerData;
    Lineups?: LineupData[];
    // The spec documents these lowercase; the live feed sends PascalCase. Accept both.
    stats?: Record<string, number>;
    lineups?: LineupData[];
    dataSoccer?: SoccerData;
}

/** The feed is PascalCase in practice but lowercase in the spec — read either. */
const statsOf = (s: Snapshot) => s.Stats ?? s.stats;
const dataOf = (s: Snapshot): SoccerData => s.Data ?? s.dataSoccer ?? {};
const lineupsOf = (s: Snapshot) => s.Lineups ?? s.lineups;

/* ------------------------------------------------------------------ stats */

/**
 * Snapshots are partial: a missing key means "unchanged since the last one", NOT
 * zero. So this returns undefined when the stat is absent — collapsing that to 0
 * would reset the running counter and re-fire the event when the key reappears.
 */
function statTotal(stats: Record<string, number> | undefined, base: number): number | undefined {
    if (!stats) return undefined;
    const direct = stats[String(base)];
    if (typeof direct === "number") return direct;

    let sum = 0;
    let seen = false;
    for (const period of [1, 2, 3, 4, 5]) {
        const v = stats[String(period * 1000 + base)];
        if (typeof v === "number") {
            sum += v;
            seen = true;
        }
    }
    return seen ? sum : undefined;
}

/* ---------------------------------------------------------------- lineups */

/**
 * Lineups arrive as Lineups[] — one entry per team, each with a normativeId (the
 * team) and a `lineups` array of PlayerLineupData. The player's name lives at
 * player.preferredName and the shirt number at `rosterNumber`, a STRING.
 *
 * Events reference players by their player.normativeId (NOT fixturePlayerId), but
 * we index both so a feed change can't silently break attribution again.
 */
function extractLineups(events: Snapshot[]): Lineups {
    const source = events.find((e) => (lineupsOf(e)?.length ?? 0) > 0);
    if (!source) return { p1: [], p2: [] };

    const squads: Record<Side, Player[]> = { 1: [], 2: [] };

    (lineupsOf(source) ?? []).forEach((team, index) => {
        const side: Side =
            team.normativeId !== undefined && team.normativeId === source.Participant1Id ? 1
                : team.normativeId !== undefined && team.normativeId === source.Participant2Id ? 2
                    : index === 0 ? 1 : 2;

        for (const entry of team.lineups ?? []) {
            const raw = entry.player?.preferredName;
            if (!raw) continue;

            const ids = [entry.player?.normativeId, entry.fixturePlayerId].filter(
                (id): id is number => typeof id === "number"
            );
            const number = Number(entry.rosterNumber);

            squads[side].push({
                ids,
                name: displayName(raw),
                number: Number.isFinite(number) ? number : undefined,
                side,
                starter: entry.starter ?? true,
            });
        }
    });

    return { p1: squads[1], p2: squads[2] };
}

/** The feed writes names "Last, First" ("Merino Zazon, Mikel") — flip them. */
function displayName(raw: string): string {
    const [last, first] = raw.split(",").map((s) => s.trim());
    return first ? `${first} ${last}` : raw;
}

/* --------------------------------------------------------------- timeline */

/** Action -> the kind of event we render. Everything else is ignored. */
const ACTION_KIND: Record<string, EventKind> = {
    goal: "goal",
    yellow_card: "yellow",
    red_card: "red",
    corner: "corner",
    substitution: "sub",
};

/**
 * A converted penalty is NEVER reported as a "goal" — it comes through as
 * `penalty_outcome` with `Data.Outcome: "Scored"`, and that update is the only
 * record of it. Missed and saved penalties share the action, so the Outcome
 * decides whether it counts.
 */
function kindOf(action: string | undefined, data: SoccerData): EventKind | undefined {
    if (action === "penalty_outcome") {
        return data.Outcome === "Scored" ? "goal" : undefined;
    }
    return ACTION_KIND[action ?? ""];
}

/**
 * Folds a fixture's update stream into a timeline, score and stats.
 *
 * The LIVE feed (/scores/updates) has the identical shape as the finished one
 * (/scores/historical), so the same fold reads both — `live` only changes whether
 * the closing divider claims the match is over.
 */
export function parseHistorical(events: Snapshot[], live = false): Parsed {
    const first = events[0] ?? {};
    const p1IsHome = first.Participant1IsHome ?? true;
    const lineups = extractLineups(events);
    const squad = [...lineups.p1, ...lineups.p2];
    const playerById = (id?: number) =>
        typeof id === "number" ? squad.find((p) => p.ids.includes(id)) : undefined;

    // Ts is wall-clock and monotonic, so it is the only ordering we need.
    const ordered = [...events].sort((a, b) => (a.Ts ?? 0) - (b.Ts ?? 0));

    /**
     * The feed emits an event, then RE-emits it with more detail — a goal first
     * arrives with Data:{}, and its PlayerId only shows up in a later copy at the
     * same clock. So events are collected into a map keyed by identity and
     * enriched as the amendments arrive, rather than taken at first sight.
     */
    const collected = new Map<string, TimelineEvent>();
    /** TxLINE event Id -> our key, so a retraction can find what it cancels. */
    const byId = new Map<number, string>();
    let lastMinute = 0;

    for (const snapshot of ordered) {
        const data = dataOf(snapshot);
        const kind = kindOf(snapshot.Action, data);
        const seconds = snapshot.Clock?.Seconds;

        /**
         * VAR: the feed cancels an event by re-sending it as `action_discarded` with
         * the same Id. France v Spain's 61st-minute goal was chalked off this way —
         * ignore it and the timeline shows a goal that never counted.
         */
        if (snapshot.Action === "action_discarded") {
            const key = typeof snapshot.Id === "number" ? byId.get(snapshot.Id) : undefined;
            if (key) {
                collected.delete(key);
                byId.delete(snapshot.Id!);
            }
            continue;
        }

        // Football minutes round UP: 1761s is the 30th minute, not the 29th.
        const minute = seconds !== undefined ? Math.ceil(seconds / 60) : data.Minutes ?? 0;
        if (minute > lastMinute) lastMinute = minute;
        if (!kind) continue;

        const side = (snapshot.Participant ?? data.Participant) as Side | undefined;

        if (kind === "sub") {
            // Subs are only real once both players are named; earlier copies are stubs.
            if (data.PlayerInId === undefined || data.PlayerOutId === undefined) continue;
            const key = `sub|${data.PlayerInId}|${data.PlayerOutId}`;
            if (typeof snapshot.Id === "number") byId.set(snapshot.Id, key);
            if (collected.has(key)) continue;
            collected.set(key, {
                id: key,
                kind,
                minute,
                side: side ?? playerById(data.PlayerInId)?.side ?? 1,
                score: [0, 0],
                player: playerById(data.PlayerInId),
                playerOut: playerById(data.PlayerOutId),
            });
            continue;
        }

        // One goal/card/corner == one (action, clock, team). Re-emissions share it.
        const key = `${kind}|${seconds}|${side ?? "?"}`;
        const existing = collected.get(key);
        const player = playerById(data.PlayerId);

        if (existing) {
            if (player && !existing.player) existing.player = player; // the amendment named them
        } else {
            collected.set(key, { id: key, kind, minute, side: side ?? null, score: [0, 0], player });
            if (typeof snapshot.Id === "number") byId.set(snapshot.Id, key);
        }
    }

    const timeline = [...collected.values()];

    // Running score, in chronological order, from the deduped goals.
    const score: [number, number] = [0, 0];
    for (const event of timeline) {
        if (event.kind === "goal" && event.side) score[event.side - 1] += 1;
        event.score = [score[0], score[1]];
    }

    if (timeline.length) {
        const divider = (id: string, label: string, minute: number): TimelineEvent => ({
            id, kind: "period", label, minute, side: null, score: [score[0], score[1]],
        });
        timeline.unshift(divider("start", "Kick off", 0));
        // A match still being played hasn't ended — saying so over a live feed is the
        // difference between a recap and a lie.
        timeline.push(
            live ? divider("end", "In progress", lastMinute) : divider("end", "End of match", lastMinute)
        );
    }

    timeline.reverse(); // newest first, like a live blog

    // Stats come from the counters, which are absolute (and partial: a missing key
    // means unchanged, so take each stat's last REPORTED value).
    const latest = (base: number): number => {
        for (let i = ordered.length - 1; i >= 0; i--) {
            const v = statTotal(statsOf(ordered[i]), base);
            if (v !== undefined) return v;
        }
        return 0;
    };
    const stats = [
        { label: "Goals", p1: latest(1), p2: latest(2) },
        { label: "Corners", p1: latest(7), p2: latest(8) },
        { label: "Yellow cards", p1: latest(3), p2: latest(4) },
        { label: "Red cards", p1: latest(5), p2: latest(6) },
    ];

    return { p1IsHome, lineups, timeline, finalScore: [score[0], score[1]], stats, minute: lastMinute };
}
