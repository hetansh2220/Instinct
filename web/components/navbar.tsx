"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { Activity } from "lucide-react";
import { WalletButton } from "./solana/wallet-button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/matches", label: "Matches" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function Navbar() {
  const pathname = usePathname();
  const { connected } = useWallet();


  const overHero = pathname === "/";

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-colors",
        overHero
          ? "bg-transparent"
          : "border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60"
      )}
    >
      <div className="flex h-16 w-full items-center justify-between gap-3 px-5 sm:px-8">

        <div className="flex items-center gap-6">
          {/* A connected user gets bounced off "/" anyway, so send them somewhere real. */}
          <Link href={connected ? "/matches" : "/"} className="group flex items-center gap-2.5">
            <span className="font-heading text-2xl font-semibold tracking-tight">
              Instinct
            </span>
          </Link>

          {/* Signed-out visitors would just be bounced back to "/" by RequireWallet,
              so don't offer the links at all. */}
          <nav className="flex items-center gap-1">
            {(connected ? LINKS : []).map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  pathname === l.href
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
