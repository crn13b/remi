import React, { useState, useEffect, useRef } from 'react';
import { X, Search, TrendingUp, TrendingDown, ArrowLeftRight } from 'lucide-react';
import { Alert, AlertDirection, Aggressiveness } from './types';
import { ASSET_CATALOG, searchCatalog, CatalogEntry } from '../../data/assetCatalog';
import AggressivenessSlider from './AggressivenessSlider';

interface AlertFormProps {
    theme: 'dark' | 'light';
    onSave: (alert: Omit<Alert, 'id' | 'user_id' | 'last_triggered_at' | 'last_score' | 'created_at'>) => void;
    onClose: () => void;
    editingAlert?: Alert | null;
    prefillSymbol?: string | null;
}

const DIRECTIONS: { value: AlertDirection; label: string; desc: string; icon: React.ElementType }[] = [
    { value: 'long', label: 'Long', desc: 'Alert on high confidence (bullish)', icon: TrendingUp },
    { value: 'short', label: 'Short', desc: 'Alert on low confidence (bearish)', icon: TrendingDown },
    { value: 'both', label: 'Both', desc: 'Alert in either direction', icon: ArrowLeftRight },
];

const AlertForm: React.FC<AlertFormProps> = ({ theme, onSave, onClose, editingAlert, prefillSymbol }) => {
    const isDark = theme === 'dark';
    const isEditing = !!editingAlert;

    const [symbol, setSymbol] = useState(editingAlert?.symbol ?? prefillSymbol ?? '');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<CatalogEntry[]>([]);
    const [showSearch, setShowSearch] = useState(!symbol);
    const [direction, setDirection] = useState<AlertDirection>(editingAlert?.direction ?? 'both');
    const [aggressiveness, setAggressiveness] = useState<Aggressiveness>(editingAlert?.aggressiveness ?? 'default');

    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (showSearch && searchRef.current) {
            searchRef.current.focus();
        }
    }, [showSearch]);

    useEffect(() => {
        if (searchQuery.trim()) {
            setSearchResults(searchCatalog(searchQuery, 8));
        } else {
            setSearchResults([]);
        }
    }, [searchQuery]);

    const selectedAsset = ASSET_CATALOG.find(a => a.symbol === symbol);

    const handleSelectAsset = (entry: CatalogEntry) => {
        setSymbol(entry.symbol);
        setSearchQuery('');
        setShowSearch(false);
    };

    const handleSave = () => {
        if (!symbol) return;
        onSave({
            symbol,
            direction,
            aggressiveness,
            is_active: true,
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />

            {/* Modal */}
            <div className={`relative w-full max-w-md rounded-3xl border p-7 animate-fade-in-up ${
                isDark ? 'bg-[#0e0e16] border-[#27273a] shadow-[0_0_80px_rgba(59,130,246,0.1)]' : 'bg-white border-slate-200 shadow-2xl'
            }`}>
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className={`text-xl font-display font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {isEditing ? 'Edit Alert' : 'Create Alert'}
                    </h2>
                    <button
                        onClick={onClose}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                            isDark ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-slate-100 text-slate-900'
                        }`}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Asset Selection */}
                <div className="mb-5">
                    <label className={`text-[10px] uppercase tracking-widest font-semibold mb-2 block ${
                        isDark ? 'text-gray-500' : 'text-slate-900'
                    }`}>
                        Asset
                    </label>

                    {symbol && !showSearch ? (
                        <button
                            onClick={() => { if (!isEditing) setShowSearch(true); }}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                                isDark
                                    ? 'bg-white/[0.03] border-[#27273a] hover:border-gray-600'
                                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                            } ${isEditing ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${
                                isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'
                            }`}>
                                {symbol.slice(0, 3)}
                            </div>
                            <div className="text-left">
                                <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    {symbol}
                                </div>
                                {selectedAsset && (
                                    <div className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-slate-900'}`}>
                                        {selectedAsset.name}
                                    </div>
                                )}
                            </div>
                            {!isEditing && (
                                <span className={`ml-auto text-[10px] ${isDark ? 'text-gray-600' : 'text-slate-900'}`}>
                                    Change
                                </span>
                            )}
                        </button>
                    ) : (
                        <div className="relative">
                            <div className={`flex items-center gap-2 rounded-xl border px-3 ${
                                isDark ? 'bg-white/[0.03] border-[#27273a]' : 'bg-slate-50 border-slate-200'
                            }`}>
                                <Search size={14} className={isDark ? 'text-gray-500' : 'text-slate-900'} />
                                <input
                                    ref={searchRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search for an asset..."
                                    className={`w-full py-3 text-sm bg-transparent outline-none ${
                                        isDark ? 'text-white placeholder:text-gray-600' : 'text-slate-900 placeholder:text-slate-500'
                                    }`}
                                />
                            </div>

                            {/* Search Results Dropdown */}
                            {searchResults.length > 0 && (
                                <div className={`absolute top-full left-0 right-0 mt-1 rounded-xl border overflow-hidden z-10 max-h-56 overflow-y-auto ${
                                    isDark ? 'bg-[#141420] border-[#27273a]' : 'bg-white border-slate-200 shadow-lg'
                                }`}>
                                    {searchResults.map((entry) => (
                                        <button
                                            key={entry.symbol}
                                            onClick={() => handleSelectAsset(entry)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer ${
                                                isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold ${
                                                isDark ? 'bg-white/5 text-gray-300' : 'bg-slate-100 text-slate-600'
                                            }`}>
                                                {entry.symbol.slice(0, 3)}
                                            </div>
                                            <div>
                                                <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                    {entry.symbol}
                                                </div>
                                                <div className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-slate-900'}`}>
                                                    {entry.name}
                                                </div>
                                            </div>
                                            <span className={`ml-auto text-[9px] uppercase tracking-wider font-medium ${
                                                isDark ? 'text-gray-600' : 'text-slate-900'
                                            }`}>
                                                {entry.category}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Direction Selection */}
                <div className="mb-5">
                    <label className={`text-[10px] uppercase tracking-widest font-semibold mb-2 block ${
                        isDark ? 'text-gray-500' : 'text-slate-900'
                    }`}>
                        Direction
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {DIRECTIONS.map((dir) => {
                            const isActive = direction === dir.value;
                            return (
                                <button
                                    key={dir.value}
                                    onClick={() => setDirection(dir.value)}
                                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all cursor-pointer ${
                                        isActive
                                            ? isDark
                                                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                                                : 'bg-blue-50 border-blue-200 text-blue-600 shadow-md'
                                            : isDark
                                                ? 'bg-white/[0.02] border-[#27273a] text-gray-500 hover:border-gray-600'
                                                : 'bg-slate-50 border-slate-200 text-slate-900 hover:border-slate-300'
                                    }`}
                                >
                                    <dir.icon size={20} />
                                    <span className="text-sm font-semibold">{dir.label}</span>
                                </button>
                            );
                        })}
                    </div>
                    <p className={`text-[10px] mt-2 ${isDark ? 'text-gray-600' : 'text-slate-900'}`}>
                        {DIRECTIONS.find(d => d.value === direction)?.desc}
                    </p>
                </div>

                {/* Aggressiveness Slider */}
                <div className="mb-6">
                    <AggressivenessSlider
                        value={aggressiveness}
                        onChange={setAggressiveness}
                        theme={theme}
                        showPreview={true}
                    />
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className={`flex-1 py-3.5 rounded-2xl text-base font-semibold transition-colors cursor-pointer ${
                            isDark
                                ? 'bg-white/5 text-gray-400 hover:bg-white/10'
                                : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                        }`}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!symbol}
                        className={`flex-1 py-3.5 rounded-2xl text-base font-semibold transition-all cursor-pointer ${
                            symbol
                                ? 'bg-blue-600 text-white hover:bg-blue-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                                : isDark
                                    ? 'bg-white/5 text-gray-600 cursor-not-allowed'
                                    : 'bg-slate-100 text-slate-900 cursor-not-allowed'
                        }`}
                    >
                        {isEditing ? 'Save Changes' : 'Create Alert'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertForm;
