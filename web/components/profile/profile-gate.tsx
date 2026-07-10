"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useProfile } from "@/lib/user";
import { ProfileDialog } from "./profile-dialog";


export function ProfileGate() {
    const { connected, publicKey } = useWallet();
    const wallet = publicKey?.toBase58();
    const { data: profile, isFetched } = useProfile(wallet);
    const [open, setOpen] = useState(false);
    const prompted = useRef(false);

    useEffect(() => {
        if (!connected) {
            prompted.current = false;
            return;
        }
        if (wallet && isFetched && !profile?.username && !prompted.current) {
            prompted.current = true;
            setOpen(true);
        }
    }, [connected, wallet, isFetched, profile]);

    if (!wallet) return null;
    return <ProfileDialog wallet={wallet} open={open} onOpenChange={setOpen} initial={profile} required />;
}
