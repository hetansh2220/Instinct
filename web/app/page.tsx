"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { Hero } from "@/components/landing/hero";

export default function Home() {
  const { connected } = useWallet();
  const router = useRouter();

  // The landing page is the signed-out door. Once a wallet is connected there's
  // nothing here for you, so go straight to the app. `replace` (not `push`) so Back
  // doesn't bounce you between the two.
  useEffect(() => {
    if (connected) router.replace("/matches");
  }, [connected, router]);

  if (connected) return null;

  return <Hero />;
}
