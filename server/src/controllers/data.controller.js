const txline = process.env.TXLINE_ORIGIN;


function upstream(req) {
  return {
    Authorization: `Bearer ${req.headers["x-jwt"]}`,
    "X-Api-Token": req.headers["x-api-token"],
  };
}


export async function fixtures(req, res) {
  try {
    // forward optional startEpochDay (past day → completed fixtures) + competitionId
    const params = new URLSearchParams();
    if (req.query.startEpochDay) params.set("startEpochDay", req.query.startEpochDay);
    if (req.query.competitionId) params.set("competitionId", req.query.competitionId);
    const qs = params.toString() ? `?${params}` : "";
    const r = await fetch(`${txline}/api/fixtures/snapshot${qs}`, { headers: upstream(req) });
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}


export async function odds(req, res) {
  try {
    const r = await fetch(`${txline}/api/odds/snapshot/${req.params.fixtureId}`, { headers: upstream(req) });
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}


export async function scores(req, res) {
  try {
    const r = await fetch(`${txline}/api/scores/snapshot/${req.params.fixtureId}`, { headers: upstream(req) });
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}


// sum a base stat across full-game + periods ((period*1000)+base legend)
function statTotal(stats, base) {
  if (!stats) return 0;
  if (typeof stats[base] === "number") return stats[base];
  let sum = 0;
  for (const p of [1, 2, 3, 4, 5]) {
    const v = stats[p * 1000 + base];
    if (typeof v === "number") sum += v;
  }
  return sum;
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

// POST /api/scores/final  body: { fixtureIds: number[] }
// Returns { [fixtureId]: { p1, p2 } | null } — score computed server-side so the
// browser gets tiny numbers instead of full match histories.
export async function finalScores(req, res) {
  const ids = Array.isArray(req.body?.fixtureIds) ? req.body.fixtureIds : [];
  try {
    const headers = upstream(req);
    const entries = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await fetch(`${txline}/api/scores/historical/${id}`, { headers });
          const events = parseEvents(await r.text());
          if (!events.length) return [id, null];
          let p1 = 0, p2 = 0;
          for (const ev of events) {
            p1 = Math.max(p1, statTotal(ev.Stats, 1));
            p2 = Math.max(p2, statTotal(ev.Stats, 2));
          }
          return [id, { p1, p2 }];
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
      headers: upstream(req),
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