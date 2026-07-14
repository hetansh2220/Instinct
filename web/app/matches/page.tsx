"use client";

import { MatchList } from "@/components/match/match-list";
import { RequireWallet } from "@/components/auth/require-wallet";

export default function MatchesPage() {
  return (
    <RequireWallet>
      <main className="w-full flex-1 px-5 py-10 sm:px-8">
        <div className="mb-8 flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Matches</h1>
          <p className="text-sm text-muted-foreground">
            Tap a match to preview it and join the live contest.
          </p>
        </div>

        {/* No activation gate. The server holds the TxLINE token, so matches load
            immediately — this page used to sit behind a 15-30s on-chain transaction
            that also failed outright on a wallet with no devnet SOL. */}
        <MatchList />
      </main>
    </RequireWallet>
  );
}
