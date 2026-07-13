import { Server } from "socket.io";
import { eq } from "drizzle-orm";
import { db } from "./config/db.js";
import { users, messages, entries } from "./db/schema.js";
import { watch, unwatch, stateOf, setEmitter } from "./live/feed.js";

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
 * The room's people: everyone who entered the contest (from the DB) plus anyone
 * currently connected who hasn't entered — each flagged online/offline and
 * carrying their pick.
 */
export async function buildMembers(fixtureId) {
    const roomId = roomIdFor(fixtureId);
    const connected = online.get(roomId) ?? new Set();

    // Points from THIS contest (entries.points), not the user's lifetime total —
    // a room's leaderboard is about this match. Lifetime points live on the
    // global leaderboard and the profile.
    const entrants = await db
        .select({
            id: users.id,
            wallet: users.wallet,
            username: users.username,
            points: entries.points,
            pick: entries.pick,
        })
        .from(entries)
        .innerJoin(users, eq(entries.userId, users.id))
        .where(eq(entries.fixtureId, Number(fixtureId)));

    const members = entrants.map((e) => ({
        wallet: e.wallet,
        username: e.username,
        points: e.points ?? 0,
        pick: e.pick,
        online: connected.has(e.id),
    }));

    // Lurkers: connected, chatting, but no entry yet.
    const entered = new Set(entrants.map((e) => e.id));
    const lurkers = [...connected].filter((id) => !entered.has(id));

    if (lurkers.length) {
        const rows = await db.select().from(users);
        for (const u of rows.filter((u) => lurkers.includes(u.id))) {
            members.push({
                wallet: u.wallet,
                username: u.username,
                points: 0, // no entry in this contest, so no points from it
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
        io.to(roomIdFor(fixtureId)).emit("match:event", {
            event,
            state: { score: state.score, minute: state.minute, finished: state.finished, p1IsHome: state.p1IsHome },
        });
    });

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

                // A late joiner shouldn't stare at 0-0 until the next goal.
                if (state) {
                    socket.emit("match:sync", {
                        state: { score: state.score, minute: state.minute, finished: state.finished, p1IsHome: state.p1IsHome },
                        events: [...state.seen.values()],
                    });
                }
            }

            await emitMembers(fixtureId);
        });

        socket.on("room:leave", async () => {
            const roomId = socket.data.roomId;
            if (!roomId) return;

            socket.leave(roomId);
            disconnect(roomId, user.id);
            if (socket.data.live) unwatch(socket.data.fixtureId);
            socket.data.roomId = undefined;
            socket.data.live = false;

            await emitMembers(fixtureOf(roomId));
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
            if (socket.data.live) unwatch(socket.data.fixtureId);
            await emitMembers(fixtureOf(roomId));
        });
    });

    return io;
}
