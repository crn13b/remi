import React, { useRef, useCallback, useState } from 'react';
import { Aggressiveness } from './types';
import { AGGRESSIVENESS_PRESETS, AGGRESSIVENESS_CONFIG, URGENCY_STYLES } from './constants';
import { Bell, Mail, AlertTriangle, Maximize } from 'lucide-react';

interface AggressivenessSliderProps {
    value: Aggressiveness;
    onChange: (value: Aggressiveness) => void;
    theme: 'dark' | 'light';
    showPreview?: boolean;
}

const STEPS: Aggressiveness[] = ['chill', 'default', 'aggressive', 'relentless'];
const TOTAL_SEGMENTS = 50;
const SEGMENT_GAP = 2; // px gap between segments
const SEGMENT_HEIGHT = 16; // compact bars

function getRatioFromX(trackEl: HTMLDivElement, clientX: number): number {
    const rect = trackEl.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

function stepFromRatio(ratio: number): number {
    return Math.round(ratio * (STEPS.length - 1));
}

// Color matches the current resolved step (same as the badge)
function getColorForStep(step: Aggressiveness, isDark: boolean): string {
    switch (step) {
        case 'chill': return 'rgb(59,130,246)';                          // blue
        case 'default': return isDark ? 'rgb(148,163,184)' : 'rgb(100,116,139)'; // gray — darker in light mode
        case 'aggressive': return 'rgb(249,115,22)';                     // orange
        case 'relentless': return 'rgb(239,68,68)';                      // red
    }
}

const AggressivenessSlider: React.FC<AggressivenessSliderProps> = ({
    value,
    onChange,
    theme,
    showPreview = true,
}) => {
    const currentPreset = AGGRESSIVENESS_PRESETS.find(p => p.value === value)!;
    const config = AGGRESSIVENESS_CONFIG[value];
    const trackRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);

    // Visual ratio is stored independently — never snaps
    const [visualRatio, setVisualRatio] = useState(() => STEPS.indexOf(value) / (STEPS.length - 1));

    // Sync visual ratio when value changes externally (e.g. tutorial demo)
    const prevValueRef = useRef(value);
    if (prevValueRef.current !== value && !dragging) {
        prevValueRef.current = value;
        setVisualRatio(STEPS.indexOf(value) / (STEPS.length - 1));
    }

    const isDark = theme === 'dark';

    const filledCount = Math.round(visualRatio * TOTAL_SEGMENTS);

    const activeColor = getColorForStep(value, isDark);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        if (!trackRef.current) return;
        trackRef.current.setPointerCapture(e.pointerId);
        const ratio = getRatioFromX(trackRef.current, e.clientX);
        setDragging(true);
        setVisualRatio(ratio);
        // Fire onChange for the nearest step immediately
        const idx = stepFromRatio(ratio);
        onChange(STEPS[idx]);
    }, [onChange]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragging || !trackRef.current) return;
        const ratio = getRatioFromX(trackRef.current, e.clientX);
        setVisualRatio(ratio);
        // Update the backend level as user drags through zones
        const idx = stepFromRatio(ratio);
        onChange(STEPS[idx]);
    }, [dragging, onChange]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!trackRef.current) return;
        trackRef.current.releasePointerCapture(e.pointerId);
        setDragging(false);
        // Visual ratio stays where user left it — no snap
    }, []);

    // Build segment array
    const segments = Array.from({ length: TOTAL_SEGMENTS }, (_, i) => {
        const isFilled = i < filledCount;
        // Unfilled segments fade out progressively
        const distanceFromFill = i - filledCount;
        const unfillOpacity = Math.max(0.08, 0.35 - distanceFromFill * 0.012);
        return { isFilled, unfillOpacity };
    });

    return (
        <div className="w-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-display font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-slate-900'}`}>
                        Intensity
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        value === 'relentless'
                            ? 'bg-red-500/20 text-red-400'
                            : value === 'aggressive'
                                ? 'bg-orange-500/20 text-orange-400'
                                : value === 'chill'
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : isDark ? 'bg-white/10 text-gray-400' : 'bg-slate-100 text-slate-900'
                    }`}>
                        {currentPreset.label}
                    </span>
                </div>
            </div>

            {/* Segmented Track */}
            <div
                ref={trackRef}
                className="relative h-7 flex items-center cursor-pointer select-none touch-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                <div className="flex items-center w-full" style={{ gap: `${SEGMENT_GAP}px` }}>
                    {segments.map((seg, i) => (
                        <div
                            key={i}
                            className="flex-1 rounded-sm"
                            style={{
                                height: SEGMENT_HEIGHT,
                                borderRadius: 2,
                                backgroundColor: seg.isFilled
                                    ? activeColor
                                    : isDark
                                        ? `rgba(255,255,255,${seg.unfillOpacity})`
                                        : `rgba(0,0,0,${seg.unfillOpacity})`,
                                transition: dragging ? 'none' : 'background-color 200ms ease-out',
                            }}
                        />
                    ))}
                </div>
            </div>

            {/* Labels aligned to track positions */}
            <div className="flex justify-between mt-0.5 mb-2">
                {['Chill', 'Default', 'Aggressive', 'Relentless'].map((label) => (
                    <span
                        key={label}
                        className={`text-[10px] font-medium ${
                            isDark ? 'text-gray-600' : 'text-slate-900'
                        }`}
                    >
                        {label}
                    </span>
                ))}
            </div>

            {/* Description — updates as user picks */}
            <p className={`text-[11px] leading-relaxed ${isDark ? 'text-gray-500' : 'text-slate-600'}`}>
                {currentPreset.description}
            </p>

            {/* Behavior Preview */}
            {showPreview && (
                <div className={`mt-5 rounded-2xl border p-5 ${
                    isDark ? 'bg-white/[0.02] border-[#27273a]' : 'bg-slate-50 border-slate-200'
                }`}>
                    <p className={`text-xs uppercase tracking-widest font-semibold mb-4 ${
                        isDark ? 'text-gray-500' : 'text-slate-900'
                    }`}>
                        What you'll receive
                    </p>
                    <div className="flex flex-col gap-3">
                        {(['warning', 'high', 'critical'] as const).map((urgency) => {
                            const behavior = config[urgency];
                            const style = URGENCY_STYLES[urgency];
                            return (
                                <div key={urgency} className="flex items-center gap-3">
                                    <span className={`text-xs font-bold uppercase tracking-wider w-20 ${
                                        isDark ? style.color : style.lightColor
                                    }`}>
                                        {style.label}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {(behavior.channel === 'in_app' || behavior.channel === 'both') && (
                                            <span className={`p-1.5 rounded-lg ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
                                                <Bell size={14} className={isDark ? 'text-gray-400' : 'text-slate-900'} />
                                            </span>
                                        )}
                                        {(behavior.channel === 'email' || behavior.channel === 'both') && (
                                            <span className={`p-1.5 rounded-lg ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
                                                <Mail size={14} className={isDark ? 'text-gray-400' : 'text-slate-900'} />
                                            </span>
                                        )}
                                        {behavior.persistent && (
                                            <span className={`p-1.5 rounded-lg ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                                                <AlertTriangle size={14} className={isDark ? 'text-amber-400' : 'text-amber-600'} />
                                            </span>
                                        )}
                                        {behavior.fullscreen_takeover && (
                                            <span className={`p-1.5 rounded-lg ${isDark ? 'bg-red-500/10' : 'bg-red-50'}`}>
                                                <Maximize size={14} className={isDark ? 'text-red-400' : 'text-red-600'} />
                                            </span>
                                        )}
                                    </div>
                                    {behavior.repeat && behavior.repeat_interval_min && (
                                        <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-slate-900'}`}>
                                            every {behavior.repeat_interval_min}min
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

        </div>
    );
};

export default AggressivenessSlider;
