import { txlineHeaders } from "../config/txline.js";

const txline = process.env.TXLINE_ORIGIN;

// The server holds the TxLINE credentials now — it has to, because the live SSE
// feed is a long-lived connection it owns on the room's behalf. Passing `req` also
// lets it capture the token from an activated user until TXLINE_API_TOKEN is set.
const upstream = (req) => txlineHeaders(req);


export async function fixtures(req, res) {
  try {
    // forward optional startEpochDay (past day → completed fixtures) + competitionId
    const params = new URLSearchParams();
    if (req.query.startEpochDay) params.set("startEpochDay", req.query.startEpochDay);
    if (req.query.competitionId) params.set("competitionId", req.query.competitionId);
    const qs = params.toString() ? `?${params}` : "";
    const r = await fetch(`${txline}/api/fixtures/snapshot${qs}`, { headers: await upstream(req) });
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}


export async function odds(req, res) {
  try {
    const r = await fetch(`${txline}/api/odds/snapshot/${req.params.fixtureId}`, { headers: await upstream(req) });
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}


export async function scores(req, res) {
  try {
    const r = await fetch(`${txline}/api/scores/snapshot/${req.params.fixtureId}`, { headers: await upstream(req) });
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}


function parseEvents(text) {
  return text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => {
      try { return JSON.parse(line.slice(line.indexOf(":") + 1).trim()); } catch { return null; }
    })
    .filter(Boolean);
}

const isGoal = (ev) =>
  ev.Action === "goal" ||
  (ev.Action === "penalty_outcome" && (ev.Data?.Outcome ?? ev.data?.Outcome) === "Scored");

/**
 * Goals from the event stream — NOT Stats counters.
 *
 * Stats can keep a VAR-disallowed goal (France–Spain showed 0-3 from Stats while
 * the feed had a 61' goal discarded → real score 0-2). Match Ids + action_discarded
 * are the only reliable way to count.
 */
function scoreFromEvents(events) {
  const goals = new Map(); // Id -> side
  for (const ev of events) {
    if (ev.Action === "action_discarded") {
      goals.delete(ev.Id);
      continue;
    }
    if (!isGoal(ev)) continue;
    const side = ev.Participant ?? ev.Data?.Participant;
    if (side !== 1 && side !== 2) continue;
    goals.set(ev.Id, side);
  }

  let p1 = 0, p2 = 0;
  for (const side of goals.values()) {
    if (side === 1) p1++;
    else p2++;
  }
  return { p1, p2 };
}

// POST /api/scores/final  body: { fixtureIds: number[] }
// Returns { [fixtureId]: { p1, p2 } | null } — score computed server-side so the
// browser gets tiny numbers instead of full match histories.
export async function finalScores(req, res) {
  const ids = Array.isArray(req.body?.fixtureIds) ? req.body.fixtureIds : [];
  try {
    const headers = await upstream(req);
    const entries = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await fetch(`${txline}/api/scores/historical/${id}`, { headers });
          const events = parseEvents(await r.text());
          if (!events.length) return [id, null];
          return [id, scoreFromEvents(events)];
        } catch {
          return [id, null];
        }
      })
    );
    res.json(Object.fromEntries(entries));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}


export async function scoresHistorical(req, res) {
  try {
    const r = await fetch(`${txline}/api/scores/historical/${req.params.fixtureId}`, {
      headers: await upstream(req),
    });
    const text = await r.text();


    const events = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(line.indexOf(":") + 1).trim())
      .map((json) => {
        try { return JSON.parse(json); } catch { return null; }
      })
      .filter(Boolean);

    res.status(r.status).json(events);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}

/**
 * GET /api/scores/updates/:fixtureId
 *
 * Every update so far in a LIVE match. /scores/historical only covers finished
 * fixtures, so this is what a recap page needs while the game is still on.
 *
 * Returns SSE-framed lines despite being a plain GET, same as /historical — so it
 * gets parsed into a JSON array here and comes out in the identical shape, which
 * means the client can run the very same timeline parser over it.
 */
export async function scoresUpdates(req, res) {
  try {
    const r = await fetch(`${txline}/api/scores/updates/${req.params.fixtureId}`, {
      headers: await upstream(req),
    });
    res.status(r.status).json(parseEvents(await r.text()));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
