import { MatchRecap } from "@/components/match/match-recap";

export const dynamic = "force-dynamic";

export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ h?: string; a?: string }>;
}) {
  const { matchId } = await params;
  const { h, a } = await searchParams;
  return <MatchRecap matchId={Number(matchId)} home={h} away={a} />;
}
