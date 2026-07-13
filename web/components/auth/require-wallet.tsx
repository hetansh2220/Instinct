"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { Loader2 } from "lucide-react";

/**
 * Gates an app page behind a connected wallet, sending signed-out visitors back to
 * the landing page.
 *
 * The subtlety is auto-connect: on a hard refresh the adapter restores the session
 * asynchronously, so `connected` is false for a beat even for a signed-in user.
 * Redirecting on that first render would eject them from their own app. So we wait
 * for the adapter to settle — and if a wallet name is remembered in localStorage,
 * we know a reconnect is coming and hold on for it.
 */
export function RequireWallet({ children }: { children: React.ReactNode }) {
    const { connected, connecting } = useWallet();
    const router = useRouter();

    useEffect(() => {
        if (connected) return;
        if (connecting) return; // a reconnect is in flight — let it finish

        // wallet-adapter remembers the last wallet here; if it's set, auto-connect
        // is about to run and we shouldn't bail out yet.
        const remembered =
            typeof window !== "undefined" && !!localStorage.getItem("walletName");

        const t = setTimeout(
            () => {
                if (!connected) router.replace("/");
            },
            remembered ? 1500 : 0
        );
        return () => clearTimeout(t);
    }, [connected, connecting, router]);

    if (connected) return <>{children}</>;

    // Signed-out visitors see this for an instant before the redirect; signed-in
    // ones see it only while auto-connect finishes.
    return (
        <main className="flex flex-1 items-center justify-center py-24">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </main>
    );
}
