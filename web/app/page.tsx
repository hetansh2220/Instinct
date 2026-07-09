"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useTxlineCreds } from "@/lib/txline/creds";
import { MatchList } from "@/components/match/match-list";

export default function Home() {
  const { connected } = useWallet();
  const creds = useTxlineCreds();

  return (
    <main className="w-full flex-1 px-5 py-10 sm:px-8">
      <div className="mb-8 flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Matches</h1>
        <p className="text-sm text-muted-foreground">
          Tap a match to preview it and join the live contest.
        </p>
      </div>

      {!creds ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {connected
            ? "Click “Subscribe & Activate” in the top bar to load matches."
            : "Connect a wallet (top bar) to begin."}
        </p>
      ) : (
        <MatchList />
      )}
    </main>
  );
}
