import React from "react";
import { Asset } from "../../types";
import FoundingBadge from "./FoundingBadge";

interface RemiScoreCardProps {
    score: number;
    asset: Asset;
    theme: "dark" | "light";
    isFounder?: boolean;
    failed?: boolean;
    onReset?: () => void;
}

/**
 * Color bands for confidence score:
 *   0–30  → RED
 *  31–45  → YELLOW
 *  46–55  → GRAY
 *  56–69  → YELLOW
 *  70–100 → GREEN
 */
const getStylesForScore = (value: number) => {
    // GREEN  (70-100)
    if (value >= 70)
        return {
            text: "text-[#00fea5]",
            bg: "from-emerald-400/30 to-emerald-900/20",
            borderColor: "rgba(0,254,165,0.4)",
            glow: "shadow-[0_0_80px_rgba(0,254,165,0.25)]",
            textGradient: "from-[#00c982] via-[#22c55e] to-white",
            lightTextGradient: "from-[#047857] via-[#059669] to-[#10b981]",
            lightBorderColor: "rgba(5,150,105,0.5)",
            badgeText: "text-[#00fea5]",
            lightBadgeText: "text-[#047857]",
            label: "High",
            subtitle: "High Probability Setup",
        };

    // YELLOW (56-69)
    if (value >= 56)
        return {
            text: "text-amber-400",
            bg: "from-amber-400/25 to-amber-900/15",
            borderColor: "rgba(251,191,36,0.35)",
            glow: "shadow-[0_0_60px_rgba(251,191,36,0.2)]",
            textGradient: "from-amber-300 via-amber-100 to-white",
            lightTextGradient: "from-amber-700 via-amber-600 to-amber-500",
            lightBorderColor: "rgba(180,83,9,0.5)",
            badgeText: "text-amber-200",
            lightBadgeText: "text-amber-700",
            label: "Moderate",
            subtitle: "Favorable Conditions",
        };

    // GRAY   (46-55)
    if (value >= 46)
        return {
            text: "text-slate-400",
            bg: "from-slate-400/20 to-slate-800/10",
            borderColor: "rgba(148,163,184,0.3)",
            glow: "shadow-[0_0_40px_rgba(148,163,184,0.12)]",
            textGradient: "from-slate-300 via-slate-200 to-white",
            lightTextGradient: "from-slate-600 via-slate-500 to-slate-400",
            lightBorderColor: "rgba(100,116,139,0.4)",
            badgeText: "text-slate-300",
            lightBadgeText: "text-slate-900",
            label: "Neutral",
            subtitle: "Inconclusive Signal",
        };

    // YELLOW (31-45)
    if (value >= 31)
        return {
            text: "text-amber-400",
            bg: "from-amber-400/25 to-amber-900/15",
            borderColor: "rgba(251,191,36,0.35)",
            glow: "shadow-[0_0_60px_rgba(251,191,36,0.2)]",
            textGradient: "from-amber-300 via-amber-100 to-white",
            lightTextGradient: "from-amber-700 via-amber-600 to-amber-500",
            lightBorderColor: "rgba(180,83,9,0.5)",
            badgeText: "text-amber-200",
            lightBadgeText: "text-amber-700",
            label: "Low",
            subtitle: "Caution Advised",
        };

    // RED    (0-30)
    return {
        text: "text-rose-500",
        bg: "from-rose-500/25 to-rose-900/15",
        borderColor: "rgba(244,63,94,0.4)",
        glow: "shadow-[0_0_60px_rgba(244,63,94,0.2)]",
        textGradient: "from-rose-400 via-rose-200 to-white",
        lightTextGradient: "from-rose-700 via-rose-600 to-rose-500",
        lightBorderColor: "rgba(190,18,60,0.5)",
        badgeText: "text-rose-300",
        lightBadgeText: "text-rose-700",
        label: "Very Low",
        subtitle: "High Risk Environment",
    };
};

// Neutral gray styles used while the number is counting up
const neutralStyles = {
    bg: "from-slate-400/15 to-slate-800/10",
    textGradient: "from-slate-400 via-slate-300 to-white",
    lightTextGradient: "from-slate-500 via-slate-400 to-slate-300",
};

const RemiScoreCard: React.FC<RemiScoreCardProps> = ({
    score,
    asset,
    theme,
    isFounder = false,
    failed = false,
    onReset,
}) => {
    const isDark = theme === "dark";
    const [displayScore, setDisplayScore] = React.useState(0);
    const [isCountDone, setIsCountDone] = React.useState(false);
    const [showBadgeContent, setShowBadgeContent] = React.useState(false);

    React.useEffect(() => {
        let start = 0;
        const end = score;
        if (start === end) {
            setDisplayScore(end);
            setIsCountDone(true);
            // Delay badge content reveal for smooth animation
            setTimeout(() => setShowBadgeContent(true), 400);
            return;
        }

        const duration = 2000;
        const startTime = Date.now();

        const animate = () => {
            const now = Date.now();
            const time = Math.min(1, (now - startTime) / duration);
            const easeOut = 1 - Math.pow(1 - time, 3);

            const value = Math.floor(easeOut * (end - start) + start);
            setDisplayScore(value);

            if (time < 1) {
                requestAnimationFrame(animate);
            } else {
                setDisplayScore(end);
                setIsCountDone(true);
                // Delay badge content reveal so color blooms first
                setTimeout(() => setShowBadgeContent(true), 400);
            }
        };

        requestAnimationFrame(animate);
    }, [score]);

    // --- FINAL styles: used everywhere once count is done ---
    const finalStyles = getStylesForScore(score);

    // --- Active styles: neutral during count, final color when done ---
    const activeTextGradient = isCountDone
        ? (isDark ? finalStyles.textGradient : finalStyles.lightTextGradient)
        : (isDark ? neutralStyles.textGradient : neutralStyles.lightTextGradient);
    const activeBg = isCountDone ? finalStyles.bg : neutralStyles.bg;

    const getCoinImage = (symbol: string) => {
        const images: Record<string, string> = {
            BTC: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
            ETH: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
            SOL: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
            PEPE: "https://assets.coingecko.com/coins/images/29850/large/pepe-token.jpeg",
        };
        return images[symbol] || images["BTC"];
    };

    return (
        /* Container max-width: narrow on mobile, wide on desktop */
        <div className="w-full max-w-[480px] md:max-w-5xl mx-auto relative select-none flex items-center justify-center">
            {/* 
        The Card component wrapper 
      */}
            <div className="relative w-full z-10">
                {/* Outer Glow — uses FINAL color, fades in when count is done */}
                <div
                    className={`absolute -inset-[1px] rounded-[2rem] blur-sm flex-shrink-0 transition-opacity duration-1000 ${isCountDone ? (isDark ? "opacity-60" : "opacity-40") : "opacity-0"}`}
                    style={{
                        background: `linear-gradient(135deg, ${isDark ? finalStyles.borderColor : finalStyles.lightBorderColor}, transparent 40%, transparent 60%, ${isDark ? finalStyles.borderColor : finalStyles.lightBorderColor})`,
                    }}
                ></div>

                {/* Edge border — uses FINAL color, fades in when count is done */}
                <div
                    className={`absolute -inset-[1px] rounded-[2rem] flex-shrink-0 transition-opacity duration-1000 ${isCountDone ? "opacity-100" : "opacity-20"}`}
                    style={{
                        background: isDark
                            ? `linear-gradient(135deg, ${finalStyles.borderColor}, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0.04) 70%, ${finalStyles.borderColor})`
                            : `linear-gradient(135deg, ${finalStyles.lightBorderColor}, rgba(0,0,0,0.06) 30%, rgba(0,0,0,0.04) 70%, ${finalStyles.lightBorderColor})`,
                    }}
                ></div>

                {/* Main Card — glow uses FINAL styles, transitions when done */}
                <div
                    className={`relative w-full rounded-[2rem] overflow-hidden transition-shadow duration-1000 ${isDark ? "bg-[#0a0a0f]" : "bg-gradient-to-br from-slate-50 to-slate-100"} ${isCountDone ? finalStyles.glow : ""}`}
                >
                    {/* Background Effects */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        <div
                            className={`absolute top-[30%] left-1/2 md:left-[60%] -translate-x-1/2 w-[400px] h-[400px] md:w-[500px] md:h-[500px] rounded-full bg-gradient-to-b ${activeBg} blur-[120px] opacity-40 mix-blend-screen transition-all duration-700`}
                        ></div>
                        <div
                            className="absolute inset-0 opacity-[0.03]"
                            style={{
                                backgroundImage:
                                    'url("https://grainy-gradients.vercel.app/noise.svg")',
                            }}
                        ></div>
                        <div
                            className="absolute inset-0 opacity-[0.015]"
                            style={{
                                backgroundSize: "100% 4px",
                                backgroundImage:
                                    "linear-gradient(to bottom, transparent 50%, #000 50%)",
                            }}
                        ></div>
                    </div>

                    {/* ═══ MOBILE: single centered column ═══ */}
                    <div className="md:hidden relative z-10 flex flex-col items-center px-8 pt-5 pb-4 gap-2">
                        {/* Branding */}
                        <div className="flex flex-col items-center gap-0 -mt-3 mb-2">
                            <img
                                src="assets/landing/logos/remi-text-logo.png"
                                alt="REMi"
                                className={`h-14 object-contain ${isDark ? "brightness-0 invert" : "brightness-0"}`}
                            />
                            <span
                                className={`text-[10px] font-display font-bold uppercase tracking-[0.25em] -mt-2 ${isDark ? "text-white/40" : "text-slate-900"}`}
                            >
                                Confidence Score
                            </span>
                        </div>

                        {failed ? (
                            /* ── Failed state ── */
                            <div className="flex flex-col items-center gap-3 py-6">
                                <img
                                    src="assets/dashboard/characters/remi_uhoh.png"
                                    alt="REMi couldn't find data"
                                    className="w-28 h-28 object-contain"
                                />
                                <h2
                                    className={`text-2xl font-display font-bold ${isDark ? "text-white" : "text-slate-900"}`}
                                >
                                    Oops...
                                </h2>
                                <p
                                    className={`text-sm text-center max-w-[260px] leading-relaxed ${isDark ? "text-white/50" : "text-slate-500"}`}
                                >
                                    I couldn't find data for <span className="font-semibold">{asset.symbol}</span>. Try a different symbol or check back later.
                                </p>
                                {onReset && (
                                    <button
                                        onClick={onReset}
                                        className={`mt-3 px-5 py-2 rounded-xl border text-sm font-medium transition-all ${isDark ? "text-white/60 border-white/10 hover:bg-white/5 hover:text-white" : "text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"}`}
                                    >
                                        Analyze Another
                                    </button>
                                )}
                            </div>
                        ) : (
                            /* ── Normal score state ── */
                            <>
                                {/* Asset */}
                                <div className="flex flex-col items-center gap-2">
                                    <div className="relative">
                                        <div
                                            className={`absolute -inset-2 rounded-full bg-gradient-to-b ${activeBg} blur-md transition-all duration-700 ${isCountDone ? "opacity-80" : "opacity-30"}`}
                                        ></div>
                                        <img
                                            src={getCoinImage(asset.symbol)}
                                            alt={asset.symbol}
                                            className="relative w-16 h-16 rounded-full shadow-2xl"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = getCoinImage("BTC");
                                            }}
                                        />
                                    </div>
                                    <h2
                                        className={`text-xl font-display font-bold ${isDark ? "text-white" : "text-slate-900"}`}
                                    >
                                        {asset.name}
                                    </h2>
                                    <span
                                        className={`text-xs font-mono opacity-40 ${isDark ? "text-white" : "text-slate-600"}`}
                                    >
                                        {asset.symbol} · {asset.price}
                                    </span>
                                </div>

                                {/* Score — neutral gray during count, final color blooms in */}
                                <div className="relative flex justify-center -my-6">
                                    <div
                                        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[250px] bg-gradient-to-r ${activeBg} blur-[80px] rounded-full transition-all duration-700 ${isCountDone ? "opacity-70" : "opacity-30"}`}
                                    ></div>
                                    <div className="relative inline-flex z-10">
                                        <div
                                            className={`text-[9rem] leading-none font-display font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b ${activeTextGradient} drop-shadow-2xl transition-all duration-700`}
                                        >
                                            {displayScore}
                                        </div>
                                        <div
                                            className={`absolute bottom-[1.25rem] -right-[3.5rem] text-2xl font-bold transition-opacity duration-1000 ${isCountDone ? "opacity-100" : "opacity-0"} ${isDark ? "text-white/20" : "text-slate-900/20"}`}
                                        >
                                            /100
                                        </div>
                                    </div>
                                </div>

                                {/* Badge — clear glass tile */}
                                <div
                                    className={`w-full max-w-[320px] px-8 py-2.5 rounded-full border flex flex-col items-center gap-0.5 overflow-hidden relative backdrop-blur-xl z-10 transition-all duration-1000 ${isCountDone ? (isDark ? finalStyles.glow : "") : ""}`}
                                    style={{
                                        borderColor: isCountDone
                                            ? (isDark ? finalStyles.borderColor : finalStyles.lightBorderColor)
                                            : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"),
                                        background: isDark
                                            ? "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)"
                                            : "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)",
                                        boxShadow: isDark
                                            ? "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.2), 0 4px 24px rgba(0,0,0,0.3)"
                                            : "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.03), 0 2px 12px rgba(0,0,0,0.06)",
                                    }}
                                >
                                    {/* Badge content: crossfade — fixed height prevents layout shift */}
                                    <div className="relative z-10 w-full" style={{ minHeight: "2.75rem" }}>
                                        {/* Analyzing state */}
                                        <div
                                            className={`absolute inset-0 flex flex-col items-center justify-center gap-2 transition-all duration-500 ${showBadgeContent ? "opacity-0 scale-95 blur-sm" : "opacity-100 scale-100 blur-0"}`}
                                        >
                                            <div
                                                className={`h-3 w-36 rounded-full ${isDark ? "bg-white/10" : "bg-slate-200"} overflow-hidden`}
                                            >
                                                <div
                                                    className="h-full w-full rounded-full"
                                                    style={{
                                                        background: isDark
                                                            ? "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0) 100%)"
                                                            : "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.06) 50%, rgba(0,0,0,0) 100%)",
                                                        backgroundSize: "200% 100%",
                                                        animation: "skeletonShimmer 1.5s ease-in-out infinite",
                                                    }}
                                                />
                                            </div>
                                            <div
                                                className={`h-2.5 w-24 rounded-full ${isDark ? "bg-white/10" : "bg-slate-200"} overflow-hidden`}
                                            >
                                                <div
                                                    className="h-full w-full rounded-full"
                                                    style={{
                                                        background: isDark
                                                            ? "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0) 100%)"
                                                            : "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.06) 50%, rgba(0,0,0,0) 100%)",
                                                        backgroundSize: "200% 100%",
                                                        animation: "skeletonShimmer 1.5s ease-in-out infinite 0.2s",
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        {/* Final state — slides up + unblurs */}
                                        <div
                                            className={`absolute inset-0 flex flex-col items-center justify-center gap-0.5 transition-all duration-700 ease-out ${showBadgeContent ? "opacity-100 translate-y-0 blur-0 scale-100" : "opacity-0 translate-y-3 blur-sm scale-95"}`}
                                            style={{ transitionDelay: showBadgeContent ? "100ms" : "0ms" }}
                                        >
                                            <span
                                                className={`text-base font-bold uppercase tracking-[0.2em] ${isDark ? "text-white" : "text-slate-800"}`}
                                            >
                                                Confidence: {finalStyles.label}
                                            </span>
                                            <span
                                                className={`text-xs font-medium italic tracking-wide ${isDark ? finalStyles.badgeText : finalStyles.lightBadgeText}`}
                                            >
                                                {finalStyles.subtitle}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {isFounder && (
                            <div className="flex justify-center z-10 mt-1">
                                <FoundingBadge variant="pill" theme={theme} />
                            </div>
                        )}

                        <p
                            className={`text-[7px] text-center max-w-xs opacity-30 leading-relaxed mt-1 z-10 ${isDark ? "text-white" : "text-slate-600"}`}
                        >
                            REMi is an algorithmic market analysis tool designed for
                            informational purposes only. It does not constitute investment
                            advice or a recommendation to buy or sell any asset.
                        </p>
                    </div>

                    {/* ═══ DESKTOP: 1 column centered + absolute top-left asset ═══ */}
                    <div className="hidden md:flex relative z-10 w-full flex-col px-12 lg:px-20 pt-10 pb-6 min-h-[420px]">

                        {failed ? (
                            /* ── Failed state (desktop) ── */
                            <div className="flex-1 flex flex-col items-center justify-center w-full z-10 relative">
                                <div className="flex flex-col items-center gap-0 mb-4 lg:mb-6">
                                    <img
                                        src="assets/landing/logos/remi-text-logo.png"
                                        alt="REMi"
                                        className={`h-14 lg:h-16 object-contain ${isDark ? "brightness-0 invert" : "brightness-0"}`}
                                    />
                                    <span
                                        className={`text-[10px] lg:text-[11px] font-display font-bold uppercase tracking-[0.25em] -mt-2 lg:-mt-3 ${isDark ? "text-white/40" : "text-slate-900"}`}
                                    >
                                        Confidence Score
                                    </span>
                                </div>
                                <img
                                    src="assets/dashboard/characters/remi_uhoh.png"
                                    alt="REMi couldn't find data"
                                    className="w-36 h-36 lg:w-44 lg:h-44 object-contain"
                                />
                                <h2
                                    className={`text-3xl lg:text-4xl font-display font-bold mt-4 ${isDark ? "text-white" : "text-slate-900"}`}
                                >
                                    Oops...
                                </h2>
                                <p
                                    className={`text-base text-center max-w-sm leading-relaxed mt-2 ${isDark ? "text-white/50" : "text-slate-500"}`}
                                >
                                    I couldn't find data for <span className="font-semibold">{asset.symbol}</span>. Try a different symbol or check back later.
                                </p>
                                {onReset && (
                                    <button
                                        onClick={onReset}
                                        className={`mt-4 px-6 py-2.5 rounded-xl border text-sm font-medium transition-all ${isDark ? "text-white/60 border-white/10 hover:bg-white/5 hover:text-white" : "text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"}`}
                                    >
                                        Analyze Another
                                    </button>
                                )}
                            </div>
                        ) : (
                            <>
                                {/* ABSOLUTE TOP LEFT: Asset Identity */}
                                <div className="absolute top-8 left-10 lg:top-10 lg:left-12 flex items-center gap-3 lg:gap-4 z-20">
                                    <div className="relative flex-shrink-0">
                                        <div
                                            className={`absolute -inset-1 rounded-full bg-gradient-to-b ${activeBg} blur-sm transition-all duration-700 ${isCountDone ? "opacity-80" : "opacity-30"}`}
                                        ></div>
                                        <img
                                            src={getCoinImage(asset.symbol)}
                                            alt={asset.symbol}
                                            className="relative w-14 h-14 lg:w-16 lg:h-16 rounded-full shadow-xl"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = getCoinImage("BTC");
                                            }}
                                        />
                                    </div>
                                    <div className="flex flex-col justify-center">
                                        <div className="flex items-baseline gap-2">
                                            <h2
                                                className={`text-2xl lg:text-3xl font-display font-bold tracking-tight leading-none ${isDark ? "text-white" : "text-slate-900"}`}
                                            >
                                                {asset.symbol}
                                            </h2>
                                            <span
                                                className={`text-sm font-medium tracking-wide ${isDark ? "text-white/70" : "text-slate-700"}`}
                                            >
                                                {asset.name}
                                            </span>
                                        </div>
                                        <span
                                            className={`text-xs lg:text-sm font-mono opacity-60 mt-0.5 ${isDark ? "text-white" : "text-slate-600"}`}
                                        >
                                            {asset.price}
                                        </span>
                                    </div>
                                </div>

                                {/* CENTERED COLUMN: Branding -> Score -> Tile */}
                                <div className="flex-1 flex flex-col items-center justify-center w-full z-10 relative">
                                    {/* Branding */}
                                    <div className="flex flex-col items-center gap-0 mb-4 lg:mb-6">
                                        <img
                                            src="assets/landing/logos/remi-text-logo.png"
                                            alt="REMi"
                                            className={`h-14 lg:h-16 object-contain ${isDark ? "brightness-0 invert" : "brightness-0"}`}
                                        />
                                        <span
                                            className={`text-[10px] lg:text-[11px] font-display font-bold uppercase tracking-[0.25em] -mt-2 lg:-mt-3 ${isDark ? "text-white/40" : "text-slate-900"}`}
                                        >
                                            Confidence Score
                                        </span>
                                    </div>

                                    {/* Score — neutral gray during count, final color blooms in */}
                                    <div className="relative flex justify-center -mt-6">
                                        <div
                                            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] lg:w-[420px] lg:h-[420px] bg-gradient-to-r ${activeBg} blur-[100px] rounded-full transition-all duration-700 ${isCountDone ? (isDark ? "opacity-60" : "opacity-100") : (isDark ? "opacity-20" : "opacity-40")}`}
                                        ></div>
                                        <div className="relative inline-flex z-10">
                                            <div
                                                className={`text-[12rem] lg:text-[16rem] leading-none font-display font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b ${activeTextGradient} drop-shadow-2xl transition-all duration-700`}
                                            >
                                                {displayScore}
                                            </div>
                                            <div
                                                className={`absolute bottom-[1.5rem] lg:bottom-[2rem] -right-[4rem] lg:-right-[5rem] text-3xl lg:text-4xl font-bold transition-opacity duration-1000 ${isCountDone ? "opacity-100" : "opacity-0"} ${isDark ? "text-white/20" : "text-slate-900/20"}`}
                                            >
                                                /100
                                            </div>
                                        </div>
                                    </div>

                                    {/* Badge — clear glass tile */}
                                    <div
                                        className={`w-full max-w-[420px] px-10 py-4 mt-2 lg:mt-4 rounded-full border flex flex-col items-center gap-1 overflow-hidden relative backdrop-blur-xl z-10 transition-all duration-1000 ${isCountDone ? (isDark ? finalStyles.glow : "") : ""}`}
                                        style={{
                                            borderColor: isCountDone
                                                ? (isDark ? finalStyles.borderColor : finalStyles.lightBorderColor)
                                                : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"),
                                            background: isDark
                                                ? "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)"
                                                : "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)",
                                            boxShadow: isDark
                                                ? "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.2), 0 4px 24px rgba(0,0,0,0.3)"
                                                : "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.03), 0 2px 12px rgba(0,0,0,0.06)",
                                        }}
                                    >
                                        {/* Badge content: crossfade — fixed height prevents layout shift */}
                                        <div className="relative z-10 w-full" style={{ minHeight: "3.25rem" }}>
                                            {/* Analyzing state */}
                                            <div
                                                className={`absolute inset-0 flex flex-col items-center justify-center gap-2.5 transition-all duration-500 ${showBadgeContent ? "opacity-0 scale-95 blur-sm" : "opacity-100 scale-100 blur-0"}`}
                                            >
                                                <div
                                                    className={`h-4 w-48 rounded-full ${isDark ? "bg-white/10" : "bg-slate-200"} overflow-hidden`}
                                                >
                                                    <div
                                                        className="h-full w-full rounded-full"
                                                        style={{
                                                            background: isDark
                                                                ? "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0) 100%)"
                                                                : "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.06) 50%, rgba(0,0,0,0) 100%)",
                                                            backgroundSize: "200% 100%",
                                                            animation: "skeletonShimmer 1.5s ease-in-out infinite",
                                                        }}
                                                    />
                                                </div>
                                                <div
                                                    className={`h-3 w-32 rounded-full ${isDark ? "bg-white/10" : "bg-slate-200"} overflow-hidden`}
                                                >
                                                    <div
                                                        className="h-full w-full rounded-full"
                                                        style={{
                                                            background: isDark
                                                                ? "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0) 100%)"
                                                                : "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.06) 50%, rgba(0,0,0,0) 100%)",
                                                            backgroundSize: "200% 100%",
                                                            animation: "skeletonShimmer 1.5s ease-in-out infinite 0.2s",
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            {/* Final state — slides up + unblurs */}
                                            <div
                                                className={`absolute inset-0 flex flex-col items-center justify-center gap-1 transition-all duration-700 ease-out ${showBadgeContent ? "opacity-100 translate-y-0 blur-0 scale-100" : "opacity-0 translate-y-3 blur-sm scale-95"}`}
                                                style={{ transitionDelay: showBadgeContent ? "100ms" : "0ms" }}
                                            >
                                                <span
                                                    className={`text-xl font-bold uppercase tracking-[0.2em] ${isDark ? "text-white" : "text-slate-800"}`}
                                                >
                                                    Confidence: {finalStyles.label}
                                                </span>
                                                <span
                                                    className={`text-base font-bold italic tracking-wide ${isDark ? finalStyles.badgeText : finalStyles.lightBadgeText}`}
                                                >
                                                    {finalStyles.subtitle}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* FOOTER */}
                        <div className="w-full mt-6 pt-4 flex flex-col items-center justify-center gap-2 border-t border-white/5 relative z-10">
                            {isFounder && (
                                <FoundingBadge variant="pill" theme={theme} />
                            )}
                            <p
                                className={`text-[9px] max-w-lg text-center opacity-30 leading-relaxed ${isDark ? "text-white" : "text-slate-600"}`}
                            >
                                REMi is an algorithmic market analysis tool designed for
                                informational purposes only. It does not constitute investment
                                advice or a recommendation to buy or sell any asset.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RemiScoreCard;
