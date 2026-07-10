"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActivate, type ActivateStatus } from "@/lib/txline/use-activate";
import { useTxlineCreds } from "@/lib/txline/creds";

const RUNNING_LABEL: Partial<Record<ActivateStatus, string>> = {
    subscribing: "Subscribing…",
    authenticating: "Authenticating…",
    signing: "Sign message…",
    activating: "Activating…",
};

export function ActivateButton() {
    const { connected } = useWallet();
    const creds = useTxlineCreds();
    const { activate, status, isActivating, error } = useActivate();


    if (!connected || creds) return null;

    return (
        <Button
            size="lg"
            onClick={activate}
            disabled={isActivating}
            title={error ?? undefined}
            className="gap-2"
        >
            {isActivating && <Loader2 className="size-4 animate-spin" />}
            {isActivating
                ? RUNNING_LABEL[status] ?? "Working…"
                : status === "error"
                    ? "Retry activate"
                    : "Subscribe & Activate"}
        </Button>
    );
}
