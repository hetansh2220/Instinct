"use client";

import { useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ChevronDown, Copy, LogOut, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WalletButton() {
  const { publicKey, disconnect, connecting, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const base58 = publicKey?.toBase58();
  const short = base58 ? `${base58.slice(0, 4)}…${base58.slice(-4)}` : "";

  const copy = useCallback(() => {
    if (base58) navigator.clipboard.writeText(base58);
  }, [base58]);

  if (!connected) {
    return (
      <Button size="lg" onClick={() => setVisible(true)} disabled={connecting}>
        {connecting ? "Connecting…" : "Connect Wallet"}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="lg" className="gap-2 font-mono">
          <span className="size-4 rounded-full bg-white" />
          {short}
          <ChevronDown className="size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="truncate font-mono text-sm font-normal text-muted-foreground">
          {base58}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={copy}>
          <Copy className="size-5" /> Copy address
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setVisible(true)}>
          <RefreshCw className="size-5" /> Change wallet
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => disconnect()}>
          <LogOut className="size-5" /> Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
