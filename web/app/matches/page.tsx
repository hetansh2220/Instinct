"use client";

import { useTxlineCreds } from "@/lib/txline/creds";
import { MatchList } from "@/components/match/match-list";
import { RequireWallet } from "@/components/auth/require-wallet";

export default function MatchesPage() {
  const creds = useTxlineCreds();

  return (
    <RequireWallet>
      <main className="w-full flex-1 px-5 py-10 sm:px-8">
        <div className="mb-8 flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Matches</h1>
          <p className="text-sm text-muted-foreground">
            Tap a match to preview it and join the live contest.
          </p>
        </div>

        {/* RequireWallet guarantees a wallet by here, so the only thing left to wait
            on is activation, which is what fetches the match data. */}
        {!creds ? (
          <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Activating your account — this loads the match data.
          </p>
        ) : (
          <MatchList />
        )}
      </main>
    </RequireWallet>
  );
}
