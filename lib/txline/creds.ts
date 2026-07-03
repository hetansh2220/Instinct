// Persists the TxLINE credentials (guest JWT + activated API token) obtained
// from the subscribe/activate flow, so any page can call the data API without
// re-running the on-chain flow. Changes are broadcast so components stay in sync.

import { useEffect, useState } from "react";

export interface TxlineCreds {
    jwt: string;
    apiToken: string;
}

const KEY = "txline_creds";
const EVENT = "txline-creds-changed";

function broadcast() {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function saveCreds(c: TxlineCreds): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(c));

        broadcast();
    } catch {
        /* storage unavailable — ignore */
    }
}

export function loadCreds(): TxlineCreds | null {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<TxlineCreds>;
        return parsed.jwt && parsed.apiToken ? { jwt: parsed.jwt, apiToken: parsed.apiToken } : null;
    } catch {
        return null;
    }
}

export function clearCreds(): void {
    try {
        localStorage.removeItem(KEY);
        broadcast();
    } catch {
        /* ignore */
    }
}

/** Reactive creds: re-reads on save/clear (this tab) and storage events (other tabs). */
export function useTxlineCreds(): TxlineCreds | null {
    const [creds, setCreds] = useState<TxlineCreds | null>(null);
    useEffect(() => {
        const sync = () => setCreds(loadCreds());
        sync();
        window.addEventListener(EVENT, sync);
        window.addEventListener("storage", sync);
        return () => {
            window.removeEventListener(EVENT, sync);
            window.removeEventListener("storage", sync);
        };
    }, []);
    return creds;
}
