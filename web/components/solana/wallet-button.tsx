"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ChevronDown, Copy, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProfile, avatarUrl } from "@/lib/user";

export function WalletButton() {
  const { publicKey, disconnect, connecting, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const base58 = publicKey?.toBase58();
  const { data: profile } = useProfile(base58);

  const copy = useCallback(() => {
    if (base58) navigator.clipboard.writeText(base58);
  }, [base58]);

  if (!connected || !base58) {
    return (
      <Button size="lg" onClick={() => setVisible(true)} disabled={connecting}>
        {connecting ? "Connecting…" : "Connect Wallet"}
      </Button>
    );
  }

  const short = `${base58.slice(0, 4)}…${base58.slice(-4)}`;
  const img = avatarUrl(base58);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-2.5 pl-1 text-sm font-medium transition-colors hover:bg-muted">

          <img src={img} alt="" className="size-7 rounded-full bg-muted ring-1 ring-border" />
          <span className="max-w-28 truncate">{profile?.username ?? short}</span>
          <ChevronDown className="size-4 opacity-60" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-mono text-xs font-normal text-muted-foreground">
          {base58}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/profile">
            <User className="size-4" /> Profile
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={copy}>
          <Copy className="size-4" /> Copy address
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" onClick={() => disconnect()}>
          <LogOut className="size-4" /> Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
