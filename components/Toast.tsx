import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastAction {
    label: string;
    href?: string;
    onClick?: () => void;
}

export interface ToastInput {
    message: string;
    type?: ToastType;
    duration?: number;
    action?: ToastAction;
}

interface ToastItem extends Required<Pick<ToastInput, 'message'>> {
    id: number;
    type: ToastType;
    duration: number;
    action?: ToastAction;
}

// ─── Singleton store — allows showToast() to be called from anywhere ───
type Listener = (toasts: ToastItem[]) => void;
const listeners = new Set<Listener>();
let currentToasts: ToastItem[] = [];

const setToasts = (updater: (prev: ToastItem[]) => ToastItem[]) => {
    currentToasts = updater(currentToasts);
    listeners.forEach((l) => l(currentToasts));
};

export const showToast = (input: ToastInput | string): void => {
    const normalized: ToastInput = typeof input === 'string' ? { message: input } : input;
    const item: ToastItem = {
        id: Date.now() + Math.random(),
        message: normalized.message,
        type: normalized.type ?? 'info',
        duration: normalized.duration ?? 30000,
        action: normalized.action,
    };
    setToasts((prev) => [...prev, item]);
};

const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
};

// ─── Viewport component — renders active toasts, subscribes to store ───
export const ToastViewport: React.FC<{ theme: 'dark' | 'light' }> = ({ theme }) => {
    const [toasts, setLocal] = useState<ToastItem[]>(currentToasts);

    useEffect(() => {
        const listener: Listener = (next) => setLocal(next);
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }, []);

    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-3rem)] w-[380px]">
            {toasts.map((t) => (
                <ToastCard key={t.id} toast={t} onDismiss={dismissToast} theme={theme} />
            ))}
        </div>
    );
};

const ICON_MAP: Record<ToastType, typeof CheckCircle2> = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
};

const ToastCard: React.FC<{ toast: ToastItem; onDismiss: (id: number) => void; theme: 'dark' | 'light' }> = ({ toast, onDismiss, theme }) => {
    const [visible, setVisible] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const isDark = theme === 'dark';

    useEffect(() => {
        const enter = requestAnimationFrame(() => setVisible(true));
        const timer = window.setTimeout(() => {
            setLeaving(true);
            window.setTimeout(() => onDismiss(toast.id), 200);
        }, toast.duration);
        return () => {
            cancelAnimationFrame(enter);
            window.clearTimeout(timer);
        };
    }, [toast.id, toast.duration, onDismiss]);

    const handleDismiss = () => {
        setLeaving(true);
        window.setTimeout(() => onDismiss(toast.id), 200);
    };

    const Icon = ICON_MAP[toast.type];

    const accentByType: Record<ToastType, { bar: string; icon: string }> = isDark
        ? {
            success: { bar: 'bg-emerald-500', icon: 'text-emerald-400' },
            error: { bar: 'bg-red-500', icon: 'text-red-400' },
            warning: { bar: 'bg-amber-500', icon: 'text-amber-400' },
            info: { bar: 'bg-blue-500', icon: 'text-blue-400' },
        }
        : {
            success: { bar: 'bg-emerald-500', icon: 'text-emerald-600' },
            error: { bar: 'bg-red-500', icon: 'text-red-600' },
            warning: { bar: 'bg-amber-500', icon: 'text-amber-600' },
            info: { bar: 'bg-blue-500', icon: 'text-blue-600' },
        };

    const accent = accentByType[toast.type];

    return (
        <div
            className={`pointer-events-auto relative overflow-hidden rounded-xl border backdrop-blur-md shadow-lg transition-all duration-200 ${
                isDark
                    ? 'bg-[#11111b]/95 border-white/10 text-white'
                    : 'bg-white/95 border-slate-200 text-slate-900'
            } ${visible && !leaving ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
            role="status"
            aria-live="polite"
        >
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent.bar}`} />
            <div className="flex items-start gap-3 pl-4 pr-3 py-3">
                <Icon size={18} className={`mt-0.5 shrink-0 ${accent.icon}`} />
                <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${isDark ? 'text-white' : 'text-slate-900'}`}>{toast.message}</p>
                    {toast.action && (
                        <div className="mt-1.5">
                            {toast.action.href ? (
                                <a
                                    href={toast.action.href}
                                    className={`text-xs font-semibold underline ${accent.icon}`}
                                >
                                    {toast.action.label}
                                </a>
                            ) : (
                                <button
                                    onClick={toast.action.onClick}
                                    className={`text-xs font-semibold underline ${accent.icon}`}
                                >
                                    {toast.action.label}
                                </button>
                            )}
                        </div>
                    )}
                </div>
                <button
                    onClick={handleDismiss}
                    className={`shrink-0 rounded-md p-1 transition-colors ${
                        isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                    aria-label="Dismiss"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};
