import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

export const apiOrigin = "https://txline-dev.txodds.com";
export const programId = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
export const txlTokenMint = new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG");

// PDAs the subscribe instruction needs — derived the same way TxLINE does.
const seed = (s: string) => new TextEncoder().encode(s);
export const [pricingMatrixPda] = PublicKey.findProgramAddressSync([seed("pricing_matrix")], programId);
export const [tokenTreasuryPda] = PublicKey.findProgramAddressSync([seed("token_treasury_v2")], programId);

export const tokenTreasuryVault = getAssociatedTokenAddressSync(
    txlTokenMint, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
);

// The connected user's TxL token account (must exist before subscribe).
export function getUserTokenAccount(owner: PublicKey) {
    return getAssociatedTokenAddressSync(
        txlTokenMint, owner, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
    );
}
