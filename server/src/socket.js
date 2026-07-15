import { Server } from "socket.io";
import { eq } from "drizzle-orm";
import { db } from "./config/db.js";
import { users, messages, entries } from "./db/schema.js";
import { watch, unwatch, stateOf, setEmitter, setRawUpdateHandler } from "./live/feed.js";
import {
    startWindows,
    stopWindows,
    activeWindow,
    guessOf,
    submitPrediction,
    processNewEvents,
    matchLeaderboard,
    setWindowEmitter,
} from "./live/windows.js";

const MAX_BODY = 500;
const RATE_LIMIT = 5; // messages...
const RATE_WINDOW = 5000; // ...per 5s, per socket

export const roomIdFor = (fixtureId) => `match:${fixtureId}`;
const fixtureOf = (roomId) => Number(roomId.split(":")[1]);

const online = new Map();

function connect(roomId, userId) {
    if (!online.has(roomId)) online.set(roomId, new Set());
    online.get(roomId).add(userId);
}

function disconnect(roomId, userId) {
    const room = online.get(roomId);
    if (!room) return;
    room.delete(userId);
    if (room.size === 0) online.delete(roomId);
}

/**
 * Room people with computed total points (match pick FT + window predictions).
 */
export async function buildMembers(fixtureId) {
    const roomId = roomIdFor(fixtureId);
    const connected = online.get(roomId) ?? new Set();

    const board = await matchLeaderboard(fixtureId);
    const byWallet = new Map(board.map((m) => [m.wallet, m]));

    // Entrants already cover contest members; overlay online flags.
    const members = board.map((e) => {
        // Look up user id for online check via a second path — entrants query had id.
        return {
            wallet: e.wallet,
            username: e.username,
            points: e.totalPoints ?? e.points ?? 0,
            pick: e.pick,
            online: false, // filled below
        };
    });

    // Resolve online by joining user ids.
    const entrants = await db
        .select({
            id: users.id,
            wallet: users.wallet,
        })
        .from(entries)
        .innerJoin(users, eq(entries.userId, users.id))
        .where(eq(entries.fixtureId, Number(fixtureId)));

    const idByWallet = new Map(entrants.map((e) => [e.wallet, e.id]));
    for (const m of members) {
        const id = idByWallet.get(m.wallet);
        m.online = id ? connected.has(id) : false;
    }

    // Lurkers: connected, chatting, but no entry yet.
    const entered = new Set(entrants.map((e) => e.id));
    const lurkers = [...connected].filter((id) => !entered.has(id));

    if (lurkers.length) {
        const rows = await db.select().from(users);
        for (const u of rows.filter((u) => lurkers.includes(u.id))) {
            if (byWallet.has(u.wallet)) continue;
            members.push({
                wallet: u.wallet,
                username: u.username,
                points: 0,
                pick: undefined,
                online: true,
            });
        }
    }

    return members;
}

let ioRef = null;

/** Push a fresh member list to a room — used by the socket AND by the entries API. */
export async function emitMembers(fixtureId) {
    if (!ioRef) return;
    const members = await buildMembers(fixtureId);
    ioRef.to(roomIdFor(fixtureId)).emit("room:members", { members });
    ioRef.to(roomIdFor(fixtureId)).emit("leaderboard_updated", { members });
}

export function attachSocket(server) {
    const io = new Server(server, {
        cors: { origin: process.env.FRONTEND_ORIGIN ?? true },
    });
    ioRef = io;

    // The live feed pushes match events straight into the room. `match:state` rides
    // along with every event so a client that missed one still lands on the right
    // score.
    setEmitter((fixtureId, event, state) => {
        const wire = {
            score: state.score,
            minute: state.minute,
            finished: state.finished,
            p1IsHome: state.p1IsHome,
            clockSeconds: state.clockSeconds ?? 0,
        };

        // No event, just a clock tick: the match hasn't said anything, it's simply
        // later than it was.
        if (!event) {
            io.to(roomIdFor(fixtureId)).emit("match:state", { state: wire });
            return;
        }

        io.to(roomIdFor(fixtureId)).emit("match:event", { event, state: wire });
    });

    // Raw TxLINE batch → Seq/clock-based window resolution.
    setRawUpdateHandler((fixtureId, batch) => processNewEvents(fixtureId, batch));

    setWindowEmitter(
        (fixtureId, name, payload) => io.to(roomIdFor(fixtureId)).emit(name, payload),
        (fixtureId) => emitMembers(fixtureId)
    );

    /**
     * Handshake auth. The client sends its wallet; we resolve it to a real user
     * row and pin that on the socket. Every message is then attributed from
     * socket.data — NEVER from anything the client sends later, or one user could
     * post as another.
     *
     * NOTE: this trusts the claimed wallet. Production should have the client
     * sign a nonce (wallet-adapter signMessage) and verify it here with
     * tweetnacl before looking the user up.
     */
    io.use(async (socket, next) => {
        const wallet = socket.handshake.auth?.wallet;
        if (!wallet) return next(new Error("wallet required"));

        try {
            const [user] = await db.select().from(users).where(eq(users.wallet, wallet));
            if (!user) return next(new Error("no profile for wallet"));

            socket.data.user = {
                id: user.id,
                wallet: user.wallet,
                username: user.username,
                points: user.points ?? 0,
            };
            next();
        } catch (e) {
            next(new Error(e.message));
        }
    });

    io.on("connection", (socket) => {
        const user = socket.data.user;
        socket.data.sent = [];

        socket.on("room:join", async ({ fixtureId, live } = {}) => {
            if (!fixtureId) return;
            const roomId = roomIdFor(fixtureId);

            socket.join(roomId);
            socket.data.roomId = roomId;
            socket.data.fixtureId = Number(fixtureId);
            connect(roomId, user.id);

            // Only live matches get a stream. A finished match is served by the
            // historical endpoint, and an upcoming one has nothing to say yet.
            if (live) {
                socket.data.live = true;
                const state = await watch(fixtureId);
                startWindows(fixtureId, {
                    lastSeq: state?.lastSeq ?? 0,
                    clockSeconds: state?.clockSeconds ?? 0,
                    finished: state?.finished ?? false,
                });

                // ALWAYS sync — `window: null` clears orphans after a restart.
                socket.emit("window_sync", {
                    window: activeWindow(fixtureId),
                    mine: guessOf(fixtureId, user.id),
                });

                // A late joiner shouldn't stare at 0-0 until the next goal.
                if (state) {
                    socket.emit("match:sync", {
                        state: {
                            score: state.score,
                            minute: state.minute,
                            finished: state.finished,
                            p1IsHome: state.p1IsHome,
                            clockSeconds: state.clockSeconds ?? 0,
                        },
                        events: [...state.seen.values()],
                    });
                }
            }

            await emitMembers(fixtureId);
        });

        /**
         * Is anyone still watching? Counted in SOCKETS, not users — `online` keys on
         * user id, so a second tab (or a reconnect) closing would otherwise report
         * the room empty while the first tab is still sitting in it, killing the feed
         * and the rounds under a live viewer.
         */
        const roomIsEmpty = (roomId) => (io.sockets.adapter.rooms.get(roomId)?.size ?? 0) === 0;

        socket.on("room:leave", async () => {
            const roomId = socket.data.roomId;
            if (!roomId) return;

            socket.leave(roomId);
            disconnect(roomId, user.id);
            if (socket.data.live) {
                unwatch(socket.data.fixtureId);
                if (roomIsEmpty(roomId)) stopWindows(socket.data.fixtureId);
            }
            socket.data.roomId = undefined;
            socket.data.live = false;

            await emitMembers(fixtureOf(roomId));
        });

        socket.on("predict:answer", async ({ id, answer } = {}) => {
            const fixtureId = socket.data.fixtureId;
            if (!fixtureId || !id) return;

            const result = await submitPrediction(user, fixtureId, id, answer);
            socket.emit("predict:answered", {
                id,
                answer: answer === true || answer === "yes",
                guess: result.guess ?? null,
                ok: result.ok,
                reason: result.reason ?? null,
            });
            if (result.ok) {
                socket.emit("window_answered", {
                    id,
                    guess: result.guess,
                    ok: true,
                });
            }
        });

        socket.on("message:send", async ({ body, clientId, replyTo } = {}) => {
            const roomId = socket.data.roomId;
            if (!roomId) return;

            const text = String(body ?? "").trim().slice(0, MAX_BODY);
            if (!text) return;

            // Rate limit: drop the flood rather than letting one socket own the room.
            const now = Date.now();
            socket.data.sent = socket.data.sent.filter((t) => now - t < RATE_WINDOW);
            if (socket.data.sent.length >= RATE_LIMIT) {
                socket.emit("message:rejected", { clientId, reason: "Slow down." });
                return;
            }
            socket.data.sent.push(now);

            try {
                const [saved] = await db
                    .insert(messages)
                    .values({ roomId, userId: user.id, body: text, replyToId: replyTo ?? null })
                    .returning();

                // Ship the quoted message inline so clients can render it without a
                // second round-trip or a lookup against messages they may not hold.
                let quoted = null;
                if (saved.replyToId) {
                    const [parent] = await db
                        .select({
                            id: messages.id,
                            body: messages.body,
                            username: users.username,
                        })
                        .from(messages)
                        .innerJoin(users, eq(messages.userId, users.id))
                        .where(eq(messages.id, saved.replyToId));
                    quoted = parent ?? null;
                }

                io.to(roomId).emit("message:new", {
                    id: saved.id,
                    // Echo the sender's temp id so they can reconcile their optimistic copy.
                    clientId,
                    body: saved.body,
                    ts: new Date(saved.createdAt).getTime(),
                    user: { wallet: user.wallet, username: user.username },
                    replyTo: quoted,
                });
            } catch (e) {
                socket.emit("message:rejected", { clientId, reason: e.message });
            }
        });

        socket.on("disconnect", async () => {
            const roomId = socket.data.roomId;
            if (!roomId) return;
            disconnect(roomId, user.id);
            if (socket.data.live) {
                unwatch(socket.data.fixtureId);
                // The socket is already out of the room by the time this fires.
                if (roomIsEmpty(roomId)) stopWindows(socket.data.fixtureId);
            }
            await emitMembers(fixtureOf(roomId));
        });
    });

    return io;
}
