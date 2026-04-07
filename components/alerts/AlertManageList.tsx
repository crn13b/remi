import React from 'react';
import { Bell, BellOff, Pencil, Trash2, TrendingUp, TrendingDown, ArrowLeftRight, Plus } from 'lucide-react';
import { Alert, UrgencyLevel } from './types';
import { AGGRESSIVENESS_PRESETS, LONG_THRESHOLDS, SHORT_THRESHOLDS, URGENCY_STYLES } from './constants';

interface AlertManageListProps {
    alerts: Alert[];
    theme: 'dark' | 'light';
    onToggle: (id: string, active: boolean) => void;
    onEdit: (alert: Alert) => void;
    onDelete: (id: string) => void;
    onCreate: () => void;
}

const DirectionIcon = ({ direction }: { direction: string }) => {
    switch (direction) {
        case 'long': return <TrendingUp size={14} className="text-green-500" />;
        case 'short': return <TrendingDown size={14} className="text-red-500" />;
        default: return <ArrowLeftRight size={14} className="text-blue-400" />;
    }
};

function getScoreUrgency(score: number, direction: string): UrgencyLevel | null {
    const thresholdSets = direction === 'short' ? [SHORT_THRESHOLDS] :
                          direction === 'long' ? [LONG_THRESHOLDS] :
                          [LONG_THRESHOLDS, SHORT_THRESHOLDS];
    for (const thresholds of thresholdSets) {
        for (const [tier, [min, max]] of Object.entries(thresholds) as [UrgencyLevel, [number, number]][]) {
            if (score >= min && score <= max) return tier;
        }
    }
    return null;
}

const AlertManageList: React.FC<AlertManageListProps> = ({
    alerts, theme, onToggle, onEdit, onDelete, onCreate,
}) => {
    const isDark = theme === 'dark';

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <span className={`text-xs uppercase tracking-widest font-semibold ${
                    isDark ? 'text-gray-500' : 'text-slate-900'
                }`}>
                    Active Alerts ({alerts.length})
                </span>
                <button
                    onClick={onCreate}
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-500 hover:text-blue-400 transition-colors cursor-pointer"
                >
                    <Plus size={14} />
                    Add
                </button>
            </div>

            <div className="flex flex-col gap-2">
                {alerts.map((alert) => {
                    const preset = AGGRESSIVENESS_PRESETS.find(p => p.value === alert.aggressiveness);
                    const scoreUrgency = alert.last_score != null ? getScoreUrgency(alert.last_score, alert.direction) : null;
                    const urgencyStyle = scoreUrgency ? URGENCY_STYLES[scoreUrgency] : null;

                    return (
                        <div
                            key={alert.id}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 ${
                                alert.is_active
                                    ? isDark
                                        ? 'bg-white/[0.03] border-[#27273a]'
                                        : 'bg-white border-slate-200'
                                    : isDark
                                        ? 'bg-white/[0.01] border-[#1e1e2e] opacity-50'
                                        : 'bg-slate-50/50 border-slate-100 opacity-50'
                            }`}
                        >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'
                            }`}>
                                {alert.symbol.slice(0, 3)}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm font-display font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        {alert.symbol}
                                    </span>
                                    <DirectionIcon direction={alert.direction} />
                                    <span className={`text-[11px] uppercase tracking-wider font-medium ${
                                        isDark ? 'text-gray-600' : 'text-slate-900'
                                    }`}>
                                        {alert.direction}
                                    </span>
                                    <span className={`text-[11px] ${isDark ? 'text-gray-700' : 'text-slate-900'}`}>
                                        · {preset?.label ?? 'Default'}
                                    </span>
                                </div>
                            </div>

                            {/* Live score */}
                            {alert.last_score != null && (
                                <span className={`text-sm font-display font-bold ${
                                    urgencyStyle
                                        ? isDark ? urgencyStyle.color : urgencyStyle.lightColor
                                        : isDark ? 'text-gray-500' : 'text-slate-900'
                                }`}>
                                    {alert.last_score}
                                </span>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => onToggle(alert.id, !alert.is_active)}
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                                        isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100'
                                    }`}
                                    title={alert.is_active ? 'Pause' : 'Resume'}
                                >
                                    {alert.is_active
                                        ? <Bell size={15} className={isDark ? 'text-green-400' : 'text-green-600'} />
                                        : <BellOff size={15} className={isDark ? 'text-gray-600' : 'text-slate-900'} />
                                    }
                                </button>
                                <button
                                    onClick={() => onEdit(alert)}
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                                        isDark ? 'hover:bg-white/5 text-gray-500' : 'hover:bg-slate-100 text-slate-900'
                                    }`}
                                    title="Edit"
                                >
                                    <Pencil size={14} />
                                </button>
                                <button
                                    onClick={() => onDelete(alert.id)}
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                                        isDark ? 'hover:bg-red-500/10 text-gray-600 hover:text-red-400' : 'hover:bg-red-50 text-slate-900 hover:text-red-500'
                                    }`}
                                    title="Delete"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default AlertManageList;
