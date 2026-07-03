"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { WalletButton } from "./solana/wallet-button";
import { ActivateButton } from "./solana/activate-button";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 w-full items-center justify-between gap-3 px-5 sm:px-8">

        <div className="flex items-center gap-6">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform group-hover:-rotate-6">
              <Activity className="size-4.5" strokeWidth={2.5} />
            </span>
            <span className="font-heading text-xl font-semibold tracking-tight">
              Tx<span className="text-primary">LINE</span>
            </span>
          </Link>


          <nav className="hidden items-center gap-1 sm:flex">
            <Link
              href="/"
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Markets
            </Link>
          </nav>
        </div>


        <div className="flex items-center gap-2">
          <ActivateButton />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
