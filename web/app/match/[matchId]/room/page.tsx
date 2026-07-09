import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center gap-3 px-5 py-24 text-center sm:px-8">
      <h1 className="font-heading text-xl font-semibold">Live contest room</h1>
      <p className="text-sm text-muted-foreground">
        The shared prediction room for match #{matchId} — coming soon.
      </p>
      <Link
        href={`/match/${matchId}`}
        className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to match
      </Link>
    </main>
  );
}
