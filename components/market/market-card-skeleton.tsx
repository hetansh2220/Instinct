export function MarketCardSkeleton() {
    return (
        <div className="flex animate-pulse flex-col gap-4 rounded-2xl border border-border bg-card p-4">
            {/* header */}
            <div className="flex items-start gap-3">
                <div className="size-11 shrink-0 rounded-full bg-muted" />
                <div className="flex flex-1 flex-col gap-2 pt-1">
                    <div className="h-2.5 w-16 rounded bg-muted" />
                    <div className="h-3.5 w-40 rounded bg-muted" />
                </div>
            </div>

            {/* outcome buttons */}
            <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="h-11 rounded-xl bg-muted" />
                ))}
            </div>

            {/* footer */}
            <div className="flex items-center justify-between">
                <div className="h-2.5 w-20 rounded bg-muted" />
                <div className="h-2.5 w-16 rounded bg-muted" />
            </div>
        </div>
    );
}
