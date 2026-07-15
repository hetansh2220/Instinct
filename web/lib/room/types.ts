// The room's data contract. Everything the UI consumes is defined here so the
// mock and the eventual Socket.IO client are interchangeable — swapping one for
// the other must not touch a single component.

export interface RoomUser {
    wallet: string;
    username: string;
}

export interface Member extends RoomUser {
    points: number;
    online: boolean;
    /** Their pre-match pick, once contest entries exist. */
    pick?: "home" | "draw" | "away";
}

/** The message being replied to, quoted inline on the reply. */
export interface QuotedMessage {
    id: string;
    username: string;
    body: string;
}

/** A person talking. */
export interface ChatMessage {
    id: string;
    kind: "chat";
    user: RoomUser;
    body: string;
    ts: number;
    /** Set when this message is a reply. */
    replyTo?: QuotedMessage | null;
    /** Sent but not yet acknowledged by the server. */
    pending?: boolean;
    failed?: boolean;
}

/** The match itself talking — a goal, a card — injected into the stream. */
export interface SystemMessage {
    id: string;
    kind: "system";
    event: "goal" | "yellow" | "red" | "corner" | "sub" | "kickoff" | "fulltime";
    minute?: number;
    /** e.g. "Mikel Merino" */
    player?: string;
    team?: string;
    /** Participant side the event belongs to — resolved to a team name by the UI. */
    side?: 1 | 2;
    /** Running score at this moment, home first. */
    score?: [number, number];
    ts: number;
}

/**
 * A live mini-event prediction window. Deliberately NOT a chat message: it isn't
 * something anyone said, it doesn't belong in the transcript, and it has its own
 * lifecycle (open -> locked -> resolved). It lives beside the conversation, not in it.
 */
export interface Round {
    id: string;
    /** goal | corner | card */
    event: string;
    question: string;
    points: number;
    /** Match-clock bounds (TxLINE Clock.Seconds). */
    windowStartClock: number;
    windowEndClock: number;
    /** Latest match clock known to the client (for the countdown). */
    currentClock: number;
    /** open | locked | resolved */
    status: "open" | "locked" | "resolved";
    /** Wall-clock ms when submissions close; null once locked/resolved. */
    locksAt?: number | null;
    tally: { yes: number; no: number };
    /** What I answered, once I have. */
    mine?: boolean;
    /** Null until the window closes. */
    outcome?: boolean | null;
    resolved: boolean;
}

export type PredictionWindow = Round;

export type RoomMessage = ChatMessage | SystemMessage;

/** The match, as it stands right now, pushed from the server's live feed. */
export interface LiveState {
    score: [number, number];
    minute: number;
    finished: boolean;
    /** Whether participant 1 is the home side — the score array is p1-first. */
    p1IsHome: boolean;
    /** Raw TxLINE Clock.Seconds when known. */
    clockSeconds?: number;
}

export interface Room {
    messages: RoomMessage[];
    /** Null until a live match sends its first update. */
    live: LiveState | null;
    /** The micro-prediction in flight, or the one that just resolved. */
    round: Round | null;
    members: Member[];
    onlineCount: number;
    connected: boolean;
    /** Why the socket isn't connected, when it isn't. */
    error: string | null;
    /** `replyTo` is the id of the message being answered. */
    send: (body: string, replyTo?: string) => void;
    /** Answer the open micro-prediction round. */
    answer: (id: string, choice: boolean) => void;
}
