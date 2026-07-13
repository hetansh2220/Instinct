/**
 * The concept: a slow orbit of nations behind the copy. The motion does the
 * dramatic work so the typography can stay quiet.
 */
const NATIONS = [
    "ma", "gb-eng", "br", "es", "ec", "ar",
    "de", "dz", "pt", "jp", "fr", "be",
];

export function Hero() {
    return (
        // -mt-16/pt-16 pulls the hero up behind the (in-flow, transparent) navbar, so the
        // pitch runs edge to edge instead of starting below a black strip.
        <section className="relative -mt-16 flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden px-5 pt-16">
            <Pitch />
            <FlagOrbit />


            {/* Grain: keeps a near-black background from banding, and gives the whole
                thing a bit of tooth. */}
            <div
                className="pointer-events-none absolute inset-0 opacity-15 mix-blend-overlay"
                style={{
                    backgroundImage:
                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                }}
            />

            <div className="relative z-10 flex max-w-2xl flex-col items-center gap-6 text-center">


                <h1
                    className="animate-in fade-in-0 slide-in-from-bottom-3 font-heading text-5xl leading-[0.95] font-bold tracking-tight text-balance duration-700 sm:text-6xl md:text-7xl"
                    style={{ animationDelay: "80ms", animationFillMode: "backwards" }}
                >
                    Predict live
                    <br />
                    <span className="text-[#FBBF24]">Beat the room.</span>
                </h1>

                <div
                    className="animate-in fade-in-0 slide-in-from-bottom-3 flex flex-col items-center gap-2 duration-700"
                    style={{ animationDelay: "160ms", animationFillMode: "backwards" }}
                >
                    <p className="text-base text-muted-foreground sm:text-lg">
                        Pick a winner, watch it live, climb the leaderboard
                    </p>
                    {/* The attribution is a credit, not part of the pitch — so it sits on
                        its own line, quieter, rather than trailing the sentence. */}
                    <p className=" text-base text-muted-foreground sm:text-lg ">
                        powered by TxODDS
                    </p>
                </div>

            </div>
        </section>
    );
}

/**
 * The backdrop is a football pitch, viewed from above: mown stripes, the halfway
 * line, the centre circle, the penalty boxes. Kept at the very edge of visibility —
 * you should feel it before you notice it. No stock imagery, no cliché ball icons;
 * the geometry alone says "football".
 */
function Pitch() {
    return (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {/* Floodlights: two cold pools washing in from above the stands. */}
            <div className="absolute inset-0 [background:radial-gradient(45%_35%_at_18%_-5%,color-mix(in_oklch,white_7%,transparent),transparent_70%),radial-gradient(45%_35%_at_82%_-5%,color-mix(in_oklch,white_7%,transparent),transparent_70%)]" />

            {/* Mown stripes — the giveaway detail of a televised pitch. */}
            <div className="absolute inset-0 opacity-3.5 [background:repeating-linear-gradient(90deg,white_0_7rem,transparent_7rem_14rem)]" />

            {/* Markings. preserveAspectRatio="none" lets the pitch stretch to the
                viewport the way a real one fills a broadcast frame. */}
            <svg
                viewBox="0 0 1200 700"
                preserveAspectRatio="none"
                className="absolute inset-0 size-full text-white/5.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
            >
                {/* touchlines */}
                <rect x="40" y="40" width="1120" height="620" rx="2" />
                {/* halfway line + centre circle + spot */}
                <line x1="600" y1="40" x2="600" y2="660" />
                <circle cx="600" cy="350" r="115" />
                <circle cx="600" cy="350" r="4" fill="currentColor" stroke="none" />
                {/* penalty areas */}
                <rect x="40" y="160" width="180" height="380" />
                <rect x="980" y="160" width="180" height="380" />
                {/* six-yard boxes */}
                <rect x="40" y="255" width="70" height="190" />
                <rect x="1090" y="255" width="70" height="190" />
                {/* penalty spots + D arcs */}
                <circle cx="160" cy="350" r="4" fill="currentColor" stroke="none" />
                <circle cx="1040" cy="350" r="4" fill="currentColor" stroke="none" />
                <path d="M220 285 A 80 80 0 0 1 220 415" />
                <path d="M980 285 A 80 80 0 0 0 980 415" />
                {/* corner arcs */}
                <path d="M40 62 A 22 22 0 0 0 62 40" />
                <path d="M1138 40 A 22 22 0 0 0 1160 62" />
                <path d="M40 638 A 22 22 0 0 1 62 660" />
                <path d="M1138 660 A 22 22 0 0 1 1160 638" />
            </svg>
        </div>
    );
}

/**
 * A ring of flags rotating once every couple of minutes — slow enough to read as
 * atmosphere rather than motion. Each flag counter-rotates at the same speed so it
 * stays upright while the ring turns beneath it.
 */
function FlagOrbit() {
    const RADIUS = 44; // % of the ring's half-width
    const SPIN = 150; // seconds per revolution — the ring and the flags MUST match

    return (
        <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[128vw] max-w-225 -translate-x-1/2 -translate-y-1/2 motion-reduce:animate-none"
            style={{ animation: `orbit-cw ${SPIN}s linear infinite` }}
        >
            {/* The track the nations run on. Makes the orbit read as an orbit rather
                than as flags scattered at random. */}
            <div
                className="absolute rounded-full border border-dashed border-white/6"
                style={{
                    inset: `${50 - RADIUS}%`,
                }}
            />

            {NATIONS.map((n, i) => {
                // Positioned with left/top, NOT a percentage translate: a translate %
                // resolves against the element's OWN box (which is auto-sized here), so
                // it would collapse every flag onto the centre.
                const angle = (i / NATIONS.length) * Math.PI * 2;
                const left = 50 + RADIUS * Math.cos(angle);
                const top = 50 + RADIUS * Math.sin(angle);

                return (
                    <div
                        key={n}
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{ left: `${left}%`, top: `${top}%` }}
                    >
                        {/* Counter-spin cancels the ring's rotation, so flags stay level. */}
                        <div
                            className="motion-reduce:animate-none"
                            style={{ animation: `orbit-ccw ${SPIN}s linear infinite` }}
                        >
                            {/* The BOX owns the size, not the image. Flags don't all share
                                an aspect ratio (England is 5:3, most are 3:2), so letting
                                the img size itself makes some render narrower than others.
                                Fixed box + object-cover = twelve identical rectangles. */}
                            <span
                                className="animate-in fade-in-0 zoom-in-95 block h-10 w-15 overflow-hidden rounded-lg ring-1 ring-white/25 duration-1000 sm:h-12 sm:w-18"
                                style={{
                                    animationDelay: `${i * 60}ms`,
                                    animationFillMode: "backwards",
                                }}
                            >
                                <img
                                    src={`https://flagcdn.com/w160/${n}.png`}
                                    alt=""
                                    className="size-full object-cover"
                                />
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
