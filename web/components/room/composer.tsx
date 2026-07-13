"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ImagePlay, SendHorizontal, Smile, X } from "lucide-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import { Giphy } from "gif-picker-react/providers/giphy";
import type { Theme } from "gif-picker-react";
import "gif-picker-react/style.css";
import type { ChatMessage } from "@/lib/room/types";
import { previewOf } from "@/lib/room/gif";
import { cn } from "@/lib/utils";

const MAX = 500;
const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY;

// Both pickers are heavy and browser-only, so they load lazily — most messages are
// just text and shouldn't pay for them. gif-picker-react v2 exports GifPicker as a
// NAMED export and takes a provider object (not an apiKey, as v1 did).
const EmojiPicker = dynamic(() => import("emoji-picker-react").then((m) => m.default), {
    ssr: false,
});
const GifPicker = dynamic(() => import("gif-picker-react").then((m) => m.GifPicker), {
    ssr: false,
});

type Panel = "emoji" | "gif" | null;

export function Composer({
    onSend,
    connected,
    canChat,
    replyTo,
    onCancelReply,
}: {
    onSend: (body: string, replyTo?: string) => void;
    connected: boolean;
    canChat: boolean;
    /** The message being answered, if any. */
    replyTo?: ChatMessage | null;
    onCancelReply?: () => void;
}) {
    const { setVisible } = useWalletModal();
    const [value, setValue] = useState("");
    const [panel, setPanel] = useState<Panel>(null);
    const wrap = useRef<HTMLDivElement>(null);

    // Built once. A fresh provider object on every render makes GifPicker treat it
    // as a new source and refetch, which can also swallow the click you just made.
    const giphy = useMemo(() => (GIPHY_KEY ? Giphy(GIPHY_KEY) : null), []);

    // Close the picker on an outside click or Escape — it's a popover, not a modal.
    useEffect(() => {
        if (!panel) return;

        const onDown = (e: MouseEvent) => {
            if (wrap.current && !wrap.current.contains(e.target as Node)) setPanel(null);
        };
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);

        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [panel]);

    // Reading the room is open to everyone; talking needs a wallet.
    if (!canChat) {
        return (
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
                <p className="text-sm text-muted-foreground">Connect your wallet to join the conversation.</p>
                <Button size="sm" onClick={() => setVisible(true)}>
                    Connect Wallet
                </Button>
            </div>
        );
    }

    function submit() {
        const body = value.trim();
        if (!body) return;
        onSend(body.slice(0, MAX), replyTo?.id);
        setValue("");
        setPanel(null);
        onCancelReply?.();
    }

    return (
        <div ref={wrap} className="relative border-t border-border px-4 py-3">
            {panel && (
                <div className="absolute bottom-full left-4 z-50 mb-2 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
                    {panel === "emoji" ? (
                        <EmojiPicker
                            theme={"dark" as never}
                            lazyLoadEmojis
                            width={320}
                            height={400}
                            onEmojiClick={(e: { emoji: string }) => {
                                setValue((v) => (v + e.emoji).slice(0, MAX));
                                setPanel(null);
                            }}
                        />
                    ) : (
                        <GifPicker
                            provider={giphy!}
                            theme={"dark" as Theme}
                            width={320}
                            height={400}
                            // A GIF IS the message — there's nothing to type alongside it.
                            onGifClick={(gif) => {
                                // A provider can hand back a gif with no usable url;
                                // sending undefined would be silently dropped server-side.
                                if (!gif?.imageUrl) {
                                    console.error("[gif] no imageUrl on", gif);
                                    return;
                                }
                                onSend(gif.imageUrl, replyTo?.id);
                                setPanel(null);
                                onCancelReply?.();
                            }}
                        />
                    )}
                </div>
            )}

            {/* What you're answering, so it's unambiguous before you hit send. */}
            {replyTo && (
                <div className="mb-2 flex items-center gap-2 rounded-xl border-l-2 border-emerald-500 bg-muted/50 px-3 py-2">
                    <span className="flex min-w-0 flex-col">
                        <span className="text-[11px] font-semibold text-emerald-400">
                            Replying to {replyTo.user.username}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{previewOf(replyTo.body)}</span>
                    </span>
                    <button
                        onClick={onCancelReply}
                        aria-label="Cancel reply"
                        className="ml-auto grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-3.5" />
                    </button>
                </div>
            )}

            <div className="flex items-end gap-2">
                <IconButton
                    label="Emoji"
                    active={panel === "emoji"}
                    onClick={() => setPanel((p) => (p === "emoji" ? null : "emoji"))}
                >
                    <Smile className="size-4" />
                </IconButton>

                {/* Giphy needs a key; without one the button would open a dead panel. */}
                {GIPHY_KEY && (
                    <IconButton
                        label="GIF"
                        active={panel === "gif"}
                        onClick={() => setPanel((p) => (p === "gif" ? null : "gif"))}
                    >
                        <ImagePlay className="size-4" />
                    </IconButton>
                )}

                <textarea
                    value={value}
                    onChange={(e) => setValue(e.target.value.slice(0, MAX))}
                    onKeyDown={(e) => {
                        // Enter sends; Shift+Enter is a newline.
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    rows={1}
                    placeholder={connected ? "Say something…" : "Connecting…"}
                    disabled={!connected}
                    className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring disabled:opacity-50"
                />

                <Button size="icon" className="size-10 shrink-0" disabled={!connected || !value.trim()} onClick={submit}>
                    <SendHorizontal className="size-4" />
                </Button>
            </div>
        </div>
    );
}

function IconButton({
    label,
    active,
    onClick,
    children,
}: {
    label: string;
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            onClick={onClick}
            className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl border border-border transition-colors",
                active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
        >
            {children}
        </button>
    );
}
