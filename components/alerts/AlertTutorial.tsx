import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronRight, ChevronLeft, X, HelpCircle, Bell, TrendingUp, BellRing, Zap } from 'lucide-react';

interface TutorialStep {
    targetId: string;
    title: string;
    description: string;
    icon: React.ElementType;
    position: 'bottom' | 'top' | 'left' | 'right';
}

const TUTORIAL_STEPS: TutorialStep[] = [
    {
        targetId: 'alert-hero',
        title: 'Welcome to REMi Alerts',
        description: 'REMi continuously monitors your chosen assets and fires alerts the instant scores enter Warning, High, or Critical zones. No delays — you\'ll know before the crowd.',
        icon: Bell,
        position: 'bottom',
    },
    {
        targetId: 'alert-intensity',
        title: 'Set Your Intensity',
        description: 'Control how aggressively REMi notifies you. Chill mode keeps things quiet — Relentless mode will not let you miss a thing, with persistent banners and repeated alerts.',
        icon: Zap,
        position: 'bottom',
    },
    {
        targetId: 'alert-manage-list',
        title: 'Your Active Alerts',
        description: 'All your alerts live here. Toggle them on/off, edit thresholds, or delete ones you no longer need. Each alert shows a live score with urgency coloring.',
        icon: TrendingUp,
        position: 'bottom',
    },
    {
        targetId: 'alert-feed',
        title: 'Alert Feed',
        description: 'When scores cross into Warning, High, or Critical zones, events appear here in real-time. You\'ll see exactly what moved, by how much, and when.',
        icon: BellRing,
        position: 'top',
    },
    {
        targetId: 'alert-new-btn',
        title: 'Create Your First Alert',
        description: 'Pick any asset, choose a direction (bullish, bearish, or both), set your intensity, and REMi starts watching. Scores update every 60 seconds.',
        icon: Bell,
        position: 'bottom',
    },
];

// Transition phases for smooth step changes
type TransitionPhase = 'idle' | 'exiting' | 'moving' | 'entering';

// Timing constants (ms)
const FADE_OUT_MS = 250;
const SPOTLIGHT_MOVE_MS = 500;
const FADE_IN_MS = 300;

interface SpotlightPos {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface AlertTutorialProps {
    theme: 'dark' | 'light';
    isActive: boolean;
    onComplete: () => void;
    onSkip: () => void;
    onStepEnter?: (stepIndex: number, targetId: string) => void;
}

const AlertTutorial: React.FC<AlertTutorialProps> = ({ theme, isActive, onComplete, onSkip, onStepEnter }) => {
    const isDark = theme === 'dark';
    const [currentStep, setCurrentStep] = useState(0);
    const [phase, setPhase] = useState<TransitionPhase>('entering');
    const [spotlight, setSpotlight] = useState<SpotlightPos | null>(null);
    const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
    const rafRef = useRef<number>(0);
    const pendingStepRef = useRef<number | null>(null);

    const step = TUTORIAL_STEPS[currentStep];
    const isLast = currentStep === TUTORIAL_STEPS.length - 1;
    const isFirst = currentStep === 0;

    const PAD = 12;
    const RADIUS = 16;
    const TOOLTIP_W = 360;

    const getElementPos = useCallback((targetId: string): SpotlightPos | null => {
        const el = document.getElementById(targetId);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
            x: rect.left - PAD,
            y: rect.top - PAD,
            w: rect.width + PAD * 2,
            h: rect.height + PAD * 2,
        };
    }, []);

    const calcTooltipStyle = useCallback((pos: SpotlightPos | null, stepDef: TutorialStep): React.CSSProperties => {
        if (!pos) {
            return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: TOOLTIP_W };
        }

        const padding = 16;
        const style: React.CSSProperties = { position: 'fixed', width: TOOLTIP_W };
        // Element rect (without our PAD)
        const elTop = pos.y + PAD;
        const elBottom = pos.y + pos.h - PAD;
        const elCenterX = pos.x + pos.w / 2;

        switch (stepDef.position) {
            case 'bottom':
                style.top = elBottom + PAD + padding;
                style.left = Math.max(padding, Math.min(elCenterX - TOOLTIP_W / 2, window.innerWidth - TOOLTIP_W - padding));
                break;
            case 'top':
                style.bottom = window.innerHeight - elTop + PAD + padding;
                style.left = Math.max(padding, Math.min(elCenterX - TOOLTIP_W / 2, window.innerWidth - TOOLTIP_W - padding));
                break;
            case 'left':
                style.top = elTop + (elBottom - elTop) / 2 - 60;
                style.right = window.innerWidth - (pos.x + PAD) + padding;
                break;
            case 'right':
                style.top = elTop + (elBottom - elTop) / 2 - 60;
                style.left = pos.x + pos.w - PAD + padding;
                break;
        }

        return style;
    }, []);

    // Initial mount + resize/scroll tracking
    const updatePositions = useCallback(() => {
        if (!isActive || !step) return;
        const pos = getElementPos(step.targetId);
        setSpotlight(pos);
        setTooltipStyle(calcTooltipStyle(pos, step));
    }, [isActive, step, getElementPos, calcTooltipStyle]);

    // On step change (or initial mount), scroll into view then position
    useEffect(() => {
        if (!isActive || !step) return;

        const el = document.getElementById(step.targetId);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Wait for scroll, then update positions
            const timer = setTimeout(() => {
                updatePositions();
                // If we're in 'moving' phase, transition to 'entering'
                if (pendingStepRef.current !== null) {
                    pendingStepRef.current = null;
                    setPhase('entering');
                    // After fade-in completes, go idle
                    setTimeout(() => setPhase('idle'), FADE_IN_MS);
                }
            }, SPOTLIGHT_MOVE_MS);
            // Also do an immediate update so the spotlight starts animating toward the target
            updatePositions();
            return () => clearTimeout(timer);
        } else {
            updatePositions();
            if (pendingStepRef.current !== null) {
                pendingStepRef.current = null;
                setPhase('entering');
                setTimeout(() => setPhase('idle'), FADE_IN_MS);
            }
        }
    }, [isActive, currentStep, step, updatePositions]);

    // First render: fade in, then notify parent
    useEffect(() => {
        if (isActive && phase === 'entering') {
            const timer = setTimeout(() => {
                setPhase('idle');
                onStepEnter?.(currentStep, step?.targetId ?? '');
            }, FADE_IN_MS);
            return () => clearTimeout(timer);
        }
    }, [isActive, phase, currentStep, step, onStepEnter]);

    // Resize/scroll listener
    useEffect(() => {
        if (!isActive) return;

        const handle = () => {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(updatePositions);
        };

        window.addEventListener('resize', handle);
        window.addEventListener('scroll', handle, true);
        return () => {
            window.removeEventListener('resize', handle);
            window.removeEventListener('scroll', handle, true);
            cancelAnimationFrame(rafRef.current);
        };
    }, [isActive, updatePositions]);

    if (!isActive || !step) return null;

    // Transition to a new step with animation sequence
    const transitionToStep = (nextStep: number) => {
        if (phase !== 'idle') return; // prevent double-clicks during transition

        // Phase 1: Fade out tooltip
        setPhase('exiting');
        pendingStepRef.current = nextStep;

        setTimeout(() => {
            // Phase 2: Change step (spotlight will CSS-transition to new position)
            setCurrentStep(nextStep);
            setPhase('moving');
            // Phase 3 ('entering') is triggered by the useEffect above after scroll settles
        }, FADE_OUT_MS);
    };

    const handleNext = () => {
        if (isLast) {
            setPhase('exiting');
            setTimeout(onComplete, FADE_OUT_MS);
        } else {
            transitionToStep(currentStep + 1);
        }
    };

    const handlePrev = () => {
        if (!isFirst) {
            transitionToStep(currentStep - 1);
        }
    };

    const handleSkip = () => {
        setPhase('exiting');
        setTimeout(onSkip, FADE_OUT_MS);
    };

    const StepIcon = step.icon;

    // Tooltip opacity based on phase
    const tooltipOpacity = phase === 'exiting' || phase === 'moving' ? 0 : 1;
    const tooltipTranslateY = phase === 'entering' ? 0 : phase === 'exiting' ? -8 : 0;

    // Spotlight border opacity — leads the transition (fades out first, fades in last)
    const borderOpacity = phase === 'exiting' ? 0 : phase === 'moving' ? 0.3 : 1;

    return (
        <>
            {/* SVG Overlay with animated spotlight cutout */}
            <svg
                className="fixed inset-0 z-[9998] w-full h-full"
                style={{ pointerEvents: 'auto' }}
                onClick={(e) => e.stopPropagation()}
            >
                <defs>
                    <mask id="spotlight-mask">
                        <rect x="0" y="0" width="100%" height="100%" fill="white" />
                        {spotlight && (
                            <rect
                                x={spotlight.x}
                                y={spotlight.y}
                                width={spotlight.w}
                                height={spotlight.h}
                                rx={RADIUS}
                                ry={RADIUS}
                                fill="black"
                                style={{
                                    transition: `x ${SPOTLIGHT_MOVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), y ${SPOTLIGHT_MOVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), width ${SPOTLIGHT_MOVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), height ${SPOTLIGHT_MOVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
                                }}
                            />
                        )}
                    </mask>
                </defs>
                {/* Dark overlay with cutout */}
                <rect
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                    fill="rgba(0,0,0,0.75)"
                    mask="url(#spotlight-mask)"
                    style={{ transition: `opacity ${FADE_OUT_MS}ms ease` }}
                />
                {/* Animated highlight border */}
                {spotlight && (
                    <rect
                        x={spotlight.x}
                        y={spotlight.y}
                        width={spotlight.w}
                        height={spotlight.h}
                        rx={RADIUS}
                        ry={RADIUS}
                        fill="none"
                        stroke={isDark ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.4)'}
                        strokeWidth="2"
                        style={{
                            opacity: borderOpacity,
                            transition: `x ${SPOTLIGHT_MOVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), y ${SPOTLIGHT_MOVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), width ${SPOTLIGHT_MOVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), height ${SPOTLIGHT_MOVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${FADE_OUT_MS}ms ease`,
                        }}
                    />
                )}
            </svg>

            {/* Tooltip with fade/slide transitions */}
            <div
                className={`z-[9999] rounded-[1.5rem] border p-6 shadow-2xl ${
                    isDark ? 'bg-[#141420] border-[#27273a] shadow-[0_0_40px_rgba(59,130,246,0.1)]' : 'bg-white border-slate-200'
                }`}
                style={{
                    ...tooltipStyle,
                    opacity: tooltipOpacity,
                    transform: `translateY(${tooltipTranslateY}px)`,
                    transition: `opacity ${phase === 'entering' ? FADE_IN_MS : FADE_OUT_MS}ms ease, transform ${phase === 'entering' ? FADE_IN_MS : FADE_OUT_MS}ms ease, top ${SPOTLIGHT_MOVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), bottom ${SPOTLIGHT_MOVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), left ${SPOTLIGHT_MOVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), right ${SPOTLIGHT_MOVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
                    pointerEvents: phase === 'idle' ? 'auto' : 'none',
                }}
            >
                {/* Step indicator + close */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                            isDark ? 'bg-blue-500/10' : 'bg-blue-50'
                        }`}>
                            <StepIcon size={18} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
                        </div>
                        <span className={`text-[10px] uppercase tracking-widest font-semibold ${
                            isDark ? 'text-gray-500' : 'text-slate-900'
                        }`}>
                            Step {currentStep + 1} of {TUTORIAL_STEPS.length}
                        </span>
                    </div>
                    <button
                        onClick={handleSkip}
                        className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                            isDark ? 'hover:bg-white/5 text-gray-500' : 'hover:bg-slate-100 text-slate-900'
                        }`}
                    >
                        <X size={12} />
                    </button>
                </div>

                {/* Content */}
                <h3 className={`text-base font-display font-bold mb-1.5 ${
                    isDark ? 'text-white' : 'text-slate-900'
                }`}>
                    {step.title}
                </h3>
                <p className={`text-xs leading-relaxed mb-4 ${
                    isDark ? 'text-gray-400' : 'text-slate-900'
                }`}>
                    {step.description}
                </p>

                {/* Progress dots + nav */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        {TUTORIAL_STEPS.map((_, i) => (
                            <div
                                key={i}
                                className={`h-1.5 rounded-full transition-all duration-300 ${
                                    i === currentStep
                                        ? 'w-5 bg-blue-500'
                                        : i < currentStep
                                            ? `w-1.5 ${isDark ? 'bg-blue-500/40' : 'bg-blue-300'}`
                                            : `w-1.5 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`
                                }`}
                            />
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        {!isFirst && (
                            <button
                                onClick={handlePrev}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                    isDark ? 'text-gray-400 hover:bg-white/5' : 'text-slate-900 hover:bg-slate-100'
                                }`}
                            >
                                <ChevronLeft size={12} />
                                Back
                            </button>
                        )}
                        <button
                            onClick={handleNext}
                            className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-all cursor-pointer shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                        >
                            {isLast ? 'Got it!' : 'Next'}
                            {!isLast && <ChevronRight size={12} />}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default AlertTutorial;

// Restart button component (floating, bottom-right)
export const TutorialRestartButton: React.FC<{
    theme: 'dark' | 'light';
    onClick: () => void;
}> = ({ theme, onClick }) => {
    const isDark = theme === 'dark';

    return (
        <button
            onClick={onClick}
            className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-lg hover:scale-105 ${
                isDark
                    ? 'bg-[#141420] border-[#27273a] text-gray-400 hover:text-white hover:border-blue-500/30'
                    : 'bg-white border-slate-200 text-slate-900 hover:text-slate-900 hover:border-blue-300 shadow-slate-200/50'
            }`}
            title="Restart tutorial"
        >
            <HelpCircle size={14} />
            Tutorial
        </button>
    );
};
