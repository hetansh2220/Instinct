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

let emit = () => { };

/** Wire the feed to the socket layer (kept out of here so this file has no io dep). */
export function setEmitter(fn) {
    emit = fn;
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
    connect(fixtureId, feed);
    return feed.state;
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

                const events = applyUpdate(feed.state, update);
                for (const event of events) emit(fixtureId, event, feed.state);
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
