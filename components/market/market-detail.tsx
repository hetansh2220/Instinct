"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useTxlineCreds } from "@/lib/txline/creds";
import { useFixtures } from "@/lib/txline/queries";
import { fixtureToMarket } from "@/lib/markets/from-fixtures";
import {
    decimalOdds,
    formatKickoff,
    formatUsd,
    impliedProb,
    outcomeShort,
    projectedReturn,
    teamFlag,
    type Market,
    type Outcome,
    type OutcomeKey,
} from "@/lib/markets/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ProbChart } from "./prob-chart";

// calm, on-theme accents per outcome
const OUTCOME_COLOR: Record<OutcomeKey, string> = {
    HOME: "#3fb877",
    DRAW: "#8a8f99",
    AWAY: "#ec5f6d",
};
const QUICK_ADD = [1, 5, 10, 100];
const MOCK_BALANCE = 854.92;
const TIMEFRAMES = ["1H", "6H", "1D", "All"] as const;

// seeded pseudo-random walk so a market's chart is stable across renders
function seededWalk(seed: number, base: number, len: number): number[] {
    let s = (seed || 1) >>> 0;
    const rand = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
    const out: number[] = [];
    let v = base;
    for (let i = 0; i < len; i++) {
        v += (rand() - 0.5) * 0.05;
        v = Math.min(0.9, Math.max(0.1, v));
        out.push(v);
    }
    return out;
}

interface Position {
    key: OutcomeKey;
    label: string;
    stake: number;
}

export function MarketDetail({ id, initialPick }: { id: string; initialPick?: string }) {
    const creds = useTxlineCreds();
    const fixtures = useFixtures(creds);

    const market = useMemo<Market | null>(() => {
        if (!fixtures.data) return null;
        const f = fixtures.data.find((x) => `fx-${x.FixtureId}` === id);
        return f ? fixtureToMarket(f, Date.now()) : null;
    }, [fixtures.data, id]);

    if (!creds) {
        return <Empty title="Not connected" body="Activate from the top bar to view this market." />;
    }
    if (fixtures.isLoading) return <DetailSkeleton />;
    if (!market) {
        return <Empty title="Market not found" body="This fixture is no longer in the snapshot." />;
    }

    return <MarketDetailInner market={market} initialPick={initialPick} />;
}

function MarketDetailInner({ market, initialPick }: { market: Market; initialPick?: string }) {
    const { connected } = useWallet();
    const { setVisible } = useWalletModal();

    const validKeys = market.outcomes.map((o) => o.key);
    const startKey = (initialPick && validKeys.includes(initialPick as OutcomeKey)
        ? (initialPick as OutcomeKey)
        : market.outcomes[0].key) as OutcomeKey;

    const [side, setSide] = useState<OutcomeKey>(startKey);
    const [mode, setMode] = useState<"buy" | "sell">("buy");
    const [amount, setAmount] = useState<number>(0);
    const [positions, setPositions] = useState<Position[]>([]);
    const [tf, setTf] = useState<(typeof TIMEFRAMES)[number]>("1D");
    const [tab, setTab] = useState<"positions" | "orders">("positions");

    const outcome = market.outcomes.find((o) => o.key === side) as Outcome;
    const series = useMemo(
        () => seededWalk(market.fixtureId + side.length + tf.length, impliedProb(market, outcome), 64),
        [market, side, outcome, tf]
    );

    const payout = projectedReturn(market, outcome, amount);
    const color = OUTCOME_COLOR[side];
    const lead = [...market.outcomes].sort((a, b) => b.pool - a.pool)[0];
    const leadColor = OUTCOME_COLOR[lead.key];

    function place() {
        if (!connected) return setVisible(true);
        if (amount <= 0) return;
        setPositions((p) => [{ key: side, label: outcome.label, stake: amount }, ...p]);
        setAmount(0);
    }

    return (
        <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-5 py-8 sm:px-8">
            {/* ambient glow keyed to the leading outcome */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72"
                style={{ background: `radial-gradient(55% 100% at 50% 0%, ${leadColor}1f, transparent 72%)` }}
            />


            {/* hero band */}
            <section className="animate-in fade-in-0 slide-in-from-bottom-3 overflow-hidden rounded-2xl border border-border bg-card/80 backdrop-blur duration-500">
                <div className="flex flex-wrap items-start justify-between gap-5 p-5 sm:p-6">
                    <div className="flex items-start gap-4">
                        <MatchAvatar home={market.home} away={market.away} size="lg" />
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-mono text-[10px] tracking-wide uppercase">
                                    {market.competition}
                                </Badge>
                                <StatusPill status={market.status} />
                            </div>
                            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
                                {market.home} <span className="text-muted-foreground">vs</span> {market.away}
                            </h1>
                            <p className="font-mono text-xs text-muted-foreground">
                                Match winner · Kickoff {formatKickoff(market.kickoff)}
                            </p>
                        </div>
                    </div>
                    <Countdown to={market.kickoff} />
                </div>
            </section>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_384px]">
                {/* ── left column ── */}
                <div className="flex flex-col gap-5">
                    {/* chart */}
                    <section
                        className="animate-in fade-in-0 slide-in-from-bottom-3 rounded-2xl border border-border bg-card p-5 duration-500"
                        style={{ animationDelay: "60ms" }}
                    >
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex gap-1.5">
                                {market.outcomes.map((o) => (
                                    <button
                                        key={o.key}
                                        onClick={() => setSide(o.key)}
                                        className={cn(
                                            "rounded-lg px-2.5 py-1.5 font-mono text-xs font-medium uppercase transition-colors",
                                            o.key === side
                                                ? "text-foreground"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                        style={o.key === side ? { background: `${OUTCOME_COLOR[o.key]}22`, color: OUTCOME_COLOR[o.key] } : undefined}
                                    >
                                        {outcomeShort(o.key)}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-baseline gap-1.5">
                                <span
                                    className="font-mono text-2xl font-bold tabular-nums"
                                    style={{ color }}
                                >
                                    {Math.round(impliedProb(market, outcome) * 100)}%
                                </span>
                                <span className="font-mono text-[11px] text-muted-foreground">implied</span>
                            </div>
                        </div>

                        <ProbChart points={series} color={color} height={320} />

                        <div className="mt-4 flex items-center justify-between">
                            <div className="flex gap-1">
                                {TIMEFRAMES.map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => setTf(t)}
                                        className={cn(
                                            "rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors",
                                            tf === t
                                                ? "bg-muted text-foreground"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                            <span className="font-mono text-[10px] text-muted-foreground">
                                illustrative · live odds next
                            </span>
                        </div>
                    </section>

                    {/* market book */}
                    <section
                        className="animate-in fade-in-0 slide-in-from-bottom-3 overflow-hidden rounded-2xl border border-border bg-card duration-500"
                        style={{ animationDelay: "120ms" }}
                    >
                        <div className="border-b border-border px-5 py-3 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                            Market book
                        </div>
                        <ul className="divide-y divide-border">
                            {market.outcomes.map((o) => {
                                const pct = Math.round(impliedProb(market, o) * 100);
                                const oc = OUTCOME_COLOR[o.key];
                                const activeRow = o.key === side;
                                return (
                                    <li key={o.key}>
                                        <button
                                            onClick={() => setSide(o.key)}
                                            className={cn(
                                                "flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-muted/40",
                                                activeRow && "bg-muted/30"
                                            )}
                                        >
                                            <span className="size-2 shrink-0 rounded-full" style={{ background: oc }} />
                                            <span className="w-16 shrink-0 text-sm font-semibold">
                                                {outcomeShort(o.key)}
                                            </span>
                                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                                <div
                                                    className="h-full rounded-full transition-[width] duration-500"
                                                    style={{ width: `${pct}%`, background: oc }}
                                                />
                                            </div>
                                            <span className="w-10 shrink-0 text-right font-mono text-sm font-semibold tabular-nums">
                                                {pct}%
                                            </span>
                                            <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                                                {decimalOdds(market, o).toFixed(2)}×
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>

                    {/* positions / orders */}
                    <section
                        className="animate-in fade-in-0 slide-in-from-bottom-3 overflow-hidden rounded-2xl border border-border bg-card duration-500"
                        style={{ animationDelay: "180ms" }}
                    >
                        <div className="flex gap-1 border-b border-border px-3 py-2">
                            {(["positions", "orders"] as const).map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setTab(t)}
                                    className={cn(
                                        "rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                                        tab === t
                                            ? "bg-muted text-foreground"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {t === "orders" ? "Open orders" : "Positions"}
                                </button>
                            ))}
                        </div>
                        {tab === "positions" && positions.length > 0 ? (
                            <ul className="divide-y divide-border">
                                {positions.map((p, i) => (
                                    <li key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                                        <span className="flex items-center gap-2 font-medium">
                                            <span
                                                className="size-2 rounded-full"
                                                style={{ background: OUTCOME_COLOR[p.key] }}
                                            />
                                            {p.label}
                                        </span>
                                        <span className="font-mono tabular-nums text-muted-foreground">
                                            {formatUsd(p.stake)} USDC
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="py-12 text-center text-sm text-muted-foreground">
                                {tab === "orders" ? "No open orders" : "No positions"}
                            </p>
                        )}
                    </section>
                </div>

                {/* ── right: trade panel ── */}
                <div
                    className="animate-in fade-in-0 h-fit rounded-2xl border border-border bg-card p-4 duration-500 lg:sticky lg:top-20"
                    style={{ animationDelay: "80ms" }}
                >
                    {/* header */}
                    <div className="flex items-center gap-2.5 border-b border-border pb-4">
                        <MatchAvatar home={market.home} away={market.away} size="sm" />
                        <div className="flex min-w-0 flex-col">
                            <span className="truncate text-xs text-muted-foreground">
                                {market.home} vs {market.away}
                            </span>
                            <span className="text-sm font-semibold" style={{ color }}>
                                {outcomeShort(side)}
                            </span>
                        </div>
                    </div>

                    {/* buy/sell + order type */}
                    <div className="mt-4 mb-4 flex items-center justify-between gap-2">
                        <div className="flex rounded-full bg-muted/60 p-1">
                            {(["buy", "sell"] as const).map((m) => (
                                <button
                                    key={m}
                                    onClick={() => setMode(m)}
                                    className={cn(
                                        "rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors",
                                        mode === m
                                            ? "bg-primary text-primary-foreground"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-1 rounded-full bg-muted/60 px-3 py-1.5 text-sm font-medium text-muted-foreground">
                            Market <ChevronDown className="size-4" />
                        </div>
                    </div>

                    {/* outcome selector */}
                    <div className={cn("mb-5 grid gap-2.5", market.outcomes.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
                        {market.outcomes.map((o) => {
                            const pct = Math.round(impliedProb(market, o) * 100);
                            const active = o.key === side;
                            return (
                                <button
                                    key={o.key}
                                    onClick={() => setSide(o.key)}
                                    className={cn(
                                        "flex items-center justify-center gap-1.5 rounded-lg border py-4.5 text-[15px] font-bold transition-colors",
                                        active
                                            ? "border-white/15 text-white"
                                            : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
                                    )}
                                    style={active ? { background: OUTCOME_COLOR[o.key] } : undefined}
                                >
                                    <span>{outcomeShort(o.key)}</span>
                                    <span className="font-mono tabular-nums">{pct}%</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* amount + balance */}
                    <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                            Amount
                        </span>
                        <span className="text-xs text-muted-foreground">
                            Balance <span className="font-medium text-foreground">${MOCK_BALANCE.toFixed(2)}</span>
                        </span>
                    </div>
                    <div className="mt-1 flex items-center">
                        <span className="text-4xl font-bold">$</span>
                        <input
                            inputMode="decimal"
                            value={amount || ""}
                            placeholder="0"
                            onChange={(e) => {
                                const v = Number(e.target.value.replace(/[^0-9.]/g, ""));
                                setAmount(Number.isFinite(v) ? v : 0);
                            }}
                            className="w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-muted-foreground"
                        />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                        {QUICK_ADD.map((v) => (
                            <button
                                key={v}
                                onClick={() => setAmount((a) => Math.min(MOCK_BALANCE, a + v))}
                                className="rounded-full bg-muted/60 px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                            >
                                +${v}
                            </button>
                        ))}
                        <button
                            onClick={() => setAmount(Math.floor(MOCK_BALANCE))}
                            className="rounded-full bg-muted/60 px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                        >
                            Max
                        </button>
                    </div>

                    {/* pays line */}
                    <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                        <span className="text-sm text-muted-foreground">
                            Pays {decimalOdds(market, outcome).toFixed(2)}×
                        </span>
                        <span className="text-xl font-bold tabular-nums" style={{ color }}>
                            ${payout.toFixed(2)}
                        </span>
                    </div>

                    <button
                        onClick={place}
                        className="mt-4 h-12 w-full rounded-xl text-base font-semibold text-white transition-opacity hover:opacity-90"
                        style={{ background: color }}
                    >
                        {!connected
                            ? "Connect Wallet"
                            : amount > 0
                                ? `${mode === "buy" ? "Buy" : "Sell"} ${outcomeShort(side)}`
                                : "Enter an amount"}
                    </button>

                    <p className="mt-3 text-center text-[11px] text-muted-foreground">
                        By trading, you agree to the Terms of Use.
                    </p>
                </div>
            </div>
        </div>
    );
}

function StatusPill({ status }: { status: Market["status"] }) {
    if (status === "live") {
        return (
            <span className="flex items-center gap-1.5 font-mono text-[10px] font-medium tracking-wider text-emerald-400 uppercase">
                <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                </span>
                live
            </span>
        );
    }
    return (
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            {status === "resolved" ? "settled" : "open"}
        </span>
    );
}

function Countdown({ to }: { to: number }) {
    const [now, setNow] = useState<number>(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    const diff = to - now;
    if (diff <= 0) {
        return (
            <div className="flex flex-col items-end gap-1">
                <span className="font-mono text-[9px] tracking-wider text-muted-foreground uppercase">
                    status
                </span>
                <span className="font-mono text-sm font-bold tracking-wider text-emerald-400 uppercase">
                    Started
                </span>
            </div>
        );
    }
    const days = Math.floor(diff / 8.64e7);
    const hrs = Math.floor((diff % 8.64e7) / 3.6e6);
    const min = Math.floor((diff % 3.6e6) / 6e4);
    const sec = Math.floor((diff % 6e4) / 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    // once it's more than a day out, swap seconds for a days unit
    const units: [string, string][] =
        days >= 1
            ? [
                [pad(days), "d"],
                [pad(hrs), "h"],
                [pad(min), "m"],
            ]
            : [
                [pad(hrs), "h"],
                [pad(min), "m"],
                [pad(sec), "s"],
            ];
    return (
        <div className="flex flex-col items-end gap-1.5">
            <span className="font-mono text-[9px] tracking-wider text-muted-foreground uppercase">
                Closes in
            </span>
            <div className="flex items-center gap-1.5 font-mono tabular-nums">
                {units.map(([v, l], i) => (
                    <div key={l} className="flex items-baseline">
                        <span className="rounded-md bg-muted px-1.5 py-1 text-lg font-bold">{v}</span>
                        <span className="ml-0.5 text-[10px] text-muted-foreground">{l}</span>
                        {i < 2 && <span className="ml-1 text-muted-foreground">:</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}

const AV = {
    sm: { box: "size-9", chip: "size-6 text-xs" },
    md: { box: "size-14", chip: "size-9 text-base" },
    lg: { box: "size-16", chip: "size-11 text-lg" },
};
function MatchAvatar({
    home,
    away,
    size = "md",
}: {
    home: string;
    away: string;
    size?: keyof typeof AV;
}) {
    const s = AV[size];
    return (
        <div className={cn("relative shrink-0", s.box)}>
            <span className={cn("absolute top-0 left-0 grid place-items-center rounded-full bg-muted ring-2 ring-card", s.chip)}>
                {teamFlag(home)}
            </span>
            <span className={cn("absolute right-0 bottom-0 grid place-items-center rounded-full bg-muted ring-2 ring-card", s.chip)}>
                {teamFlag(away)}
            </span>
        </div>
    );
}

function Empty({ title, body }: { title: string; body: string }) {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center gap-2 px-5 py-24 text-center sm:px-8">
            <p className="text-sm font-medium">{title}</p>
            <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
            <Link href="/" className="mt-2 text-sm text-muted-foreground underline hover:text-foreground">
                ← Back to markets
            </Link>
        </div>
    );
}

function DetailSkeleton() {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-5 py-8 sm:px-8">
            <div className="h-40 animate-pulse rounded-2xl bg-card" />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_384px]">
                <div className="flex animate-pulse flex-col gap-5">
                    <div className="h-96 rounded-2xl bg-card" />
                    <div className="h-40 rounded-2xl bg-card" />
                </div>
                <div className="h-120 animate-pulse rounded-2xl bg-card" />
            </div>
        </div>
    );
}
