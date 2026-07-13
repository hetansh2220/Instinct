"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowLeft, Users } from "lucide-react";
import { useTxlineCreds } from "@/lib/txline/creds";
import { getHistorical } from "@/lib/txline/data";
import { parseHistorical, type Snapshot } from "@/lib/txline/timeline";
import { useProfile } from "@/lib/user";
import { useRoom } from "@/lib/room/use-room";
import type { ChatMessage } from "@/lib/room/types";
import { useEntry, useSubmitPick } from "@/lib/room/entry";
import { ChatStream } from "./chat-stream";
import { Composer } from "./composer";
import { MatchRail, matchState, type Pick } from "./match-rail";
import { MemberRail } from "./member-rail";
import { cn } from "@/lib/utils";

export function Room({
    matchId,
    home,
    away,
    kickoff,
}: {
    matchId: number;
    home?: string;
    away?: string;
    kickoff?: number;
}) {
    const creds = useTxlineCreds();
    const { publicKey } = useWallet();
    const wallet = publicKey?.toBase58();
    const { data: profile } = useProfile(wallet);

    const state = matchState(kickoff);
    const { data: entry } = useEntry(matchId, wallet);
    const submitPick = useSubmitPick(matchId, wallet, kickoff);
    const pick = entry?.pick;

    // Talking needs an identity; the mandatory-username gate guarantees one exists.
    const me = wallet && profile?.username ? { wallet, username: profile.username } : undefined;
    const room = useRoom(matchId, me);

    const { data } = useQuery({
        queryKey: ["historical", matchId],
        enabled: !!creds,
        staleTime: Infinity,
        queryFn: async () => {
            const raw = (await getHistorical(creds!, matchId)) as unknown;
            return Array.isArray(raw) ? (raw as Snapshot[]) : [];
        },
    });

    const parsed = useMemo(() => (data ? parseHistorical(data) : null), [data]);
    const p1IsHome = parsed?.p1IsHome ?? true;
    const score = parsed
        ? ((p1IsHome ? parsed.finalScore : [parsed.finalScore[1], parsed.finalScore[0]]) as [number, number])
        : undefined;

    // Mobile can't fit three columns, so the rails become tabs.
    const [pane, setPane] = useState<"chat" | "match" | "people">("chat");
    const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);

    return (
        // Pinned to the viewport (minus the h-16 navbar) so the rails stay put and
        // the chat is the only thing that scrolls. Full-bleed: a centered max-width
        // leaves dead gutters on a wide screen, which is what made this look empty.
        <main className="flex h-[calc(100dvh-4rem)] w-full flex-col gap-3 px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between gap-3">
                <Link
                    href="/matches"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="size-4" /> Matches
                </Link>
                <h1 className="truncate font-heading text-sm font-bold tracking-widest uppercase">
                    {home} <span className="text-muted-foreground">v</span> {away}
                </h1>
                {/* Everyone in the room, not just who's connected — the green dot in
                    the members rail is what tracks presence. */}
                <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                        <Users className="size-3.5" />
                        {room.members.length}
                    </span>
                </span>
            </div>

            {/* mobile pane switcher */}
            <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-card p-1.5 lg:hidden">
                {(["match", "chat", "people"] as const).map((p) => (
                    <button
                        key={p}
                        onClick={() => setPane(p)}
                        className={cn(
                            "rounded-lg py-2 font-mono text-[11px] font-bold tracking-widest uppercase transition-colors",
                            pane === p
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {p}
                    </button>
                ))}
            </div>

            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[340px_1fr_320px] xl:grid-cols-[380px_1fr_350px] 2xl:grid-cols-[420px_1fr_380px]">
                <div className={cn("min-h-0", pane === "match" ? "flex" : "hidden", "lg:flex")}>
                    <MatchRail
                        matchId={matchId}
                        home={home}
                        away={away}
                        score={score}
                        events={parsed?.timeline ?? []}
                        state={state}
                        kickoff={kickoff}
                        pick={pick}
                        onPick={(p) => submitPick.mutate(p)}
                        pending={submitPick.isPending}
                        error={submitPick.error?.message ?? null}
                    />
                </div>

                {/* the hero: the only column that scrolls */}
                <section
                    className={cn(
                        "min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card",
                        pane === "chat" ? "flex" : "hidden",
                        "lg:flex"
                    )}
                >
                    {/* Only a signed-in user opens a socket, so only they can be "connecting". */}
                    {me && !room.connected && (
                        <div
                            className={cn(
                                "border-b px-4 py-2 text-center font-mono text-[11px] tracking-wider uppercase",
                                room.error
                                    ? "border-destructive/20 bg-destructive/10 text-destructive"
                                    : "border-amber-500/20 bg-amber-500/10 text-amber-500"
                            )}
                        >
                            {room.error ?? "Connecting…"}
                        </div>
                    )}
                    <ChatStream messages={room.messages} meWallet={wallet} onReply={setReplyTo} />
                    <Composer
                        onSend={room.send}
                        connected={room.connected}
                        canChat={!!me}
                        replyTo={replyTo}
                        onCancelReply={() => setReplyTo(null)}
                    />
                </section>

                <div className={cn("min-h-0", pane === "people" ? "flex" : "hidden", "lg:flex")}>
                    <MemberRail
                        members={room.members.map((m) =>
                            m.wallet === wallet ? { ...m, pick: pick ?? m.pick } : m
                        )}
                        onlineCount={room.onlineCount}
                        home={home}
                        away={away}
                        meWallet={wallet}
                    />
                </div>
            </div>
        </main>
    );
}
