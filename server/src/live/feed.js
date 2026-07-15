import { txlineHeaders, hasApiToken } from "../config/txline.js";
import { applyUpdate, newState } from "./parse.js";

const txline = process.env.TXLINE_ORIGIN;
const RETRY_MS = 5_000;

/**
 * The live match feed.
 *
 * One SSE connection per fixture, owned by the server and shared by everyone in
 * the room — not one per browser tab. It opens when the first person joins a live
 * room and closes when the last one leaves, so we never hold a stream nobody is
 * watching.
 *
 * Late joiners get the current state (score, minute, events so far) immediately,
 * rather than an empty room until the next goal.
 */
const feeds = new Map(); // fixtureId -> { state, controller, watchers, retry }

let emit = () => {};
/** Raw TxLINE updates → prediction windows (Seq / Clock). */
let onRawUpdates = async () => {};

/** Wire the feed to the socket layer (kept out of here so this file has no io dep). */
export function setEmitter(fn) {
    emit = fn;
}

export function setRawUpdateHandler(fn) {
    onRawUpdates = fn ?? (async () => {});
}

export const stateOf = (fixtureId) => feeds.get(Number(fixtureId))?.state ?? null;

export async function watch(fixtureId) {
    fixtureId = Number(fixtureId);
    const existing = feeds.get(fixtureId);

    if (existing) {
        existing.watchers += 1;
        return existing.state;
    }
    if (!hasApiToken()) return null; // nothing we can do until the server has creds

    const feed = { state: newState(), controller: null, watchers: 1, closed: false };
    feeds.set(fixtureId, feed);

    // Catch up on what already happened BEFORE streaming. The SSE feed only sends
    // events from the moment you connect, so without this a room joined at the 70th
    // minute shows an empty timeline — and a server restart mid-match wipes the lot.
    await backfill(fixtureId, feed);

    connect(fixtureId, feed);
    return feed.state;
}

async function backfill(fixtureId, feed) {
    try {
        const res = await fetch(`${txline}/api/scores/updates/${fixtureId}`, {
            headers: await txlineHeaders(),
        });
        if (!res.ok) throw new Error(`TxLINE ${res.status}`);

        // Despite being a plain GET, this returns SSE-framed lines (`data: {...}`),
        // not a JSON array — the same quirk as /scores/historical.
        const updates = (await res.text())
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => {
                try { return JSON.parse(l.slice(l.indexOf(":") + 1).trim()); } catch { return null; }
            })
            .filter(Boolean);

        for (const update of updates) {
            if (typeof update.Participant1IsHome === "boolean") {
                feed.state.p1IsHome = update.Participant1IsHome;
            }
            // Fold silently — advances lastSeq / clockSeconds on state; no emit,
            // and prediction windows are not started yet so no resolve.
            applyUpdate(feed.state, update);
        }

        console.log(
            `[live] ${fixtureId} backfilled ${updates.length} updates → ${feed.state.seen.size} events, ${feed.state.score.join("-")} at ${feed.state.minute}' (seq ${feed.state.lastSeq})`
        );
    } catch (e) {
        // Not fatal: we just start from now instead of from kickoff.
        console.log(`[live] ${fixtureId} backfill failed (${e.message}) — starting from now`);
    }
}

export function unwatch(fixtureId) {
    fixtureId = Number(fixtureId);
    const feed = feeds.get(fixtureId);
    if (!feed) return;

    feed.watchers -= 1;
    if (feed.watchers > 0) return;

    feed.closed = true;
    feed.controller?.abort();
    feeds.delete(fixtureId);
    console.log(`[live] ${fixtureId} closed (no watchers)`);
}

async function connect(fixtureId, feed) {
    try {
        const controller = new AbortController();
        feed.controller = controller;

        const res = await fetch(`${txline}/api/scores/stream?fixtureId=${fixtureId}`, {
            headers: { ...(await txlineHeaders()), Accept: "text/event-stream" },
            signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`TxLINE stream ${res.status}`);

        console.log(`[live] ${fixtureId} streaming`);

        // SSE frames are newline-delimited and can be split across chunks, so we
        // buffer and only consume whole lines.
        let buffer = "";
        const decoder = new TextDecoder();

        for await (const chunk of res.body) {
            if (feed.closed) return;
            buffer += decoder.decode(chunk, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() ?? ""; // keep the partial line for the next chunk

            // Batch every update in this chunk so processNewEvents can walk Seq order.
            const batch = [];

            for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                let update;
                try {
                    update = JSON.parse(line.slice(line.indexOf(":") + 1).trim());
                } catch {
                    continue;
                }

                if (typeof update.Participant1IsHome === "boolean") {
                    feed.state.p1IsHome = update.Participant1IsHome;
                }

                const beforeMinute = feed.state.minute;
                const beforeClock = feed.state.clockSeconds;
                const events = applyUpdate(feed.state, update);
                for (const event of events) emit(fixtureId, event, feed.state);

                // Most updates are possession noise and produce no event — but they
                // carry the clock. Without this the room's minute only moved when
                // something happened, so it sat frozen between goals.
                // Prediction windows need Seconds ticks, not just minute changes.
                if (!events.length && (feed.state.minute !== beforeMinute || feed.state.clockSeconds !== beforeClock)) {
                    emit(fixtureId, null, feed.state);
                }

                batch.push(update);
            }

            if (batch.length) {
                try {
                    await onRawUpdates(fixtureId, batch);
                } catch (e) {
                    console.log(`[live] ${fixtureId} window handler: ${e.message}`);
                }
            }
        }

        if (!feed.closed) throw new Error("stream ended");
    } catch (e) {
        if (feed.closed || e.name === "AbortError") return;

        // The stream drops for all sorts of reasons (network, upstream restart).
        // Reconnect rather than leaving the room silently dead.
        console.log(`[live] ${fixtureId} dropped (${e.message}) — retrying in ${RETRY_MS / 1000}s`);
        setTimeout(() => {
            if (!feed.closed) connect(fixtureId, feed);
        }, RETRY_MS);
    }
}
