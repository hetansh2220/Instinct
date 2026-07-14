"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Check, Copy, Sparkles, Wallet } from "lucide-react";
import { useProfile, avatarUrl } from "@/lib/user";
import { ProfileDialog } from "@/components/profile/profile-dialog";
import { ActivateCard } from "@/components/solana/activate-card";
import { Button } from "@/components/ui/button";

export default function ProfilePage() {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const wallet = publicKey?.toBase58();
  const { data: profile } = useProfile(wallet);
  const [copied, setCopied] = useState(false);
  const [setup, setSetup] = useState(false);

  function copy() {
    if (!wallet) return;
    navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!connected || !wallet) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-5 px-5 py-24 text-center sm:px-8">
        <span className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <Wallet className="size-6" />
        </span>
        <p className="text-sm text-muted-foreground">Connect your wallet to view your profile.</p>
        <Button size="lg" onClick={() => setVisible(true)}>
          Connect Wallet
        </Button>
      </main>
    );
  }

  const short = `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
  const img = avatarUrl(wallet);
  const points = profile?.points ?? 0;
  const predictions = profile?.predictions ?? 0;
  const wins = profile?.wins ?? 0;
  const streak = profile?.currentStreak ?? 0;
  const winRate = predictions ? Math.round((wins / predictions) * 100) : 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-5 py-10 sm:px-8">
      <div className="mb-1 flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">Your account and contest stats.</p>
      </div>


      <section className="animate-in fade-in-0 slide-in-from-bottom-2 rounded-2xl border border-border bg-card p-6 duration-500">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <img src={img} alt="avatar" className="size-16 rounded-full bg-muted ring-1 ring-border" />
            <div className="flex flex-col gap-1">
              <span className="font-heading text-2xl font-semibold tracking-tight">
                {profile?.username || short}
              </span>
              <button
                onClick={copy}
                className="flex w-fit items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {short}
                {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col items-end">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              Points
            </span>
            <span className="font-heading text-4xl font-bold tabular-nums text-emerald-500">
              {points.toLocaleString()}
            </span>
          </div>
        </div>

        {profile?.bio && (
          <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">{profile.bio}</p>
        )}

        {!profile?.username && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">Add a username to personalize your profile.</p>
            <Button size="sm" className="gap-1.5" onClick={() => setSetup(true)}>
              <Sparkles className="size-3.5" /> Complete profile
            </Button>
          </div>
        )}
      </section>

      {/* stat row */}
      <div
        className="animate-in fade-in-0 slide-in-from-bottom-2 grid grid-cols-2 gap-4 duration-500 sm:grid-cols-4"
        style={{ animationDelay: "80ms" }}
      >
        <Stat label="Predictions" value={predictions.toLocaleString()} />
        <Stat label="Wins" value={wins.toLocaleString()} />
        <Stat label="Win rate" value={`${winRate}%`} />
        <Stat label="Streak" value={`${streak}${streak > 0 ? "🔥" : ""}`} />
      </div>

      {/* Optional on-chain subscription — nothing in the app depends on it. */}
      <ActivateCard />

      <ProfileDialog wallet={wallet} open={setup} onOpenChange={setSetup} initial={profile} required />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-5">
      <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">{label}</span>
      <span className="font-heading text-2xl font-bold tabular-nums">{value}</span>
    </div>
  );
}
