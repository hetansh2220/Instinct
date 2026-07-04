import type { Market } from "./types";

// Shape of a fixture from TxLINE /api/fixtures/snapshot.
export interface TxlineFixture {
    Ts: number;
    StartTime: number;
    Competition: string;
    CompetitionId: number;
    Participant1: string;
    Participant2: string;
    Participant1IsHome: boolean;
    FixtureId: number;
}

// Deterministic pseudo-pool from the fixture id, so a match always shows the
// same (simulated) pools. These are NOT real bets — real pools arrive with the
// on-chain market program. The teams/competition/kickoff ARE real TxLINE data.
function seededPools(id: number): [number, number, number] {
    const home = 600 + ((id * 3) % 1800);
    const draw = 300 + ((id * 7) % 900);
    const away = 400 + ((id * 11) % 1500);
    return [home, draw, away];
}

export function fixtureToMarket(f: TxlineFixture, now: number): Market {
    const home = f.Participant1IsHome ? f.Participant1 : f.Participant2;
    const away = f.Participant1IsHome ? f.Participant2 : f.Participant1;
    const [homePool, drawPool, awayPool] = seededPools(f.FixtureId);

    // Time-derived status (we don't get real match state from the fixtures
    // snapshot): before kickoff = open, once kickoff passes = live.
    const status: Market["status"] = now >= f.StartTime ? "live" : "open";

    return {
        id: `fx-${f.FixtureId}`,
        fixtureId: f.FixtureId,
        competition: f.Competition,
        home,
        away,
        kickoff: f.StartTime,
        status,
        bettors: 8 + (f.FixtureId % 55),
        outcomes: [
            { key: "HOME", label: home, pool: homePool },
            { key: "DRAW", label: "Draw", pool: drawPool },
            { key: "AWAY", label: away, pool: awayPool },
        ],
    };
}
