import Subscribe from "@/components/solana/subscribe";

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-8">
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Data console
        </h1>
        <p className="text-sm text-muted-foreground">
          Subscribe on-chain, activate your API token, and pull live fixtures —
          each step shows its status below.
        </p>
      </div>

      <Subscribe />
    </main>
  );
}
