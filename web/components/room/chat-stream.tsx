"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, Reply } from "lucide-react";
import { avatarUrl } from "@/lib/user";
import type { ChatMessage, RoomMessage, SystemMessage } from "@/lib/room/types";
import { gifUrl, previewOf } from "@/lib/room/gif";
import { cn } from "@/lib/utils";

const time = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * A message that's nothing but emoji (up to 3) renders large and bubble-less —
 * a single 😂 marooned in a full-size bubble looks like a mistake.
 */
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|️|‍)+$/u;

function isEmojiOnly(body: string): boolean {
    const text = body.trim();
    if (!text || !EMOJI_ONLY.test(text)) return false;
    return [...new Intl.Segmenter().segment(text)].length <= 3;
}

export function ChatStream({
    messages,
    meWallet,
    onReply,
    teamOf,
}: {
    messages: RoomMessage[];
    meWallet?: string;
    onReply?: (m: ChatMessage) => void;
    /** Participant side (1|2) -> team name, so events can say WHO. */
    teamOf?: (side: 1 | 2) => string | undefined;
}) {
    const bottom = useRef<HTMLDivElement>(null);
    const scroller = useRef<HTMLDivElement>(null);
    const [pinned, setPinned] = useState(true);

    // Only follow the conversation if the user is already at the bottom. Yanking
    // someone back down mid-scroll is the fastest way to ruin a chat UI.
    useEffect(() => {
        if (pinned) bottom.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, pinned]);

    /**
     * Re-pin whenever the content itself grows, not just when a message arrives.
     * A GIF has no height until it loads, so it lands AFTER the scroll it
     * triggered and shoves whatever came next below the fold — which is how a
     * goal card ended up invisible under the composer, with no "New messages"
     * button either, because no scroll event fired to unpin.
     */
    useEffect(() => {
        const el = scroller.current;
        if (!el) return;
        const observer = new ResizeObserver(() => {
            if (pinned) el.scrollTop = el.scrollHeight;
        });
        for (const child of el.children) observer.observe(child);
        return () => observer.disconnect();
    }, [messages, pinned]);

    function onScroll() {
        const el = scroller.current;
        if (!el) return;
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        setPinned(distance < 80);
    }

    return (
        <div className="relative min-h-0 flex-1">
            <div
                ref={scroller}
                onScroll={onScroll}
                className="flex h-full flex-col gap-1.5 overflow-y-auto px-6 py-5"
            >
                {messages.length === 0 && (
                    <p className="m-auto text-sm text-muted-foreground">
                        No one&apos;s talking yet. Say something.
                    </p>
                )}

                {messages.map((m, i) => {
                    if (m.kind === "system")
                        return <SystemCard key={m.id} message={m} teamOf={teamOf} />;

                    // Consecutive messages from one person collapse into a run: the
                    // avatar and name appear once, which is what kills the dead space.
                    const prev = messages[i - 1];
                    const grouped =
                        prev?.kind === "chat" &&
                        prev.user.wallet === m.user.wallet &&
                        m.ts - prev.ts < 5 * 60_000;

                    return (
                        <Bubble
                            key={m.id}
                            message={m}
                            mine={m.user.wallet === meWallet}
                            grouped={grouped}
                            onReply={onReply}
                        />
                    );
                })}
                <div ref={bottom} />
            </div>

            {!pinned && (
                <button
                    onClick={() => setPinned(true)}
                    className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
                >
                    <ArrowDown className="size-3.5" /> New messages
                </button>
            )}
        </div>
    );
}

function Bubble({
    message,
    mine,
    grouped,
    onReply,
}: {
    message: ChatMessage;
    mine: boolean;
    grouped: boolean;
    onReply?: (m: ChatMessage) => void;
}) {
    const gif = gifUrl(message.body);
    const emojiOnly = !gif && isEmojiOnly(message.body);

    return (
        <div
            id={`msg-${message.id}`}
            className={cn(
                "group flex shrink-0 items-end gap-2.5 scroll-mt-4 transition-colors",
                mine && "flex-row-reverse",
                !grouped && "mt-3" // breathing room between speakers, tight within a run
            )}
        >
            {grouped ? (
                <span className="size-8 shrink-0" /> // keeps the run aligned under the avatar
            ) : (
                <img
                    src={avatarUrl(message.user.wallet)}
                    alt=""
                    className="size-8 shrink-0 rounded-full bg-muted ring-1 ring-border"
                />
            )}

            {/* items-start/end keeps the bubble at its content width — without it the
                bubble stretches to match the name+time header above it, so a
                one-emoji message rendered as wide as the username. */}
            <div
                className={cn(
                    "flex max-w-[80%] flex-col gap-1",
                    mine ? "items-end" : "items-start"
                )}
            >
                {!grouped && (
                    <span className="flex items-center gap-2 px-1 text-xs">
                        <span className="font-medium">{mine ? "You" : message.user.username}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{time(message.ts)}</span>
                    </span>
                )}

                {/* The quote sits ABOVE the bubble and jumps to the original on click —
                    the whole point of a reply is being able to find what it answers. */}
                {message.replyTo && (
                    <button
                        onClick={() =>
                            document
                                .getElementById(`msg-${message.replyTo!.id}`)
                                ?.scrollIntoView({ behavior: "smooth", block: "center" })
                        }
                        className={cn(
                            "flex max-w-full flex-col items-start gap-0.5 rounded-lg border-l-2 border-emerald-500/60 bg-muted/40 px-2.5 py-1.5 text-left transition-colors hover:bg-muted",
                            mine && "items-end"
                        )}
                    >
                        <span className="text-[10px] font-semibold text-emerald-400">
                            {message.replyTo.username}
                        </span>
                        <span className="line-clamp-1 text-[11px] text-muted-foreground">
                            {previewOf(message.replyTo.body)}
                        </span>
                    </button>
                )}
                {gif ? (
                    <img
                        src={gif}
                        alt="GIF"
                        // Capped: Giphy's original format is often 1-2 MB and full
                        // width, which swamps the conversation around it.
                        className={cn(
                            "max-h-64 w-auto max-w-xs rounded-2xl object-contain ring-1 ring-border transition-opacity",
                            mine ? "rounded-br-sm" : "rounded-bl-sm",
                            message.pending && "opacity-60"
                        )}
                    />
                ) : emojiOnly ? (
                    <p
                        className={cn(
                            "px-1 text-4xl leading-tight transition-opacity",
                            message.pending && "opacity-60"
                        )}
                    >
                        {message.body}
                    </p>
                ) : (
                    <p
                        className={cn(
                            "rounded-2xl px-3.5 py-2 text-sm wrap-break-word transition-opacity",
                            mine
                                ? "rounded-br-sm bg-primary text-primary-foreground"
                                : "rounded-bl-sm bg-muted text-foreground",
                            message.pending && "opacity-60",
                            message.failed && "bg-destructive/20 text-destructive"
                        )}
                    >
                        {message.body}
                    </p>
                )}
            </div>

            {/* Appears on hover only — a permanent button on every message would be
                visual noise on a busy stream. Hidden until the message is real. */}
            {onReply && !message.pending && (
                <button
                    onClick={() => onReply(message)}
                    title="Reply"
                    aria-label="Reply"
                    className="mb-1 grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
                >
                    <Reply className="size-3.5" />
                </button>
            )}
        </div>
    );
}

/**
 * The match interrupting the conversation. Deliberately full-bleed and loud —
 * a goal should physically break the flow of chat, the way it breaks the room.
 */
function SystemCard({ message, teamOf }: { message: SystemMessage; teamOf?: (side: 1 | 2) => string | undefined }) {
    // Who it happened to. A corner with no team is just trivia — the room needs to
    // know which end the ball is at.
    const team = message.side ? teamOf?.(message.side) : undefined;

    // No enter animation here: `animate-in fade-in-0` left the card stuck at
    // opacity 0 in the stream — a goal that doesn't paint is worse than one that
    // doesn't fade.
    if (message.event === "goal") {
        return (
            <div className="my-1 shrink-0 overflow-hidden rounded-2xl bg-emerald-600 text-center text-white">
                <div className="flex flex-col items-center gap-0.5 py-3">
                    <span className="text-xl leading-none">⚽</span>
                    <span className="font-heading text-base font-extrabold tracking-widest">GOAL</span>
                    <span className="text-sm font-semibold">
                        {message.player ?? team ?? message.team}
                        {message.minute !== undefined && (
                            <span className="ml-1.5 font-mono text-xs opacity-80">{message.minute}&apos;</span>
                        )}
                    </span>
                    {message.player && team && (
                        <span className="font-mono text-[10px] tracking-wider uppercase opacity-80">{team}</span>
                    )}
                </div>
                {message.score && (
                    <div className="bg-black/20 py-1.5 font-mono text-xs font-bold tabular-nums">
                        {message.score[0]} &nbsp;-&nbsp; {message.score[1]}
                    </div>
                )}
            </div>
        );
    }

    const meta: Record<string, { icon: string; label: string }> = {
        yellow: { icon: "🟨", label: "Yellow card" },
        corner: { icon: "🚩", label: "Corner" },
        red: { icon: "🟥", label: "Red card" },
        sub: { icon: "🔁", label: "Substitution" },
        kickoff: { icon: "⏱", label: "Kick off" },
        fulltime: { icon: "⏱", label: "Full time" },
    };
    const { icon, label } = meta[message.event] ?? { icon: "•", label: message.event };

    return (
        <div className="flex shrink-0 items-center justify-center gap-2.5 rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-xs">
            <span>{icon}</span>
            <span className="font-mono font-bold tracking-widest text-muted-foreground uppercase">{label}</span>
            {message.player && <span className="font-medium">{message.player}</span>}
            {team && <span className="font-medium text-muted-foreground">{team}</span>}
            {message.minute !== undefined && (
                <span className="font-mono tabular-nums text-muted-foreground">{message.minute}&apos;</span>
            )}
        </div>
    );
}
