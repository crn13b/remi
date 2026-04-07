import React from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { AlertEvent } from './types';
import { URGENCY_STYLES } from './constants';
import AlertCard from './AlertCard';

interface AlertFeedProps {
    events: AlertEvent[];
    theme: 'dark' | 'light';
    onMarkRead?: (id: string) => void;
    onMarkAllRead?: () => void;
    onDismiss?: (id: string) => void;
}

const AlertFeed: React.FC<AlertFeedProps> = ({ events, theme, onMarkRead, onMarkAllRead, onDismiss }) => {
    const isDark = theme === 'dark';
    const unreadCount = events.filter(e => !e.read).length;

    if (events.length === 0) {
        return (
            <div className="relative flex flex-col items-center justify-center py-20">
                {/* Decorative gradient orb */}
                <div className="absolute w-32 h-32 rounded-full bg-blue-500/10 blur-[60px] pointer-events-none" />
                <div className={`relative animate-fade-in-up ${isDark ? 'text-gray-600' : 'text-slate-900'}`}>
                    <Bell size={48} className="mb-4 mx-auto" />
                    <p className={`text-lg font-display font-medium text-center ${
                        isDark ? 'text-gray-500' : 'text-slate-900'
                    }`}>No alerts yet</p>
                    <p className={`text-sm mt-1.5 text-center ${isDark ? 'text-gray-600' : 'text-slate-900'}`}>
                        Alerts will appear here when your scores hit target levels.
                    </p>
                    {/* Tier labels */}
                    <div className="flex items-center justify-center gap-5 mt-6">
                        {(['warning', 'high', 'critical'] as const).map((urgency) => {
                            const style = URGENCY_STYLES[urgency];
                            return (
                                <div key={urgency} className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                        urgency === 'warning' ? 'bg-amber-400' :
                                        urgency === 'high' ? 'bg-orange-400' : 'bg-red-400'
                                    }`} style={{
                                        boxShadow: urgency === 'warning' ? '0 0 6px #fbbf24' :
                                            urgency === 'high' ? '0 0 6px #fb923c' : '0 0 6px #ef4444'
                                    }} />
                                    <span className={`text-[11px] font-semibold uppercase tracking-wider ${
                                        isDark ? style.color : style.lightColor
                                    }`}>
                                        {style.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* Feed header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                    <span className={`text-xs uppercase tracking-widest font-semibold ${
                        isDark ? 'text-gray-500' : 'text-slate-900'
                    }`}>
                        Alert History
                    </span>
                    {unreadCount > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full min-w-[20px] text-center">
                            {unreadCount}
                        </span>
                    )}
                </div>
                {unreadCount > 0 && onMarkAllRead && (
                    <button
                        onClick={onMarkAllRead}
                        className={`flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${
                            isDark ? 'text-gray-500 hover:text-gray-300' : 'text-slate-900 hover:text-slate-900'
                        }`}
                    >
                        <CheckCheck size={14} />
                        Mark all read
                    </button>
                )}
            </div>

            {/* Alert cards with staggered entrance */}
            <div className="flex flex-col gap-4">
                {events.map((event, index) => (
                    <div
                        key={event.id}
                        className="animate-fade-in-up"
                        style={{ animationDelay: `${index * 100}ms`, opacity: 0, animationFillMode: 'forwards' }}
                    >
                        <AlertCard
                            event={event}
                            theme={theme}
                            onMarkRead={onMarkRead}
                            onDismiss={onDismiss}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AlertFeed;
