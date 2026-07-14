"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActivate, type ActivateStatus } from "@/lib/txline/use-activate";
import { useTxlineCreds } from "@/lib/txline/creds";

const RUNNING_LABEL: Partial<Record<ActivateStatus, string>> = {
    subscribing: "Sending transaction…",
    authenticating: "Authenticating…",
    signing: "Sign in your wallet…",
    activating: "Activating…",
};

/**
 * The on-chain TxLINE subscription. OPTIONAL — the app reads match data through
 * the server's own token, so nothing here gates the product.
 *
 * It lives on the profile page rather than the navbar for exactly that reason: in
 * the navbar it looked like a step you had to complete, and it used to fire
 * automatically on connect, making every visitor wait ~20s for a devnet
 * transaction (and fail outright with an unfunded wallet).
 */
export function ActivateCard() {
    const creds = useTxlineCreds();
    const { activate, status, isActivating, error } = useActivate();

    return (
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
            <div className="flex flex-col gap-1">
                <h2 className="font-heading text-lg font-semibold tracking-tight">
                    TxLINE subscription
                </h2>
                <p className="text-sm text-muted-foreground">
                    Subscribe on-chain to TxLINE and hold your own API token. Optional —
                    matches and contests work without it.
                </p>
            </div>

            {creds ? (
                <span className="flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
                    <Check className="size-3.5" /> Subscribed on-chain
                </span>
            ) : (
                <div className="flex flex-col gap-3">
                    <Button
                        size="lg"
                        variant="outline"
                        className="h-11 w-fit gap-2"
                        disabled={isActivating}
                        onClick={activate}
                    >
                        {isActivating && <Loader2 className="size-4 animate-spin" />}
                        {isActivating ? (RUNNING_LABEL[status] ?? "Working…") : "Activate on-chain"}
                    </Button>

                    {/* Devnet SOL is the usual failure, so say so rather than surfacing a
                        raw RPC error nobody can act on. */}
                    {status === "error" && error && (
                        <p className="flex items-start gap-1.5 text-xs text-destructive">
                            <AlertCircle className="mt-px size-3.5 shrink-0" />
                            {error}
                        </p>
                    )}

                    <p className="text-xs text-muted-foreground">
                        Sends a <span className="font-mono">subscribe</span> transaction on Solana
                        devnet — your wallet needs devnet SOL.
                    </p>
                </div>
            )}
        </section>
    );
}
