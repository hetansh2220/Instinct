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
    event: "goal" | "yellow" | "red" | "sub" | "kickoff" | "fulltime";
    minute?: number;
    /** e.g. "Mikel Merino" */
    player?: string;
    team?: string;
    /** Running score at this moment, home first. */
    score?: [number, number];
    ts: number;
}

export type RoomMessage = ChatMessage | SystemMessage;

/** The match, as it stands right now, pushed from the server's live feed. */
export interface LiveState {
    score: [number, number];
    minute: number;
    finished: boolean;
    /** Whether participant 1 is the home side — the score array is p1-first. */
    p1IsHome: boolean;
}

export interface Room {
    messages: RoomMessage[];
    /** Null until a live match sends its first update. */
    live: LiveState | null;
    members: Member[];
    onlineCount: number;
    connected: boolean;
    /** Why the socket isn't connected, when it isn't. */
    error: string | null;
    /** `replyTo` is the id of the message being answered. */
    send: (body: string, replyTo?: string) => void;
}
