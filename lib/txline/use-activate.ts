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
import type { Txoracle } from "@/types/txoracle";
import idl from "@/idl/txoracle.json";
import {
    txlTokenMint,
    pricingMatrixPda,
    tokenTreasuryPda,
    tokenTreasuryVault,
    getUserTokenAccount,
} from "@/lib/txline/config";
import { saveCreds } from "@/lib/txline/creds";

const SERVICE_LEVEL_ID = 1; // free World Cup tier
const DURATION_WEEKS = 4;

function toBase64(bytes: Uint8Array): string {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
}

export type ActivateStatus =
    | "idle"
    | "subscribing"
    | "authenticating"
    | "signing"
    | "activating"
    | "done"
    | "error";

/** Runs the full subscribe → guest JWT → sign → activate flow and stores creds. */
export function useActivate() {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();
    const { signMessage } = useWallet();
    const [status, setStatus] = useState<ActivateStatus>("idle");
    const [error, setError] = useState<string | null>(null);

    async function activate() {
        if (!wallet) return;
        setError(null);
        try {
            const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
            const program = new anchor.Program<Txoracle>(idl as Txoracle, provider);
            const user = wallet.publicKey;
            const userTokenAccount = getUserTokenAccount(user);

            const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
                user, userTokenAccount, user, txlTokenMint,
                TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
            );

            // 1. subscribe on-chain (creates the TxL ATA in the same tx)
            setStatus("subscribing");
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

            // 2. guest JWT
            setStatus("authenticating");
            const { token: jwt } = await fetch("/api/txline/guest/start", { method: "POST" }).then((r) => r.json());
            if (!jwt) throw new Error("No JWT");

            // 3. sign activation message
            setStatus("signing");
            if (!signMessage) throw new Error("Wallet can't sign messages");
            const walletSignature = toBase64(await signMessage(new TextEncoder().encode(`${sig}::${jwt}`)));

            // 4. activate -> API token, then persist
            setStatus("activating");
            const activation = await fetch("/api/txline/activate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ txSig: sig, walletSignature, leagues: [], jwt }),
            }).then((r) => r.json());
            if (!activation.token) throw new Error(`Activate failed: ${JSON.stringify(activation)}`);

            saveCreds({ jwt, apiToken: activation.token });
            setStatus("done");
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setStatus("error");
        }
    }

    const isActivating =
        status === "subscribing" ||
        status === "authenticating" ||
        status === "signing" ||
        status === "activating";

    return { activate, status, isActivating, error };
}
