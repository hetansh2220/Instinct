"use client";

import { useState } from "react";
import { useConnection, useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { Check, Loader2, Play, X, Download } from "lucide-react";
import type { Txoracle } from "@/types/txoracle";
import idl from "@/idl/txoracle.json";
import {
    txlTokenMint,
    pricingMatrixPda,
    tokenTreasuryPda,
    tokenTreasuryVault,
    getUserTokenAccount,
} from "@/lib/txline/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SERVICE_LEVEL_ID = 1; // free World Cup tier (60s delay)
const DURATION_WEEKS = 4; // multiple of 4

function toBase64(bytes: Uint8Array): string {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
}

type StepStatus = "pending" | "running" | "done" | "error";
type StepKey = "guest" | "subscribe" | "sign" | "activate";

const STEP_LABELS: Record<StepKey, string> = {
    subscribe: "Subscribe on-chain",
    guest: "Guest JWT",
    sign: "Sign activation",
    activate: "Activate API token",
};
// display order
const STEP_ORDER: StepKey[] = ["subscribe", "guest", "sign", "activate"];

export default function Subscribe() {
    const { connection } = useConnection();
    const wallet = useAnchorWallet(); // signs transactions
    const { signMessage, connected } = useWallet(); // signs messages

    const [steps, setSteps] = useState<Record<StepKey, { status: StepStatus; detail?: string }>>({
        subscribe: { status: "pending" },
        guest: { status: "pending" },
        sign: { status: "pending" },
        activate: { status: "pending" },
    });
    const [jwt, setJwt] = useState<string | null>(null);
    const [txSig, setTxSig] = useState<string | null>(null);
    const [apiToken, setApiToken] = useState<string | null>(null);
    const [fixtures, setFixtures] = useState<unknown>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingFixtures, setLoadingFixtures] = useState(false);

    const started = Object.values(steps).some((s) => s.status !== "pending");

    function setStep(key: StepKey, status: StepStatus, detail?: string) {
        setSteps((prev) => ({ ...prev, [key]: { status, detail } }));
    }
    function resetSteps() {
        setSteps({
            subscribe: { status: "pending" },
            guest: { status: "pending" },
            sign: { status: "pending" },
            activate: { status: "pending" },
        });
    }

    async function subscribe() {
        if (!wallet) return;
        setLoading(true);
        setError(null);
        setFixtures(null);
        resetSteps();
        try {
            // 1. build the Anchor program bound to the connected wallet
            const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
            const program = new anchor.Program<Txoracle>(idl as Txoracle, provider);

            const user = wallet.publicKey;
            const userTokenAccount = getUserTokenAccount(user);

            // create the TxL token account in the SAME tx (fixes AccountNotInitialized)
            const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
                user, userTokenAccount, user, txlTokenMint,
                TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
            );

            // 2. subscribe on-chain (wallet signs)
            setStep("subscribe", "running");
            const sig = await program.methods
                .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
                .accounts({
                    user,
                    pricingMatrix: pricingMatrixPda,
                    tokenMint: txlTokenMint,
                    userTokenAccount,
                    tokenTreasuryVault,
                    tokenTreasuryPda,
                    tokenProgram: TOKEN_2022_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .preInstructions([createAtaIx])
                .rpc();
            setTxSig(sig);
            setStep("subscribe", "done", `${sig.slice(0, 8)}…${sig.slice(-8)}`);

            // 3. guest JWT
            setStep("guest", "running");
            const { token: jwtToken } = await fetch("/api/txline/guest/start", { method: "POST" }).then((r) => r.json());
            if (!jwtToken) throw new Error("No JWT");
            setJwt(jwtToken);
            setStep("guest", "done", `${jwtToken.slice(0, 16)}…`);

            // 4. sign the activation message `${txSig}::${jwt}`
            setStep("sign", "running");
            if (!signMessage) throw new Error("Wallet can't sign messages");
            const message = new TextEncoder().encode(`${sig}::${jwtToken}`);
            const walletSignature = toBase64(await signMessage(message));
            setStep("sign", "done");

            // 5. activate -> API token
            setStep("activate", "running");
            const activation = await fetch("/api/txline/activate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ txSig: sig, walletSignature, leagues: [], jwt: jwtToken }),
            }).then((r) => r.json());
            if (!activation.token) throw new Error(`Activate failed: ${JSON.stringify(activation)}`);
            setApiToken(activation.token);
            setStep("activate", "done", `${String(activation.token).slice(0, 14)}…`);

            // handy for testing in Thunder Client — copy these from the console
            console.log("jwt", jwtToken);
            console.log("apiToken", activation.token);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
            // mark the currently-running step as errored
            setSteps((prev) => {
                const next = { ...prev };
                for (const k of STEP_ORDER) {
                    if (next[k].status === "running") next[k] = { status: "error", detail: msg };
                }
                return next;
            });
        } finally {
            setLoading(false);
        }
    }

    async function loadFixtures() {
        if (!jwt || !apiToken) return;
        setError(null);
        setLoadingFixtures(true);
        try {
            const res = await fetch("/api/txline/fixtures", {
                headers: { "x-jwt": jwt, "x-api-token": apiToken },
            }).then((r) => r.json());
            setFixtures(res.fixtures ?? res);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoadingFixtures(false);
        }
    }

    const fixtureCount = Array.isArray(fixtures) ? fixtures.length : undefined;

    return (
        <div className="flex flex-col gap-5">
            {/* action card */}
            <section className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-sm font-medium">Free World Cup tier</h2>
                        <p className="text-xs text-muted-foreground">
                            Service level {SERVICE_LEVEL_ID} · {DURATION_WEEKS} weeks · no TxL required
                        </p>
                    </div>
                    <Button size="lg" onClick={subscribe} disabled={!connected || !wallet || loading}>
                        {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                        {loading ? "Running…" : started ? "Run again" : "Subscribe & activate"}
                    </Button>
                </div>
                {!connected && (
                    <p className="mt-3 text-xs text-muted-foreground">
                        Connect a wallet (top right) on devnet to begin.
                    </p>
                )}
            </section>

            {/* steps */}
            {started && (
                <section className="rounded-xl border border-border bg-card p-2">
                    <ol className="flex flex-col">
                        {STEP_ORDER.map((key, i) => {
                            const s = steps[key];
                            return (
                                <li
                                    key={key}
                                    className={cn(
                                        "flex items-center gap-3 rounded-lg px-3 py-3",
                                        i !== STEP_ORDER.length - 1 && "border-b border-border/60"
                                    )}
                                >
                                    <StatusIcon status={s.status} />
                                    <div className="flex min-w-0 flex-1 flex-col">
                                        <span className="text-sm font-medium">{STEP_LABELS[key]}</span>
                                        {s.detail && (
                                            <span
                                                className={cn(
                                                    "truncate font-mono text-xs",
                                                    s.status === "error" ? "text-destructive" : "text-muted-foreground"
                                                )}
                                            >
                                                {s.detail}
                                            </span>
                                        )}
                                    </div>
                                    <StatusBadge status={s.status} />
                                </li>
                            );
                        })}
                    </ol>
                </section>
            )}

            {error && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm break-all text-destructive">
                    {error}
                </p>
            )}

            {/* fixtures */}
            {apiToken && (
                <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-medium">Fixtures</h2>
                            {fixtureCount !== undefined && (
                                <Badge variant="secondary">{fixtureCount}</Badge>
                            )}
                        </div>
                        <Button variant="outline" size="lg" onClick={loadFixtures} disabled={loadingFixtures}>
                            {loadingFixtures ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                            {loadingFixtures ? "Loading…" : "Load fixtures"}
                        </Button>
                    </div>
                    {fixtures != null && (
                        <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-xs text-muted-foreground">
                            {JSON.stringify(fixtures, null, 2)}
                        </pre>
                    )}
                </section>
            )}
        </div>
    );
}

function StatusIcon({ status }: { status: StepStatus }) {
    if (status === "done")
        return (
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3.5" strokeWidth={3} />
            </span>
        );
    if (status === "error")
        return (
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
                <X className="size-3.5" strokeWidth={3} />
            </span>
        );
    if (status === "running")
        return (
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border text-foreground">
                <Loader2 className="size-3.5 animate-spin" />
            </span>
        );
    return <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border text-muted-foreground">·</span>;
}

function StatusBadge({ status }: { status: StepStatus }) {
    const map: Record<StepStatus, { label: string; variant: "secondary" | "outline" | "default" | "destructive" }> = {
        pending: { label: "pending", variant: "outline" },
        running: { label: "running", variant: "secondary" },
        done: { label: "done", variant: "default" },
        error: { label: "error", variant: "destructive" },
    };
    const { label, variant } = map[status];
    return <Badge variant={variant}>{label}</Badge>;
}
