import React, { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';

interface AlertHeroProps {
    theme: 'dark' | 'light';
}

/* ── Score color helpers ── */
function getScoreColor(score: number): string {
    if (score >= 70) return '#10b981'; // emerald
    if (score >= 56) return '#f59e0b'; // amber
    if (score >= 46) return '#94a3b8'; // slate
    if (score >= 31) return '#f59e0b'; // amber
    return '#ef4444'; // red
}

function getScoreGlow(score: number): string {
    const c = getScoreColor(score);
    return `0 0 30px ${c}40`;
}

function shouldShowBell(score: number): boolean {
    return score < 30 || score > 70;
}

/* ── Rolling counter hook ── */
function useRollingCounter(target: number, duration = 600) {
    const [display, setDisplay] = useState(target);
    const rafRef = useRef<number>(0);

    useEffect(() => {
        const start = display;
        const diff = target - start;
        if (diff === 0) return;
        const startTime = performance.now();

        const step = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(start + diff * eased));
            if (progress < 1) rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(rafRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target, duration]);

    return display;
}

/* ── Main component ── */
const AlertHero: React.FC<AlertHeroProps> = ({ theme }) => {
    const isDark = theme === 'dark';

    // Cycling score target — click to toggle
    const [targetScore, setTargetScore] = useState(72);
    const [animating, setAnimating] = useState(true);
    const [pressed, setPressed] = useState(false);
    useEffect(() => {
        if (!animating) return;
        const id = setInterval(() => {
            setTargetScore(Math.floor(Math.random() * 101));
        }, 2000);
        return () => clearInterval(id);
    }, [animating]);

    const displayScore = useRollingCounter(targetScore);
    const scoreColor = getScoreColor(displayScore);
    const bellVisible = shouldShowBell(displayScore);
    const bellColor = displayScore > 70 ? '#10b981' : '#ef4444';


    return (
        <div id="alert-hero" className="animate-fade-in-up flex flex-col items-center gap-4 py-2">
            {/* ── Score Circle ── */}
            <div
                onClick={() => {
                    setAnimating(prev => !prev);
                    setPressed(true);
                    setTimeout(() => setPressed(false), 300);
                }}
                className="relative w-[70px] h-[70px] rounded-full flex items-center justify-center cursor-pointer"
                style={{
                    border: `2px solid ${scoreColor}50`,
                    boxShadow: getScoreGlow(displayScore),
                    background: isDark ? '#0a0a14' : '#ffffff',
                    transform: pressed ? 'scale(0.9)' : 'scale(1)',
                    transition: pressed ? 'transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.5s, box-shadow 0.5s',
                }}
            >
                <span
                    className="font-display font-bold text-[22px] leading-none transition-colors duration-300"
                    style={{ color: scoreColor }}
                >
                    {displayScore}
                </span>

                {/* Bell badge */}
                <div
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300"
                    style={{
                        background: bellColor,
                        boxShadow: `0 0 10px ${bellColor}80`,
                        opacity: bellVisible ? 1 : 0,
                        transform: bellVisible ? 'scale(1)' : 'scale(0.5)',
                    }}
                >
                    <Bell size={10} className="text-white" />
                </div>
            </div>

            {/* ── Floating text ── */}
            <div className="text-center">
                <h2 className={`text-2xl font-display font-bold tracking-tight ${
                    isDark ? 'text-white' : 'text-slate-900'
                }`}>
                    Never Miss What Matters
                </h2>
                <p className={`text-[11px] mt-1 whitespace-nowrap overflow-hidden text-ellipsis md:whitespace-normal ${
                    isDark ? 'text-gray-500' : 'text-slate-500'
                }`}>
                    Alerts trigger only when REMi's Confidence Scores are below 30 or above 70.
                </p>
            </div>
        </div>
    );
};

export default AlertHero;
