"use client";

// The real room: Socket.IO for live traffic, REST for history.
//
// History comes over HTTP (cached by TanStack Query, paginable) and live updates
// come over the socket — using the socket for both would mean re-downloading the
// backlog on every reconnect.

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import type {
    ChatMessage,
    LiveState,
    Member,
    Room,
    RoomMessage,
    RoomUser,
    Round,
    SystemMessage,
} from "./types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

interface Wire {
    id: string;
    clientId?: string;
    body: string;
    ts: number;
    user: { wallet: string; username: string };
    replyTo?: { id: string; username: string; body: string } | null;
}

const toMessage = (w: Wire): ChatMessage => ({
    id: w.id,
    kind: "chat",
    user: w.user,
    body: w.body,
    ts: w.ts,
    replyTo: w.replyTo ?? null,
});

async function fetchHistory(fixtureId: number): Promise<ChatMessage[]> {
    const res = await fetch(`${API}/api/rooms/${fixtureId}/messages?limit=50`);
    if (!res.ok) throw new Error(`history failed (${res.status})`);
    return ((await res.json()) as Wire[]).map(toMessage);
}

async function fetchMembers(fixtureId: number): Promise<Member[]> {
    const res = await fetch(`${API}/api/rooms/${fixtureId}/members`);
    if (!res.ok) throw new Error(`members failed (${res.status})`);
    return res.json();
}

/** A match event from the live feed, as the server sends it. */
interface WireEvent {
    id: string;
    kind: "goal" | "yellow" | "red" | "corner" | "sub";
    minute: number;
    side: 1 | 2;
    player?: string;
    playerOut?: string;
    score?: [number, number];
    /** A re-emission that finally named the player — replace, don't append. */
    amended?: boolean;
    /** VAR: this event has been chalked off — take it back off the timeline. */
    retracted?: boolean;
}

/** Match events become system messages in the stream, so a goal interrupts the chat. */
const toSystem = (e: WireEvent, p1IsHome: boolean): SystemMessage => ({
    id: `live-${e.id}`,
    kind: "system",
    event: e.kind,
    minute: e.minute,
    player: e.player,
    side: e.side,
    // Score is stored p1-first; the UI wants home-first.
    score: e.score
        ? p1IsHome
            ? e.score
            : [e.score[1], e.score[0]]
        : undefined,
    ts: Date.now(),
});

/** A prediction window as the server sends it. */
interface WireWindow {
    id: string;
    eventType?: string;
    kind?: string;
    question: string;
    points: number;
    windowStartClock: number;
    windowEndClock: number;
    currentClock?: number;
    status: "open" | "locked" | "resolved";
    locksAt?: number | null;
    tally: { yes: number; no: number };
    result?: boolean | null;
    outcome?: boolean | null;
    resolved?: boolean;
}

const toRound = (r: WireWindow, mine?: boolean): Round => ({
    id: r.id,
    event: r.eventType ?? r.kind ?? "goal",
    question: r.question,
    points: r.points,
    windowStartClock: r.windowStartClock,
    windowEndClock: r.windowEndClock,
    currentClock: r.currentClock ?? r.windowStartClock,
    status: r.status ?? (r.resolved ? "resolved" : "open"),
    locksAt: r.locksAt ?? null,
    tally: r.tally ?? { yes: 0, no: 0 },
    mine,
    outcome: r.result ?? r.outcome ?? null,
    resolved: r.status === "resolved" || !!r.resolved,
});

/** Coerce server guess ("yes"/"no" | boolean) into Round.mine boolean. */
const mineFrom = (mine: unknown): boolean | undefined => {
    if (mine === true || mine === "yes") return true;
    if (mine === false || mine === "no") return false;
    return undefined;
};

export function useRoom(matchId: number, me?: RoomUser, live = false): Room {
    const [streamed, setStreamed] = useState<RoomMessage[]>([]);
    const [pushed, setPushed] = useState<Member[] | null>(null);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [liveState, setLiveState] = useState<LiveState | null>(null);
    // The round is its own state — it is not a message, so it never touches the
    // transcript, and the chat can't scroll it away or reorder it.
    const [round, setRound] = useState<Round | null>(null);
    const socket = useRef<Socket | null>(null);

    const { data: history = [] } = useQuery({
        queryKey: ["room-history", matchId],
        queryFn: () => fetchHistory(matchId),
        staleTime: 30_000,
    });

    // Membership is durable (it comes from contest entries), so it's fetched over
    // REST and shows even without a socket — leaving the page must not remove you
    // from the room. The socket only pushes updates on top.
    const { data: seeded = [] } = useQuery({
        queryKey: ["room-members", matchId],
        queryFn: () => fetchMembers(matchId),
        staleTime: 30_000,
    });

    const members = pushed ?? seeded;

    useEffect(() => {
        // Talking needs an identity, so no wallet means no socket. History still
        // renders — reading the room is open to everyone.
        if (!me) return;

        const s = io(API, { auth: { wallet: me.wallet }, transports: ["websocket"] });
        socket.current = s;

        s.on("connect", () => {
            setConnected(true);
            setError(null);
            s.emit("room:join", { fixtureId: matchId, live });
        });
        s.on("disconnect", () => setConnected(false));

        // Without this the UI sits on "Connecting…" forever when the handshake is
        // rejected (server down, or no profile row for this wallet).
        s.on("connect_error", (e) => {
            setConnected(false);
            setError(
                e.message === "no profile for wallet"
                    ? "Finish setting up your profile to chat."
                    : "Can't reach the chat server."
            );
        });

        // The server sends the full list — entrants (durable) plus anyone connected
        // — each already flagged online/offline and carrying their pick.
        s.on("room:members", ({ members: list }: { members: Member[] }) => {
            setPushed(list);
        });

        s.on("message:new", (wire: Wire) => {
            setStreamed((prev) => {
                // Our own message is already on screen optimistically — swap the temp
                // copy for the saved one rather than showing it twice.
                if (wire.clientId && prev.some((m) => m.id === wire.clientId)) {
                    return prev.map((m) => (m.id === wire.clientId ? toMessage(wire) : m));
                }
                if (prev.some((m) => m.id === wire.id)) return prev;
                return [...prev, toMessage(wire)];
            });
        });

        // A late joiner gets the match so far in one shot, rather than staring at
        // 0-0 until the next goal.
        s.on("match:sync", ({ state, events }: { state: LiveState; events: WireEvent[] }) => {
            setLiveState(state);
            if (typeof state.clockSeconds === "number") {
                setRound((prev) =>
                    prev && !prev.resolved ? { ...prev, currentClock: state.clockSeconds! } : prev
                );
            }
            setStreamed((prev) => {
                const known = new Set(prev.map((m) => m.id));
                const synced = events
                    .map((e) => toSystem(e, state.p1IsHome))
                    .filter((m) => !known.has(m.id));
                return [...prev, ...synced];
            });
        });

        // The clock, moving on its own. Most feed updates are possession noise and
        // carry no event — but they carry the time, and the room should show it.
        s.on("match:state", ({ state }: { state: LiveState }) => {
            setLiveState(state);
            if (typeof state.clockSeconds === "number") {
                setRound((prev) =>
                    prev && !prev.resolved ? { ...prev, currentClock: state.clockSeconds! } : prev
                );
            }
        });

        // The match interrupting the conversation, as it happens.
        s.on("match:event", ({ event, state }: { event: WireEvent; state: LiveState }) => {
            setLiveState(state);
            if (typeof state.clockSeconds === "number") {
                setRound((prev) =>
                    prev && !prev.resolved ? { ...prev, currentClock: state.clockSeconds! } : prev
                );
            }
            const message = toSystem(event, state.p1IsHome);

            // VAR gave it and VAR took it away. The goal card comes back off.
            if (event.retracted) {
                setStreamed((prev) => prev.filter((m) => m.id !== message.id));
                return;
            }

            setStreamed((prev) => {
                const at = prev.findIndex((m) => m.id === message.id);
                // An amendment (the feed naming the scorer late) replaces the event
                // in place — appending it again would show the goal twice.
                if (at >= 0) {
                    const next = [...prev];
                    next[at] = message;
                    return next;
                }
                return [...prev, message];
            });
        });

        /** A window only ever changes in place — it's one card moving through states. */
        const patchRound = (id: string, patch: Partial<Round>) =>
            setRound((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));

        s.on("window_opened", (wire: WireWindow) => setRound(toRound(wire)));

        /**
         * The server's window is the only window. A sync REPLACES what the client holds
         * — including with nothing, when `window` is null — so a card orphaned by a
         * restart can't sit on screen forever waiting for a result.
         */
        s.on(
            "window_sync",
            ({ window: wire, mine }: { window: WireWindow | null; mine: unknown }) => {
                setRound(wire ? toRound(wire, mineFrom(mine)) : null);
            }
        );

        s.on("window_tally", ({ id, tally }: { id: string; tally: { yes: number; no: number } }) => {
            patchRound(id, { tally });
        });

        s.on("window_locked", ({ id, tally }: { id: string; tally: { yes: number; no: number } }) => {
            patchRound(id, { tally, status: "locked", locksAt: Date.now() });
        });

        // The server only ACKs an answer it accepted — the disabled button is a
        // courtesy, the lock and the no-switching rule are enforced there.
        s.on(
            "predict:answered",
            ({ id, answer, ok }: { id: string; answer: boolean; ok: boolean }) => {
                if (ok) patchRound(id, { mine: answer });
            }
        );

        s.on(
            "window_answered",
            ({ id, guess, ok }: { id: string; guess: string; ok: boolean }) => {
                if (ok) patchRound(id, { mine: guess === "yes" });
            }
        );

        s.on(
            "window_resolved",
            (payload: {
                id: string;
                result: boolean;
                tally: { yes: number; no: number };
                points: number;
            }) => {
                patchRound(payload.id, {
                    outcome: payload.result,
                    tally: payload.tally,
                    resolved: true,
                    status: "resolved",
                    points: payload.points,
                });
            }
        );

        s.on("leaderboard_updated", ({ members: list }: { members: Member[] }) => {
            setPushed(list);
        });

        s.on("message:rejected", ({ clientId }: { clientId?: string }) => {
            setStreamed((prev) =>
                prev.map((m) =>
                    m.id === clientId && m.kind === "chat" ? { ...m, pending: false, failed: true } : m
                )
            );
        });

        return () => {
            s.emit("room:leave");
            s.disconnect();
            socket.current = null;
            setConnected(false);
        };
    }, [matchId, me?.wallet, live]);

    const send = useCallback(
        (body: string, replyTo?: string) => {
            if (!me || !socket.current) return;
            const clientId = `tmp-${Date.now()}`;

            // The optimistic copy quotes from what's already on screen, so the reply
            // renders complete before the server has echoed anything back.
            const parent = replyTo
                ? [...history, ...streamed].find((m) => m.kind === "chat" && m.id === replyTo)
                : undefined;

            const optimistic: ChatMessage = {
                id: clientId,
                kind: "chat",
                user: me,
                body,
                ts: Date.now(),
                pending: true,
                replyTo:
                    parent && parent.kind === "chat"
                        ? { id: parent.id, username: parent.user.username, body: parent.body }
                        : null,
            };
            setStreamed((prev) => [...prev, optimistic]);
            socket.current.emit("message:send", { body, clientId, replyTo });
        },
        [me, history, streamed]
    );

    const answer = useCallback((id: string, choice: boolean) => {
        socket.current?.emit("predict:answer", { id, answer: choice });
    }, []);

    // History first, then anything that arrived live — deduped, since a message
    // sent just now can also appear in a refetched history.
    const seen = new Set(history.map((m) => m.id));
    const messages: RoomMessage[] = [...history, ...streamed.filter((m) => !seen.has(m.id))];

    return {
        messages,
        members,
        onlineCount: members.filter((m) => m.online).length,
        connected,
        error,
        live: liveState,
        round,
        send,
        answer,
    };
}
