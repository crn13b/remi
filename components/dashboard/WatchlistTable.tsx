import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Asset } from '../../types';
import { ArrowUp, ArrowDown, MoreHorizontal, Bell, Trash2, List, Settings, Eye, EyeOff } from 'lucide-react';
import { useEntitlements } from '../../hooks/useEntitlements';

/* ─── RowMenu: renders via portal to escape table's clipping/stacking contexts ─── */
interface RowMenuProps {
    anchorEl: HTMLElement | null;
    isLight: boolean;
    onSetAlert: () => void;
    onRemove: () => void;
    onClose: () => void;
}

const RowMenu: React.FC<RowMenuProps> = ({ anchorEl, isLight, onSetAlert, onRemove, onClose }) => {
    const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!anchorEl) return;
        const r = anchorEl.getBoundingClientRect();
        setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }, [anchorEl]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node) && anchorEl && !anchorEl.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [anchorEl, onClose]);

    if (!pos) return null;

    return createPortal(
        <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
            className={`w-48 py-1 rounded-xl overflow-hidden border shadow-2xl ${isLight ? 'bg-white border-slate-200' : 'bg-[#1a1a2e] border-white/10'}`}
        >
            <button
                onClick={(e) => { e.stopPropagation(); onSetAlert(); onClose(); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium transition-colors ${isLight ? 'text-slate-600 hover:bg-slate-50' : 'text-gray-300 hover:bg-white/5'}`}
            >
                <Bell size={14} className="text-yellow-500" /> Set Alert
            </button>
            <div className={`mx-3 my-1 border-t ${isLight ? 'border-slate-100' : 'border-white/5'}`} />
            <button
                onClick={(e) => { e.stopPropagation(); onRemove(); onClose(); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium transition-colors ${isLight ? 'text-slate-900 hover:bg-slate-100' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
            >
                <Trash2 size={14} /> Remove
            </button>
        </div>,
        document.body,
    );
};

/* ─── Animated Score: rolls up from 0 to target ─── */
const AnimatedScore: React.FC<{ target: number; duration?: number; className?: string }> = ({ target, duration = 800, className = '' }) => {
    const [display, setDisplay] = useState(0);
    const startTime = useRef<number | null>(null);
    const frameRef = useRef<number>(0);

    const animate = useCallback((ts: number) => {
        if (!startTime.current) startTime.current = ts;
        const elapsed = ts - startTime.current;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(Math.round(eased * target));
        if (progress < 1) {
            frameRef.current = requestAnimationFrame(animate);
        }
    }, [target, duration]);

    useEffect(() => {
        startTime.current = null;
        frameRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frameRef.current);
    }, [animate]);

    return <span className={className}>{display}</span>;
};

interface WatchlistTableProps {
    assets: Asset[];
    theme?: 'light' | 'dark';
    onRemove?: (symbol: string) => void;
    onAnalyze?: (asset: Asset) => void;
    onSetAlert?: (asset: Asset) => void;
    recentlyAdded?: string | null;
    loadingSymbols?: Set<string>;
}

type SortKey = 'symbol' | 'score' | 'sentiment' | 'price' | 'change';
type SortDir = 'asc' | 'desc';

const WatchlistTable: React.FC<WatchlistTableProps> = ({
    assets, theme = 'dark', onRemove, onAnalyze, onSetAlert, recentlyAdded, loadingSymbols = new Set(),
}) => {
    const isLight = theme === 'light';
    const { data: ent } = useEntitlements();
    const entitlements = ent?.entitlements;
    const atTickerCap = !!(entitlements && assets.length >= entitlements.maxTickersPerWatchlist);
    const [sortKey, setSortKey] = useState<SortKey | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const [removingSymbol, setRemovingSymbol] = useState<string | null>(null);
    const [showColumnSettings, setShowColumnSettings] = useState(false);
    const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(['score', 'price', 'change']));
    const colSettingsRef = useRef<HTMLDivElement>(null);

    const COLUMN_OPTIONS = [
        { id: 'score', label: 'Score' },
        { id: 'price', label: 'Price' },
        { id: 'change', label: '24h %' },
    ];

    const toggleColumn = (colId: string) => {
        setVisibleColumns(prev => {
            const next = new Set(prev);
            if (next.has(colId)) next.delete(colId);
            else next.add(colId);
            return next;
        });
    };

    // Build dynamic grid template
    const getGridTemplate = () => {
        const parts = ['1.2fr']; // Asset always first
        if (visibleColumns.has('score')) parts.push('1fr');
        if (visibleColumns.has('price')) parts.push('1fr');
        if (visibleColumns.has('change')) parts.push('1fr');
        parts.push('36px'); // Menu always last
        return parts.join(' ');
    };

    const gridStyle = { gridTemplateColumns: getGridTemplate() };

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (colSettingsRef.current && !colSettingsRef.current.contains(e.target as Node)) setShowColumnSettings(false);
        };
        if (showColumnSettings) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showColumnSettings]);

    const hasScore = (a: Asset) => typeof a.score === 'number';
    const isScoreUnavailable = (a: Asset) => a.score === -1;
    const getScore = (a: Asset): number => a.score as number;
    const getSentimentColor = (s: string | undefined) => s?.includes('Buy') ? 'text-green-500' : s?.includes('Sell') ? 'text-red-500' : 'text-yellow-500';
    const getScoreColor = (n: number) => n >= 70 ? 'text-green-500' : n >= 40 ? 'text-yellow-500' : 'text-red-500';

    const getCryptoLogo = (symbol: string) => {
        const logos: Record<string, string> = {
            BTC: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
            ETH: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
            SOL: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
            PEPE: 'https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg',
            XRP: 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png',
            ADA: 'https://assets.coingecko.com/coins/images/975/small/cardano.png',
            DOGE: 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png',
            AVAX: 'https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png',
            LINK: 'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
            DOT: 'https://assets.coingecko.com/coins/images/12171/small/polkadot.png',
            MATIC: 'https://assets.coingecko.com/coins/images/4713/small/polygon.png',
            UNI: 'https://assets.coingecko.com/coins/images/12504/small/uniswap.png',
        };
        return logos[symbol] || '';
    };

    const parseNum = (s: string) => parseFloat(s.replace(/[$,%]/g, '')) || 0;

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const sorted = [...assets].sort((a, b) => {
        if (!sortKey) return 0;
        let c = 0;
        switch (sortKey) {
            case 'symbol': c = a.symbol.localeCompare(b.symbol); break;
            case 'score': {
                // Sort unscored rows to the bottom regardless of direction
                if (!hasScore(a) && !hasScore(b)) c = 0;
                else if (!hasScore(a)) return 1;
                else if (!hasScore(b)) return -1;
                else c = getScore(a) - getScore(b);
                break;
            }
            case 'sentiment': c = (a.sentiment ?? '').localeCompare(b.sentiment ?? ''); break;
            case 'price': c = parseNum(a.price) - parseNum(b.price); break;
            case 'change': c = parseNum(a.change) - parseNum(b.change); break;
        }
        return sortDir === 'asc' ? c : -c;
    });

    const handleRemove = (symbol: string) => {
        setRemovingSymbol(symbol);
        setOpenMenu(null);
        setMenuAnchor(null);
        setTimeout(() => { onRemove?.(symbol); setRemovingSymbol(null); }, 450);
    };

    const SortHead = ({ label, k, align = 'left' }: { label: string; k: SortKey; align?: string }) => {
        const arrow = (
            <span className={`transition-all duration-200 ${sortKey === k ? 'opacity-100' : 'opacity-0'}`}>
                {sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
            </span>
        );
        return (
            <div
                className={`cursor-pointer select-none flex items-center gap-1 transition-colors duration-200 ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : ''
                    } ${isLight ? 'hover:text-slate-700' : 'hover:text-white'}`}
                onClick={() => handleSort(k)}
            >
                {align === 'right' ? arrow : null}
                <span>{label}</span>
                {align !== 'right' ? arrow : null}
            </div>
        );
    };

    /* ─── Empty State ─── */
    if (assets.length === 0) {
        return (
            <div className={`flex flex-col items-center justify-center py-20 px-8 ${isLight ? 'text-slate-900' : 'text-gray-500'}`}>
                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-5 ${isLight ? 'bg-slate-50' : 'bg-white/[0.03]'}`}>
                    <List size={32} className="opacity-30" />
                </div>
                <p className={`text-base font-semibold mb-1 ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>No assets yet</p>
                <p className="text-sm opacity-50 text-center max-w-[260px] leading-relaxed">
                    Search for assets above or analyze a coin to add it here.
                </p>
            </div>
        );
    }

    /* ─── Skeleton shimmer row (desktop) ─── */
    const renderSkeletonDesktopRow = (asset: Asset) => {
        const logo = getCryptoLogo(asset.symbol);
        return (
            <div
                key={`skeleton-${asset.symbol}`}
                className={`group relative grid gap-5 items-center px-6 py-5 border-b animate-in fade-in slide-in-from-left-4 duration-500
                    ${isLight ? 'border-slate-100' : 'border-white/[0.03]'}`}
                style={gridStyle}
            >
                {/* Asset - real icon + name with shimmer overlay */}
                <div className="flex items-center gap-3">
                    {logo ? <img src={logo} alt={asset.symbol} className="w-9 h-9 rounded-full opacity-50" /> : (
                        <div className={`w-9 h-9 rounded-full ${isLight ? 'bg-slate-100' : 'bg-white/10'} skeleton-shimmer`} />
                    )}
                    <div className="flex flex-col gap-1.5">
                        <span className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'} opacity-50`}>{asset.symbol}</span>
                        <div className={`h-2.5 w-14 rounded-full ${isLight ? 'bg-slate-100' : 'bg-white/[0.06]'} skeleton-shimmer`} />
                    </div>
                </div>
                {/* Score skeleton */}
                {visibleColumns.has('score') && <div className="flex flex-col gap-1.5 items-start">
                    <div className={`h-5 w-16 rounded-lg ${isLight ? 'bg-slate-100' : 'bg-white/[0.06]'} skeleton-shimmer`} />
                    <div className={`h-2.5 w-20 rounded-full ${isLight ? 'bg-slate-100' : 'bg-white/[0.06]'} skeleton-shimmer`} />
                </div>}
                {/* Price skeleton */}
                {visibleColumns.has('price') && <div className="flex justify-end">
                    <div className={`h-4 w-20 rounded-lg ${isLight ? 'bg-slate-100' : 'bg-white/[0.06]'} skeleton-shimmer`} />
                </div>}
                {/* Change skeleton */}
                {visibleColumns.has('change') && <div className="flex justify-end">
                    <div className={`h-4 w-14 rounded-lg ${isLight ? 'bg-slate-100' : 'bg-white/[0.06]'} skeleton-shimmer`} />
                </div>}
                {/* Menu placeholder */}
                <div />
            </div>
        );
    };

    /* ─── Skeleton shimmer row (mobile) ─── */
    const renderSkeletonMobileCard = (asset: Asset) => {
        const logo = getCryptoLogo(asset.symbol);
        return (
            <div
                key={`skeleton-${asset.symbol}`}
                className={`relative rounded-2xl p-4 border animate-in fade-in slide-in-from-bottom-2 duration-500
                    ${isLight ? 'bg-white border-slate-100 shadow-sm' : 'bg-white/[0.03] border-white/5'}`}
            >
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        {logo ? <img src={logo} alt={asset.symbol} className="w-10 h-10 rounded-full opacity-50" /> : (
                            <div className={`w-10 h-10 rounded-full ${isLight ? 'bg-slate-100' : 'bg-white/10'} skeleton-shimmer`} />
                        )}
                        <div className="flex flex-col gap-1.5">
                            <span className={`text-sm font-bold opacity-50 ${isLight ? 'text-slate-900' : 'text-white'}`}>{asset.symbol}</span>
                            <div className="flex gap-2">
                                <div className={`h-3 w-16 rounded-full ${isLight ? 'bg-slate-100' : 'bg-white/[0.06]'} skeleton-shimmer`} />
                                <div className={`h-3 w-10 rounded-full ${isLight ? 'bg-slate-100' : 'bg-white/[0.06]'} skeleton-shimmer`} />
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                        <div className={`h-5 w-14 rounded-lg ${isLight ? 'bg-slate-100' : 'bg-white/[0.06]'} skeleton-shimmer`} />
                        <div className={`h-2.5 w-20 rounded-full ${isLight ? 'bg-slate-100' : 'bg-white/[0.06]'} skeleton-shimmer`} />
                    </div>
                </div>
            </div>
        );
    };

    /* ─── Row renderer (desktop) ─── */
    const renderDesktopRow = (asset: Asset) => {
        const score = getScore(asset);
        const logo = getCryptoLogo(asset.symbol);
        const removing = removingSymbol === asset.symbol;
        const justAdded = recentlyAdded === asset.symbol;

        const menuOpen = openMenu === asset.symbol;
        return (
            <div
                key={asset.symbol}
                className={`group relative grid gap-5 items-center px-6 border-b
                    ${menuOpen ? 'z-40' : 'z-0'}
                    ${justAdded ? 'animate-in fade-in slide-in-from-left-4 duration-500' : ''}
                    ${isLight ? 'border-slate-100 hover:bg-slate-50' : 'border-white/[0.03] hover:bg-white/[0.02]'}`}
                style={{
                    ...gridStyle,
                    opacity: removing ? 0 : 1,
                    transform: removing ? 'translateX(-32px)' : 'translateX(0)',
                    maxHeight: removing ? '0px' : '120px',
                    paddingTop: removing ? '0px' : '20px',
                    paddingBottom: removing ? '0px' : '20px',
                    overflow: 'hidden',
                    transition: 'opacity 200ms ease-out, transform 300ms cubic-bezier(.4,0,.2,1), max-height 350ms cubic-bezier(.4,0,.2,1) 100ms, padding 350ms cubic-bezier(.4,0,.2,1) 100ms',
                }}
            >
                {/* Asset */}
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => onAnalyze?.(asset)}>
                    {logo ? <img src={logo} alt={asset.symbol} className="w-9 h-9 rounded-full" /> : (
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-white/10 text-gray-400'}`}>{asset.symbol[0]}</div>
                    )}
                    <div className="flex flex-col">
                        <span className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{asset.symbol}</span>
                        <span className={`text-[10px] ${isLight ? 'text-slate-900' : 'text-gray-500'}`}>{asset.name}</span>
                    </div>
                </div>
                {/* Score + Signal */}
                {visibleColumns.has('score') && <div className="flex flex-col items-start justify-center">
                    <div className="flex items-baseline gap-0.5">
                        {isScoreUnavailable(asset) ? (
                            <span className={`text-xl font-bold ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>—</span>
                        ) : (
                            <>
                                <AnimatedScore target={score} className={`text-xl font-bold ${getScoreColor(score)}`} />
                                <span className={`text-xs ${isLight ? 'text-slate-900' : 'text-gray-500'}`}>/100</span>
                            </>
                        )}
                    </div>
                    <div className={`text-[10px] font-bold uppercase mt-0.5 ${getSentimentColor(asset.sentiment)} score-reveal-fade`} style={{ animationDelay: '400ms' }}>{asset.sentiment ?? '—'}</div>
                </div>}
                {/* Price */}
                {visibleColumns.has('price') && <div className="score-reveal-fade" style={{ animationDelay: '600ms' }}><span className={`text-xs font-mono font-medium ${isLight ? 'text-slate-700' : 'text-white'}`}>{asset.price}</span></div>}
                {/* Change */}
                {visibleColumns.has('change') && <div className="score-reveal-fade" style={{ animationDelay: '650ms' }}><span className={`text-xs font-medium ${asset.change?.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>{asset.change ?? '—'}</span></div>}

                {/* Overflow menu trigger (popup renders via portal outside table) */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (openMenu === asset.symbol) {
                            setOpenMenu(null);
                            setMenuAnchor(null);
                        } else {
                            setOpenMenu(asset.symbol);
                            setMenuAnchor(e.currentTarget);
                        }
                    }}
                    className={`p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 ${isLight ? 'hover:bg-slate-100 text-slate-900' : 'hover:bg-white/10 text-gray-500'}`}
                >
                    <MoreHorizontal size={16} />
                </button>
            </div>
        );
    };

    const renderMobileCard = (asset: Asset) => {
        const score = getScore(asset);
        const isPos = asset.change?.startsWith('+');
        const logo = getCryptoLogo(asset.symbol);
        const removing = removingSymbol === asset.symbol;
        const justAdded = recentlyAdded === asset.symbol;
        const menuOpen = openMenu === asset.symbol;

        return (
            <div
                key={asset.symbol}
                className={`relative rounded-2xl p-4 border transition-all
                    ${menuOpen ? 'z-40' : 'z-0'}
                    ${removing ? 'opacity-0 -translate-x-8 max-h-0 p-0 overflow-hidden' : 'opacity-100'}
                    ${justAdded ? 'animate-in fade-in slide-in-from-bottom-2 duration-500' : ''}
                    ${isLight ? 'bg-white border-slate-100 shadow-sm' : 'bg-white/[0.03] border-white/5'}`}
                style={{ transitionDuration: removing ? '400ms' : '300ms' }}
            >
                <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => onAnalyze?.(asset)}>
                        {logo ? <img src={logo} alt={asset.symbol} className="w-10 h-10 rounded-full" /> : (
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-white/10 text-gray-400'}`}>{asset.symbol[0]}</div>
                        )}
                        <div className="flex flex-col">
                            <div className="flex items-baseline gap-2">
                                <span className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{asset.symbol}</span>
                                <span className={`text-[11px] ${isLight ? 'text-slate-900' : 'text-gray-500'}`}>{asset.name}</span>
                            </div>
                            <div className="flex items-baseline gap-2 mt-1">
                                <span className={`text-[11px] font-mono font-medium ${isLight ? 'text-slate-800' : 'text-white'}`}>{asset.price ?? '—'}</span>
                                <span className={`text-[10px] font-medium ${isPos ? 'text-green-500' : 'text-red-500'}`}>{asset.change ?? '—'}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex flex-col items-end">
                            <div className="flex items-baseline gap-0.5">
                                <AnimatedScore target={score} className={`text-lg font-bold ${getScoreColor(score)}`} />
                                <span className={`text-[10px] ${isLight ? 'text-slate-900' : 'text-gray-500'}`}>/100</span>
                            </div>
                            <div className={`text-[10px] font-bold uppercase mt-0.5 text-right score-reveal-fade ${getSentimentColor(asset.sentiment)}`} style={{ animationDelay: '400ms' }}>{asset.sentiment ?? '—'}</div>
                        </div>
                        {/* Overflow menu trigger (popup renders via portal) */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (openMenu === asset.symbol) {
                                    setOpenMenu(null);
                                    setMenuAnchor(null);
                                } else {
                                    setOpenMenu(asset.symbol);
                                    setMenuAnchor(e.currentTarget);
                                }
                            }}
                            className={`p-1.5 rounded-lg opacity-100 transition-all duration-200 flex items-center justify-center ${isLight ? 'hover:bg-slate-100 text-slate-900' : 'hover:bg-white/10 text-gray-500'}`}
                        >
                            <MoreHorizontal size={16} />
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const activeMenuAsset = openMenu ? assets.find(a => a.symbol === openMenu) : null;

    return (
        <div className="w-full">
            {activeMenuAsset && (
                <RowMenu
                    anchorEl={menuAnchor}
                    isLight={isLight}
                    onSetAlert={() => onSetAlert?.(activeMenuAsset)}
                    onRemove={() => handleRemove(activeMenuAsset.symbol)}
                    onClose={() => { setOpenMenu(null); setMenuAnchor(null); }}
                />
            )}
            {atTickerCap && (
                <div className={`px-6 py-2 text-xs border-b ${isLight ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-amber-300 bg-amber-900/20 border-amber-900/30'}`}>
                    You&apos;ve hit your ticker limit for this watchlist.{' '}
                    <a href="/pricing.html?reason=watchlist-ticker-cap" className="underline font-semibold">Upgrade to add more</a>.
                </div>
            )}
            {/* Desktop */}
            <div className="hidden md:block">
                <div className={`grid gap-5 items-center px-6 py-4 border-b text-[10px] font-semibold uppercase tracking-wider ${isLight ? 'text-slate-900 border-slate-100' : 'text-gray-500 border-white/5'}`} style={gridStyle}>
                    <SortHead label="Asset" k="symbol" />
                    {visibleColumns.has('score') && <SortHead label="Score" k="score" align="left" />}
                    {visibleColumns.has('price') && <SortHead label="Price" k="price" align="left" />}
                    {visibleColumns.has('change') && <SortHead label="24h %" k="change" align="left" />}

                    {/* Column settings gear */}
                    <div className="relative" ref={colSettingsRef}>
                        <button
                            onClick={() => setShowColumnSettings(!showColumnSettings)}
                            className={`p-1 rounded-lg transition-all duration-200 ${isLight ? 'hover:bg-slate-100 text-slate-900' : 'hover:bg-white/10 text-gray-500'}`}
                        >
                            <Settings size={14} />
                        </button>
                        {showColumnSettings && (
                            <div className={`absolute right-0 top-8 z-50 w-44 py-2 rounded-xl overflow-hidden border shadow-2xl animate-in fade-in zoom-in-95 duration-200 ${isLight ? 'bg-white border-slate-200' : 'bg-[#1a1a2e] border-white/10'}`}>
                                <div className={`px-3 pb-2 mb-1 text-[10px] font-semibold uppercase tracking-wider border-b ${isLight ? 'text-slate-900 border-slate-100' : 'text-gray-500 border-white/5'}`}>Toggle Columns</div>
                                {COLUMN_OPTIONS.map(col => (
                                    <button
                                        key={col.id}
                                        onClick={() => toggleColumn(col.id)}
                                        className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium transition-colors ${isLight ? 'text-slate-600 hover:bg-slate-50' : 'text-gray-300 hover:bg-white/5'}`}
                                    >
                                        {visibleColumns.has(col.id) ? <Eye size={14} className="text-blue-500" /> : <EyeOff size={14} className="opacity-30" />}
                                        <span className={visibleColumns.has(col.id) ? '' : 'opacity-40'}>{col.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex flex-col">{sorted.map(a => (loadingSymbols.has(a.symbol) || !hasScore(a)) ? renderSkeletonDesktopRow(a) : renderDesktopRow(a))}</div>
            </div>
            {/* Mobile */}
            <div className="md:hidden flex flex-col gap-3 p-4">{sorted.map(a => (loadingSymbols.has(a.symbol) || !hasScore(a)) ? renderSkeletonMobileCard(a) : renderMobileCard(a))}</div>
        </div>
    );
};

export default WatchlistTable;
