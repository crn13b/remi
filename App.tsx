import React, { useState, useEffect, useRef } from "react";
import {
    List,
    ListPlus,
    Bell,
    BellPlus,
    ArrowUp,
    TrendingUp,
    TrendingDown,
    Plus,
    Share,
    Search,
    X,
    Sun,
    Moon,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    LogOut,
    Trash2,
    User,
    Crown,
    Zap,
    Clock,
    Info,
    Check,
    Terminal,
} from "lucide-react";
import { ViewType, Asset } from "./types";
import { getRemiScore, isSupported, getDisplayName, type RemiScoreResult } from "./services/remiScore";
import * as watchlistService from "./services/watchlistService";
import { supabase } from "./services/supabaseClient";
import WatchlistTable from "./components/dashboard/WatchlistTable";
import RemiScoreCard from "./components/dashboard/RemiScoreCard";
import FoundingBadge from "./components/dashboard/FoundingBadge";
import OwnerBadge from "./components/dashboard/OwnerBadge";
import AlertsPage from "./components/alerts/AlertsPage";
import { Alert, AlertEvent, Aggressiveness, NudgeFrequency, NotificationPreferences, UserConnection } from "./components/alerts/types";
import * as alertService from "./services/alertService";
import { updateNotificationPrefs } from "./services/meService";
import { searchCatalog, searchGeckoTerminal, searchBinance, type CatalogEntry } from "./data/assetCatalog";
import { useEntitlements } from "./hooks/useEntitlements";

// ─── Watchlist Types ───
import type { WatchlistGroup } from "./services/watchlistService";

const SEARCHABLE_POOL: Asset[] = [
    { symbol: 'BTC', name: 'Bitcoin', price: '—', change: '—', sentiment: 'Hold', color: 'orange-500' },
    { symbol: 'ETH', name: 'Ethereum', price: '—', change: '—', sentiment: 'Hold', color: 'blue-400' },
    { symbol: 'SOL', name: 'Solana', price: '—', change: '—', sentiment: 'Hold', color: 'purple-500' },
    { symbol: 'XRP', name: 'Ripple', price: '—', change: '—', sentiment: 'Hold', color: 'blue-500' },
    { symbol: 'ADA', name: 'Cardano', price: '—', change: '—', sentiment: 'Hold', color: 'blue-400' },
    { symbol: 'DOGE', name: 'Dogecoin', price: '—', change: '—', sentiment: 'Hold', color: 'yellow-500' },
    { symbol: 'AVAX', name: 'Avalanche', price: '—', change: '—', sentiment: 'Hold', color: 'red-500' },
    { symbol: 'LINK', name: 'Chainlink', price: '—', change: '—', sentiment: 'Hold', color: 'blue-600' },
    { symbol: 'PEPE', name: 'Pepe', price: '—', change: '—', sentiment: 'Hold', color: 'green-500' },
];

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<ViewType>(ViewType.SEARCH);
    const [theme, setTheme] = useState<"dark" | "light">(() => {
        const saved = localStorage.getItem("remi-theme");
        return saved === "light" ? "light" : "dark";
    });

    // Persist theme to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem("remi-theme", theme);
    }, [theme]);
    const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // ─── Alerts State ───
    const [userAlerts, setUserAlerts] = useState<Alert[]>([]);
    const [alertEvents, setAlertEvents] = useState<AlertEvent[]>([]);
    const [globalAggressiveness, setGlobalAggressiveness] = useState<Aggressiveness>('default');
    const [alertPrefillSymbol, setAlertPrefillSymbol] = useState<string | null>(null);
    // ─── Patience Nudge State ───
    const [nudgeEnabled, setNudgeEnabled] = useState(true);
    const [nudgeFrequency, setNudgeFrequency] = useState<NudgeFrequency>('daily');
    const [nudgeTime, setNudgeTime] = useState('10:00');
    const lastNudgeAtRef = useRef<string | null>(null);

    // ─── Notification Channel State ───
    const [emailEnabled, setEmailEnabled] = useState(true);
    const [discordEnabled, setDiscordEnabled] = useState(false);
    const [telegramEnabled, setTelegramEnabled] = useState(false);
    const [userConnections, setUserConnections] = useState<UserConnection[]>([]);

    // Ref to prevent race conditions on concurrent pref upserts
    const latestPrefsRef = useRef<NotificationPreferences | null>(null);
    const buildPrefs = (overrides: Partial<NotificationPreferences> = {}): NotificationPreferences => {
        const base: NotificationPreferences = latestPrefsRef.current ?? {
            user_id: userId!,
            global_aggressiveness: globalAggressiveness,
            email_enabled: emailEnabled,
            digest_enabled: false,
            digest_time: '09:00',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
            discord_enabled: discordEnabled,
            telegram_enabled: telegramEnabled,
            nudge_enabled: nudgeEnabled,
            nudge_frequency: nudgeFrequency,
            nudge_time: nudgeTime,
        };
        const merged = { ...base, ...overrides };
        latestPrefsRef.current = merged;
        return merged;
    };

    const aggressivenessDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ─── Auth State ───
    const [userId, setUserId] = useState<string | null>(null);
    // Per spec, UI must never read `ent.plan` directly — use dedicated flags.
    const { data: ent, refresh: refreshEntitlements } = useEntitlements();
    const isFoundingMember = ent?.entitlements.foundingMemberBadge === true;
    const isOwner = ent?.isOwner === true;
    const dailyLookupsRemaining = ent?.dailyScoreLookupsRemaining ?? null;
    const dailyLookupLimit = ent?.entitlements.dailyScoreLookupLimit ?? null;
    const lookupsExhausted = dailyLookupLimit !== null && dailyLookupsRemaining === 0;
    const [userPlan, setUserPlan] = useState<string>('free');
    const [userEmail, setUserEmail] = useState<string>('');
    const [userMeta, setUserMeta] = useState<{ first_name?: string; last_name?: string; trades?: string } | null>(null);

    const [alertTrialStartedAt, setAlertTrialStartedAt] = useState<string | null>(null);

    const fetchProfile = async (uid: string) => {
        const { data } = await supabase
            .from("profiles")
            .select("plan, alert_trial_started_at")
            .eq("id", uid)
            .maybeSingle();
        const plan = data?.plan ?? 'free';
        setUserPlan(plan);
        setAlertTrialStartedAt((data as { alert_trial_started_at?: string | null } | null)?.alert_trial_started_at ?? null);
    };

    const loadUserAlerts = async (uid: string) => {
        const [alerts, events, prefs, lastNudge, connections] = await Promise.all([
            alertService.loadAlerts(uid),
            alertService.loadAlertEvents(uid, 50),
            alertService.loadNotificationPrefs(uid),
            alertService.loadLastNudgeTime(uid),
            alertService.loadUserConnections(uid),
        ]);
        setUserAlerts(alerts);
        setAlertEvents(events);
        setUserConnections(connections);
        lastNudgeAtRef.current = lastNudge;
        if (prefs) {
            setGlobalAggressiveness(prefs.global_aggressiveness);
            setEmailEnabled(prefs.email_enabled);
            setDiscordEnabled(prefs.discord_enabled);
            setTelegramEnabled(prefs.telegram_enabled);
            setNudgeEnabled(prefs.nudge_enabled);
            setNudgeFrequency(prefs.nudge_frequency);
            setNudgeTime(prefs.nudge_time);
            latestPrefsRef.current = { ...prefs };
        }
    };

    useEffect(() => {
        const handleUser = (user: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => {
            const uid = user.id;
            setUserId(uid);
            fetchProfile(uid);
            loadUserAlerts(uid);
            setUserEmail(user.email ?? '');
            setUserMeta(user.user_metadata ?? null);
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session) {
                window.location.href = '/index.html';
                return;
            }
            handleUser(session.user);
        });
        // Use getUser() for fresh metadata from the server (not cached JWT)
        supabase.auth.getUser().then(({ data: { user }, error }) => {
            if (error || !user) {
                supabase.auth.signOut().catch(() => {});
                window.location.href = '/index.html';
                return;
            }
            handleUser(user);
        });
        return () => subscription.unsubscribe();
    }, []);

    // ─── Poll Alert Events (60s) ───
    useEffect(() => {
        if (!userId) return;

        const pollEvents = async () => {
            const freshEvents = await alertService.loadAlertEvents(userId, 50);
            setAlertEvents(freshEvents);
        };

        // Run first poll after a short delay (let initial data settle)
        const initialTimeout = setTimeout(pollEvents, 3000);
        const interval = setInterval(pollEvents, 60_000);
        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        };
    }, [userId]);

    // ─── Load Watchlists from Supabase ───
    useEffect(() => {
        if (!userId) return;
        (async () => {
            try {
                let lists = await watchlistService.loadWatchlists(userId);
                if (lists.length === 0) {
                    // First-time user: create a default watchlist
                    const id = await watchlistService.createWatchlist(userId, 'My Watchlist', 0);
                    lists = [{ id, name: 'My Watchlist', assets: [] }];
                }
                setWatchlists(lists);
                setActiveWatchlistId(lists[0].id);
                // Hydrate with live scores
                watchlistService.hydrateWatchlistScores(lists, setWatchlists);
            } catch (err) {
                console.error('Failed to load watchlists:', err);
            }
        })();
    }, [userId]);

    // ─── Alert Handlers (Supabase-backed) ───
    // Mutation errors (including tier-gate 402/403) are surfaced via window.alert
    // and optimistic UI state is rolled back to the pre-mutation snapshot.
    const reportMutationError = (action: string, err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to ${action}:`, err);
        window.alert(`${action} failed: ${msg}`);
    };

    const handleCreateAlert = async (data: Omit<Alert, 'id' | 'user_id' | 'last_triggered_at' | 'last_score' | 'created_at'>) => {
        if (!userId) return;
        try {
            const newAlert = await alertService.createAlert(userId, data);
            setUserAlerts(prev => [newAlert, ...prev]);
        } catch (err) {
            reportMutationError('create alert', err);
        }
    };

    const handleUpdateAlert = async (updated: Alert) => {
        const prev = userAlerts;
        setUserAlerts(prev.map(a => a.id === updated.id ? updated : a));
        try {
            await alertService.updateAlert(updated);
        } catch (err) {
            setUserAlerts(prev);
            reportMutationError('update alert', err);
        }
    };

    const handleToggleAlert = async (id: string, active: boolean) => {
        const prev = userAlerts;
        setUserAlerts(prev.map(a => a.id === id ? { ...a, is_active: active } : a));
        try {
            await alertService.toggleAlert(id, active);
        } catch (err) {
            setUserAlerts(prev);
            reportMutationError('toggle alert', err);
        }
    };

    const handleDeleteAlert = async (id: string) => {
        const prev = userAlerts;
        setUserAlerts(prev.filter(a => a.id !== id));
        try {
            await alertService.deleteAlert(id);
        } catch (err) {
            setUserAlerts(prev);
            reportMutationError('delete alert', err);
        }
    };

    const handleMarkEventRead = async (id: string) => {
        setAlertEvents(prev => prev.map(e => e.id === id ? { ...e, read: true } : e));
        await alertService.markEventRead(id);
    };

    const handleMarkAllEventsRead = async () => {
        if (!userId) return;
        setAlertEvents(prev => prev.map(e => ({ ...e, read: true })));
        await alertService.markAllEventsRead(userId);
    };

    const handleDismissEvent = async (id: string) => {
        setAlertEvents(prev => prev.map(e => e.id === id ? { ...e, dismissed: true } : e));
        await alertService.dismissEvent(id);
    };

    // ─── Nudge Preference Handlers ───
    const handleNudgeEnabledChange = async (enabled: boolean) => {
        setNudgeEnabled(enabled);
        if (userId) {
            await updateNotificationPrefs({ nudge_enabled: enabled });
        }
    };

    const handleNudgeFrequencyChange = async (freq: NudgeFrequency) => {
        setNudgeFrequency(freq);
        if (userId) {
            await updateNotificationPrefs({ nudge_frequency: freq });
        }
    };

    const handleNudgeTimeChange = async (time: string) => {
        setNudgeTime(time);
        if (userId) {
            await updateNotificationPrefs({ nudge_time: time });
        }
    };

    // ─── Notification Channel Handlers ───
    const handleChangeGlobalAggressiveness = (value: Aggressiveness) => {
        setGlobalAggressiveness(value);
        if (!userId) return;
        // Debounce DB writes for rapid slider drags
        if (aggressivenessDebounceRef.current) clearTimeout(aggressivenessDebounceRef.current);
        aggressivenessDebounceRef.current = setTimeout(() => {
            updateNotificationPrefs({ global_aggressiveness: value });
        }, 500);
    };

    const handleEmailEnabledChange = async (enabled: boolean) => {
        setEmailEnabled(enabled);
        if (userId) {
            await updateNotificationPrefs({ email_enabled: enabled });
        }
    };

    const handleDiscordEnabledChange = async (enabled: boolean) => {
        setDiscordEnabled(enabled);
        if (userId) {
            buildPrefs({ discord_enabled: enabled });
            try {
                await updateNotificationPrefs({ discord_enabled: enabled });
            } catch (err) {
                console.error('Failed to update discord pref:', err);
            }
        }
    };

    const handleTelegramEnabledChange = async (enabled: boolean) => {
        setTelegramEnabled(enabled);
        if (userId) {
            buildPrefs({ telegram_enabled: enabled });
            try {
                await updateNotificationPrefs({ telegram_enabled: enabled });
            } catch (err) {
                console.error('Failed to update telegram pref:', err);
            }
        }
    };

    const handleConnectionComplete = async (provider: string) => {
        if (!userId) return;
        const connections = await alertService.loadUserConnections(userId);
        setUserConnections(connections);
        // Auto-enable the channel that was just connected
        if (provider === 'discord') {
            setDiscordEnabled(true);
            buildPrefs({ discord_enabled: true });
            try { await updateNotificationPrefs({ discord_enabled: true }); } catch (err) { console.error(err); }
        } else if (provider === 'telegram') {
            setTelegramEnabled(true);
            buildPrefs({ telegram_enabled: true });
            try { await updateNotificationPrefs({ telegram_enabled: true }); } catch (err) { console.error(err); }
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };

    // ─── Watchlist State ───
    const [watchlists, setWatchlists] = useState<WatchlistGroup[]>([]);
    const [activeWatchlistId, setActiveWatchlistId] = useState<string>('');
    const [watchlistSearch, setWatchlistSearch] = useState('');
    const [isWatchlistSearchFocused, setIsWatchlistSearchFocused] = useState(false);
    const [recentlyAddedSymbol, setRecentlyAddedSymbol] = useState<string | null>(null);
    const [loadingSymbols, setLoadingSymbols] = useState<Set<string>>(new Set());
    const [editingTabId, setEditingTabId] = useState<string | null>(null);
    const [editingTabName, setEditingTabName] = useState('');
    const [watchlistAddedMsg, setWatchlistAddedMsg] = useState<string | null>(null);
    const watchlistSearchRef = useRef<HTMLInputElement>(null);

    const activeWatchlist = watchlists.find(w => w.id === activeWatchlistId) || watchlists[0] || { id: '', name: 'My Watchlist', assets: [] };

    const watchlistSearchResults = watchlistSearch.length >= 1
        ? SEARCHABLE_POOL.filter(a =>
            !activeWatchlist.assets.some(existing => existing.symbol === a.symbol) &&
            (a.symbol.toLowerCase().includes(watchlistSearch.toLowerCase()) ||
                a.name.toLowerCase().includes(watchlistSearch.toLowerCase()))
        ).slice(0, 5)
        : [];

    const maxWatchlists = ent?.entitlements.maxWatchlists ?? Number.POSITIVE_INFINITY;
    const maxTickersPerWatchlist = ent?.entitlements.maxTickersPerWatchlist ?? Number.POSITIVE_INFINITY;
    const atWatchlistCap = watchlists.length >= maxWatchlists;
    const activeWatchlistAssetCount = watchlists.find(w => w.id === activeWatchlistId)?.assets.length ?? 0;
    const atTickerPerListCap = activeWatchlistAssetCount >= maxTickersPerWatchlist;

    const addAssetToWatchlist = (asset: Asset) => {
        if (!activeWatchlistId) return;
        if (atTickerPerListCap) {
            window.alert(`This watchlist is at its ${maxTickersPerWatchlist}-ticker limit. Upgrade to add more.`);
            return;
        }
        const listIdAtCall = activeWatchlistId;

        setWatchlists(prev => prev.map(wl =>
            wl.id === listIdAtCall
                ? { ...wl, assets: [...wl.assets, asset] }
                : wl
        ));
        setRecentlyAddedSymbol(asset.symbol);
        setLoadingSymbols(prev => new Set(prev).add(asset.symbol));
        setTimeout(() => setRecentlyAddedSymbol(null), 600);

        // Persist to Supabase. On failure, roll back the optimistic insert and surface the error.
        watchlistService.addAsset(listIdAtCall, asset.symbol, asset.name).catch((err) => {
            setWatchlists(prev => prev.map(wl =>
                wl.id === listIdAtCall
                    ? { ...wl, assets: wl.assets.filter(a => a.symbol !== asset.symbol) }
                    : wl
            ));
            reportMutationError('add asset to watchlist', err);
        });

        // Fetch live score if not already set
        if (!asset.score && isSupported(asset.symbol)) {
            getRemiScore(asset.symbol).then((result) => {
                setWatchlists(prev => prev.map(wl =>
                    wl.id === activeWatchlistId
                        ? {
                            ...wl, assets: wl.assets.map(a =>
                                a.symbol === asset.symbol
                                    ? { ...a, score: result.score, price: result.price, change: result.change, sentiment: result.sentiment }
                                    : a
                            )
                        }
                        : wl
                ));
                setLoadingSymbols(prev => {
                    const next = new Set(prev);
                    next.delete(asset.symbol);
                    return next;
                });
            }).catch(() => {
                setLoadingSymbols(prev => {
                    const next = new Set(prev);
                    next.delete(asset.symbol);
                    return next;
                });
            });
        } else {
            setTimeout(() => {
                setLoadingSymbols(prev => {
                    const next = new Set(prev);
                    next.delete(asset.symbol);
                    return next;
                });
            }, 2000);
        }

        setWatchlistSearch('');
        watchlistSearchRef.current?.blur();
    };

    const removeAssetFromWatchlist = (symbol: string) => {
        if (!activeWatchlistId) return;
        const listIdAtCall = activeWatchlistId;
        const snapshot = watchlists;
        setWatchlists(prev => prev.map(wl =>
            wl.id === listIdAtCall
                ? { ...wl, assets: wl.assets.filter(a => a.symbol !== symbol) }
                : wl
        ));
        watchlistService.removeAsset(listIdAtCall, symbol).catch((err) => {
            setWatchlists(snapshot);
            reportMutationError('remove asset from watchlist', err);
        });
    };

    const createNewWatchlist = async () => {
        if (!userId) return;
        if (atWatchlistCap) {
            window.alert(`You've reached your ${maxWatchlists}-watchlist limit. Upgrade for more.`);
            return;
        }
        const position = watchlists.length;
        try {
            const id = await watchlistService.createWatchlist(userId, 'Untitled', position);
            setWatchlists(prev => [...prev, { id, name: '', assets: [] }]);
            setActiveWatchlistId(id);
            setEditingTabId(id);
            setEditingTabName('');
        } catch (err) {
            reportMutationError('create watchlist', err);
        }
    };

    const finishEditingTab = () => {
        if (editingTabId) {
            const name = editingTabName.trim() || 'Untitled';
            const targetId = editingTabId;
            const snapshot = watchlists;
            setWatchlists(prev => prev.map(wl =>
                wl.id === targetId ? { ...wl, name } : wl
            ));
            watchlistService.renameWatchlist(targetId, name).catch((err) => {
                setWatchlists(snapshot);
                reportMutationError('rename watchlist', err);
            });
            setEditingTabId(null);
            setEditingTabName('');
        }
    };

    const deleteWatchlist = (id: string) => {
        if (watchlists.length <= 1) return;
        const snapshot = watchlists;
        const prevActive = activeWatchlistId;
        setWatchlists(prev => prev.filter(wl => wl.id !== id));
        if (activeWatchlistId === id) setActiveWatchlistId(watchlists[0].id);
        watchlistService.deleteWatchlist(id).catch((err) => {
            setWatchlists(snapshot);
            setActiveWatchlistId(prevActive);
            reportMutationError('delete watchlist', err);
        });
    };

    // Search State

    // REMi Scan State
    const [remiScanState, setRemiScanState] = useState<
        "intro" | "welcome" | "idle" | "analyzing" | "complete"
    >("intro");
    const hasPlayedIntro = useRef(false); // Track if intro has played this session using Ref to avoid re-renders
    const [searchQuery, setSearchQuery] = useState("");
    const [searchSuggestions, setSearchSuggestions] = useState<CatalogEntry[]>([]);
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionsLoading, setSuggestionsLoading] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const geckoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [searchStatus, setSearchStatus] = React.useState<"idle" | "analyzing" | "complete">("idle"); // Kept for compatibility with existing render logic, but controlled by remiScanState effectively
    // Refresh entitlements (daily lookups remaining) after a score lookup completes
    useEffect(() => {
        if (searchStatus === "complete") {
            refreshEntitlements().catch(() => {});
        }
    }, [searchStatus]);
    const [searchStep, setSearchStep] = useState(0);
    const [isFilling, setIsFilling] = useState(false);
    const [searchResult, setSearchResult] = useState<Asset | null>(null);
    const [liveScore, setLiveScore] = useState<number>(50);
    const [scoreFailed, setScoreFailed] = useState(false);
    const pendingScore = useRef<Promise<RemiScoreResult> | null>(null);
    const [scanHistory, setScanHistory] = useState<{symbol: string, timestamp: number}[]>([]);

    const isIntroSequence =
        currentView === ViewType.SEARCH &&
        (remiScanState === "intro" || remiScanState === "welcome");

    useEffect(() => {
        if (currentView === ViewType.SEARCH) {
            // If a search is already complete, do not reset it
            if (searchStatus === "complete") {
                return;
            }

            // If intro already played, skip straight to idle
            if (hasPlayedIntro.current) {
                setRemiScanState("idle");
                setSearchQuery("");
                setSearchResult(null);
                return;
            }

            // Reset to intro when entering search view first time
            setRemiScanState("intro");
            setSearchQuery("");
            setSearchResult(null);

            // Sequence: Intro (6s total) -> Welcome (rotate in) -> Idle (search bar fade in)
            const timer1 = setTimeout(() => setRemiScanState("welcome"), 6000);
            const timer2 = setTimeout(() => {
                setRemiScanState("idle");
                hasPlayedIntro.current = true;
            }, 7000);

            return () => {
                clearTimeout(timer1);
                clearTimeout(timer2);
            };
        }
    }, [currentView]);

    const handleSearchInput = (value: string) => {
        if (flashingRef.current) return; // Don't overwrite during flash animation
        setSearchQuery(value);
        setSelectedSuggestionIndex(-1);

        if (geckoDebounceRef.current) clearTimeout(geckoDebounceRef.current);

        if (value.trim().length > 0) {
            const staticResults = searchCatalog(value);
            const needsAsync = value.trim().length >= 2 && staticResults.length < 4;

            if (needsAsync) {
                // Show skeleton while we wait for all sources
                setSearchSuggestions([]);
                setSuggestionsLoading(true);
                setShowSuggestions(true);

                geckoDebounceRef.current = setTimeout(async () => {
                    const remaining = 6 - staticResults.length;
                    const [binanceResults, dexResults] = await Promise.all([
                        searchBinance(value, remaining),
                        searchGeckoTerminal(value, Math.min(remaining, 2)),
                    ]);
                    const combined = [...binanceResults, ...dexResults];
                    const existing = new Set(staticResults.map(e => e.symbol));
                    const newEntries = combined.filter(d => !existing.has(d.symbol));
                    setSearchSuggestions([...staticResults, ...newEntries].slice(0, 6));
                    setSuggestionsLoading(false);
                }, 300);
            } else {
                // Enough static results, show immediately
                setSearchSuggestions(staticResults);
                setSuggestionsLoading(false);
                setShowSuggestions(true);
            }
        } else {
            setSearchSuggestions([]);
            setSuggestionsLoading(false);
            setShowSuggestions(false);
        }
    };

    const flashingRef = useRef(false);

    const selectSuggestion = (entry: CatalogEntry, flash = false) => {
        if (flash) {
            // Briefly show "Name ($SYMBOL)" in the input, highlight the top suggestion, then trigger search
            flashingRef.current = true;
            const idx = searchSuggestions.findIndex(s => s.symbol === entry.symbol);
            setSelectedSuggestionIndex(idx >= 0 ? idx : 0);
            setSearchQuery(`${entry.name} ($${entry.symbol})`);
            setTimeout(() => {
                flashingRef.current = false;
                setSearchQuery(entry.symbol);
                setShowSuggestions(false);
                setSearchSuggestions([]);
                handleSmartSearch(entry.symbol);
            }, 500);
        } else {
            setSearchQuery(entry.symbol);
            setShowSuggestions(false);
            setSearchSuggestions([]);
            handleSmartSearch(entry.symbol);
        }
    };

    const handleSmartSearch = (overrideSymbol?: string) => {
        const symbol = overrideSymbol || searchQuery.trim();
        if (!symbol) return;

        setShowSuggestions(false);
        setSearchSuggestions([]);
        // Kick off the score fetch here (the user action), NOT in an effect —
        // React.StrictMode double-invokes effects in dev, which caused every
        // scan to consume 2 daily lookups instead of 1.
        pendingScore.current = getRemiScore(symbol.toUpperCase());
        setSearchStatus("analyzing");

        // Delay unmounting the DOM node by 500ms so CSS exit animations can physically render
        setTimeout(() => {
            setRemiScanState("analyzing");
        }, 500);
    };

    const cancelAnalysis = () => {
        pendingScore.current = null;
        setSearchStatus("idle");
        setRemiScanState("idle");
        setSearchStep(0);
        setIsFilling(false);
        setSearchResult(null);
        setSearchQuery("");
    };

    const addSearchResultToWatchlist = () => {
        if (!searchResult) return;
        addAssetToWatchlist(searchResult);
        setWatchlistAddedMsg(`${searchResult.symbol} added to watchlist`);
        setTimeout(() => setWatchlistAddedMsg(null), 2500);
    };

    useEffect(() => {
        document.body.className = theme === "light" ? "light-theme" : "dark-theme";
    }, [theme]);

    // Step durations (ms) — intentionally irregular to feel like real async work
    const STEP_DURATIONS = [3500, 2800, 1500, 3400, 3100, 1700, 1300];

    useEffect(() => {
        if (searchStatus === "analyzing") {
            setSearchStep(0);
            const fillTimer = setTimeout(() => setIsFilling(true), 50);

            // Cumulative offsets built from irregular durations
            const t1 = setTimeout(() => setSearchStep(1), 3500); // 3.5s
            const t2 = setTimeout(() => setSearchStep(2), 6300); // +2.8s
            const t3 = setTimeout(() => setSearchStep(3), 7800); // +1.5s
            const t4 = setTimeout(() => setSearchStep(4), 11200); // +3.4s (longest stall)
            const t5 = setTimeout(() => setSearchStep(5), 14300); // +3.1s → Finalizing (bar crawls to 99%)
            const t6 = setTimeout(() => setSearchStep(6), 16000); // +1.7s → Done (bar snaps to 100%)
            const t7 = setTimeout(() => setSearchStep(7), 17300); // +1.3s → complete

            return () => {
                clearTimeout(fillTimer);
                clearTimeout(t1);
                clearTimeout(t2);
                clearTimeout(t3);
                clearTimeout(t4);
                clearTimeout(t5);
                clearTimeout(t6);
                clearTimeout(t7);
            };
        } else {
            setIsFilling(false);
        }
    }, [searchStatus]);

    useEffect(() => {
        if (searchStep === 7 && searchStatus === "analyzing") {
            const querySymbol = searchQuery.trim().toUpperCase() || "BTC";

            const finalize = (result?: RemiScoreResult) => {
                setScanHistory(prev => [{ symbol: querySymbol, timestamp: Date.now() }, ...prev]);
                if (result) {
                    setScoreFailed(false);
                    setLiveScore(result.score);
                    setSearchResult({
                        symbol: result.symbol,
                        name: result.name,
                        price: result.price,
                        change: result.change,
                        sentiment: result.score >= 70 ? "High Probability Setup" : result.sentiment,
                        color: result.color,
                        score: result.score,
                    });
                } else {
                    // Fallback for unsupported symbols — show failed state
                    setScoreFailed(true);
                    setLiveScore(0);
                    setSearchResult({
                        symbol: querySymbol,
                        name: getDisplayName(querySymbol),
                        price: "—",
                        change: "—",
                        sentiment: "Hold",
                        color: "slate-400",
                        score: 0,
                    });
                }
                setSearchStatus("complete");
            };

            if (pendingScore.current) {
                pendingScore.current
                    .then((result) => finalize(result))
                    .catch((err) => {
                        console.warn("REMi score fetch failed:", err);
                        finalize();
                    });
            } else {
                finalize();
            }
        }
    }, [searchStep, searchStatus]);

    const baseTileClasses = `border cursor-default glass-panel ${theme === "light" ? "border-black/5 shadow-sm" : "border-[#27273a]"}`;

    return (
        <div className="flex h-screen w-screen bg-transparent text-sm overflow-hidden selection:bg-blue-500/30">
            {/* SIDEBAR */}
            <aside
                className={`transition-all duration-500 ease-in-out hidden md:flex relative border-r flex-col items-center py-6 gap-8 shrink-0 z-50 backdrop-blur-md ${isSidebarExpanded ? "w-64" : "w-[72px]"} ${theme === "light" ? "bg-white border-slate-200" : "bg-black/40 border-[#27273a]"} ${isIntroSequence ? "opacity-0" : "animate-sidebar-sequence"}`}
            >
                {/* EXPAND TOGGLE */}
                <button
                    onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
                    className={`absolute -right-3 top-24 w-6 h-6 rounded-full border flex items-center justify-center transition-colors z-50 ${theme === "light" ? "bg-white border-slate-200 text-slate-500 hover:text-blue-600" : "bg-[#1a1a24] border-[#27273a] text-gray-400 hover:text-white"}`}
                >
                    {isSidebarExpanded ? (
                        <ChevronLeft size={12} />
                    ) : (
                        <ChevronRight size={12} />
                    )}
                </button>

                <div
                    onClick={() => setCurrentView(ViewType.SEARCH)}
                    className="w-full flex justify-center cursor-pointer hover:scale-105 transition-transform"
                >
                    <img
                        src="assets/landing/logos/remi-text-logo.png"
                        alt="REMi"
                        className={`transition-all duration-300 object-contain ${isSidebarExpanded ? "w-32" : "w-12"} h-auto ${theme === "dark" ? "brightness-0 invert" : "brightness-0"}`}
                    />
                </div>

                {(isOwner || isFoundingMember) && (
                    <div className={`w-full flex flex-col items-center gap-1.5 transition-all duration-300 ${isSidebarExpanded ? "px-4" : "px-1"}`}>
                        {isSidebarExpanded ? (
                            <>
                                {isOwner && <OwnerBadge variant="pill" theme={theme} />}
                                {isFoundingMember && <FoundingBadge variant="pill" theme={theme} />}
                            </>
                        ) : (
                            <>
                                {isOwner && <OwnerBadge variant="icon" theme={theme} />}
                                {isFoundingMember && <FoundingBadge variant="icon" theme={theme} />}
                            </>
                        )}
                    </div>
                )}

                <nav className="flex flex-col gap-3 w-full px-2">
                    {[
                        { id: ViewType.SEARCH, icon: Search, label: "REMi Score" },
                        { id: ViewType.WATCHLIST, icon: List, label: "Watchlist" },
                        { id: ViewType.ALERTS, icon: Bell, label: "Alerts" },
                        ...(isOwner ? [{ id: ViewType.OWNER, icon: Terminal, label: "Engine" }] : []),
                    ].map((item) => (
                        <div
                            key={item.id}
                            onClick={() => {
                                if (item.id === ViewType.SEARCH && currentView === ViewType.SEARCH) {
                                    setRemiScanState("idle");
                                    setSearchStatus("idle");
                                    setSearchQuery("");
                                    setSearchResult(null);
                                    setSearchStep(0);
                                    setIsFilling(false);
                                } else {
                                    setCurrentView(item.id);
                                }
                            }}
                            className={`group relative w-full flex items-center p-2.5 rounded-xl cursor-pointer transition-all duration-500 overflow-hidden ${isSidebarExpanded ? "justify-start px-4 gap-3" : "justify-center gap-0"} ${currentView === item.id ? (theme === "light" ? "bg-blue-50 text-blue-600" : "bg-white/5 text-white") : theme === "light" ? "text-slate-400 hover:text-slate-600 hover:bg-slate-50" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"}`}
                        >
                            {/* Active Indicator - Bar on left for collapsed, or full bg for expanded */}
                            {!isSidebarExpanded && (
                                <div
                                    className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full transition-opacity bg-blue-500 ${currentView === item.id ? "opacity-100" : "opacity-0"}`}
                                />
                            )}

                            <item.icon
                                size={20}
                                strokeWidth={currentView === item.id ? 2.5 : 1.8}
                                className="shrink-0 transition-transform duration-300 group-hover:scale-110"
                            />

                            <span
                                className={`text-sm font-bold whitespace-nowrap overflow-hidden transition-all duration-500 ${isSidebarExpanded ? "opacity-100 max-w-[150px]" : "opacity-0 max-w-0"}`}
                            >
                                {item.label}
                            </span>
                        </div>
                    ))}
                </nav>

                {/* Profile Button (bottom of sidebar) */}
                <div
                    onClick={() => setCurrentView(ViewType.PROFILE)}
                    className={`mt-auto mb-2 group relative w-full flex items-center p-2.5 rounded-xl cursor-pointer transition-all duration-500 overflow-hidden ${isSidebarExpanded ? "justify-start px-4 gap-3" : "justify-center gap-0"} ${currentView === ViewType.PROFILE ? (theme === "light" ? "bg-blue-50 text-blue-600" : "bg-white/5 text-white") : theme === "light" ? "text-slate-400 hover:text-slate-600 hover:bg-slate-50" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"}`}
                >
                    {!isSidebarExpanded && (
                        <div className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full transition-opacity bg-blue-500 ${currentView === ViewType.PROFILE ? "opacity-100" : "opacity-0"}`} />
                    )}
                    <User size={20} strokeWidth={currentView === ViewType.PROFILE ? 2.5 : 1.8} className="shrink-0 transition-transform duration-300 group-hover:scale-110" />
                    <span className={`text-sm font-bold whitespace-nowrap overflow-hidden transition-all duration-500 ${isSidebarExpanded ? "opacity-100 max-w-[150px]" : "opacity-0 max-w-0"}`}>
                        My Account
                    </span>
                </div>

                {/* Theme Toggle (Bottom of Sidebar) */}
                <div
                    className={`mb-4 p-1 rounded-full border flex items-center gap-1 transition-all duration-300 ${isSidebarExpanded ? "flex-row" : "flex-col"} ${theme === "light" ? "bg-slate-100 border-slate-200" : "bg-white/5 border-white/10"}`}
                >
                    <button
                        onClick={() => setTheme("light")}
                        className={`p-2 rounded-full transition-all ${theme === "light" ? "bg-white text-slate-900 shadow-sm" : "text-gray-400 hover:text-gray-300"}`}
                    >
                        <Sun size={18} />
                    </button>
                    <button
                        onClick={() => setTheme("dark")}
                        className={`p-2 rounded-full transition-all ${theme === "dark" ? "bg-[#27273a] text-white shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                    >
                        <Moon size={18} />
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                {/* Mobile Header */}
                <div
                    className={`md:hidden flex items-center justify-between p-4 border-b sticky top-0 z-50 backdrop-blur-md ${theme === "light" ? "bg-white/80 border-slate-200" : "bg-black/40 border-[#27273a]"} ${isIntroSequence ? "opacity-0" : "opacity-100"}`}
                >
                    <div className="flex items-center justify-center">
                        <img
                            src="assets/landing/logos/remi-text-logo.png"
                            alt="REMi"
                            className={`h-8 w-auto object-contain ${theme === "dark" ? "brightness-0 invert" : "brightness-0"}`}
                        />
                    </div>
                    <button
                        className={`transition-colors ${theme === "light" ? "text-slate-500 hover:text-slate-700" : "text-gray-400 hover:text-white"}`}
                        onClick={() => setIsMobileMenuOpen(true)}
                    >
                        <List size={24} />
                    </button>
                </div>

                {/* Mobile Menu Overlay */}
                {isMobileMenuOpen && (
                    <div
                        className={`fixed inset-0 z-[100] md:hidden flex flex-col transition-colors duration-500 ${theme === "light" ? "bg-white/95 text-slate-900" : "bg-[#0a0a0c]/95 text-white"} backdrop-blur-xl`}
                    >
                        <div
                            className={`flex items-center justify-between p-4 border-b ${theme === "light" ? "border-slate-200" : "border-[#27273a]"}`}
                        >
                            <div className="flex items-center justify-center">
                                <img
                                    src="assets/landing/logos/remi-text-logo.png"
                                    alt="REMi"
                                    className={`h-8 w-auto object-contain ${theme === "dark" ? "brightness-0 invert" : "brightness-0"}`}
                                />
                            </div>
                            <button
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={`p-2 rounded-full transition-colors ${theme === "light" ? "hover:bg-slate-100 text-slate-500 hover:text-slate-700" : "hover:bg-white/10 text-gray-400 hover:text-white"}`}
                            >
                                <X size={24} />
                            </button>
                        </div>
                        <nav className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                            {[
                                { id: ViewType.SEARCH, icon: Search, label: "REMi Score" },
                                { id: ViewType.WATCHLIST, icon: List, label: "Watchlist" },
                                { id: ViewType.ALERTS, icon: Bell, label: "Alerts" },
                                ...(isOwner ? [{ id: ViewType.OWNER, icon: Terminal, label: "Engine" }] : []),
                            ].map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => {
                                        if (item.id === ViewType.SEARCH && currentView === ViewType.SEARCH) {
                                            setRemiScanState("idle");
                                            setSearchStatus("idle");
                                            setSearchQuery("");
                                            setSearchResult(null);
                                            setSearchStep(0);
                                            setIsFilling(false);
                                        } else {
                                            setCurrentView(item.id);
                                        }
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className={`w-full flex items-center p-4 rounded-xl transition-all duration-300 gap-4 font-bold ${currentView === item.id ? (theme === "light" ? "bg-blue-50 text-blue-600" : "bg-white/5 text-white") : theme === "light" ? "text-slate-500 hover:bg-slate-50" : "text-gray-400 hover:bg-white/5"}`}
                                >
                                    <item.icon
                                        size={24}
                                        strokeWidth={currentView === item.id ? 2.5 : 2}
                                        className="shrink-0 transition-transform duration-300 group-hover:scale-110"
                                    />
                                    <span className="text-lg">{item.label}</span>
                                    {currentView === item.id && (
                                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500" />
                                    )}
                                </button>
                            ))}
                        </nav>
                        <div
                            className={`p-6 border-t ${theme === "light" ? "border-slate-200" : "border-[#27273a]"} flex flex-col items-center gap-4`}
                        >
                            {(isOwner || isFoundingMember) && <>
                                {isOwner && <OwnerBadge variant="pill" theme={theme} />}
                                {isFoundingMember && <FoundingBadge variant="pill" theme={theme} />}
                            </>}
                            <button
                                onClick={() => { setCurrentView(ViewType.PROFILE); setIsMobileMenuOpen(false); }}
                                className={`w-full flex items-center justify-center gap-3 p-3 rounded-xl transition-all font-bold ${currentView === ViewType.PROFILE ? (theme === "light" ? "bg-blue-50 text-blue-600" : "bg-white/5 text-white") : theme === "light" ? "text-slate-500 hover:bg-slate-50" : "text-gray-400 hover:bg-white/5"}`}
                            >
                                <User size={20} />
                                <span>My Account</span>
                            </button>
                            <div
                                className={`flex items-center p-1 rounded-full border ${theme === "light" ? "bg-slate-100 border-slate-200" : "bg-white/5 border-white/10"}`}
                            >
                                <button
                                    onClick={() => setTheme("light")}
                                    className={`p-2 rounded-full transition-all ${theme === "light" ? "bg-white text-slate-900 shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
                                >
                                    <Sun size={20} />
                                </button>
                                <button
                                    onClick={() => setTheme("dark")}
                                    className={`p-2 rounded-full transition-all ${theme === "dark" ? "bg-[#27273a] text-white shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                                >
                                    <Moon size={20} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
                    {/* View Content */}
                    <div className="max-w-[1600px] mx-auto p-4 md:p-8 space-y-6 md:space-y-8">
                        {currentView === ViewType.SEARCH && (
                            <div
                                className={`flex-1 p-8 overflow-y-auto no-scrollbar relative font-display flex flex-col`}
                            >
                                {/* Background Grid Effect for Search View - Hidden in Light Mode */}
                                <div
                                    className={`absolute inset-0 opacity-10 pointer-events-none ${theme === "light" ? "hidden" : "block"}`}
                                    style={{
                                        backgroundImage:
                                            "linear-gradient(#27273a 1px, transparent 1px), linear-gradient(90deg, #27273a 1px, transparent 1px)",
                                        backgroundSize: "40px 40px",
                                    }}
                                />

                                {/* Centering wrapper — viewport-height minimum so justify-center works, collapses when scorecard is showing */}
                                <div className={`flex flex-col items-center justify-center w-full ${searchStatus !== "complete" ? "min-h-[calc(100vh-4rem)] -mt-32" : ""}`}>

                                {/* Intro Text - hide when complete */}
                                {remiScanState === "intro" && searchStatus !== "complete" && (
                                    <div className="flex flex-col items-center justify-center animate-intro-sequence">
                                        <h1
                                            className={`text-4xl md:text-6xl font-display font-light tracking-wide text-center uppercase ${theme === "light" ? "text-slate-900" : "text-white"}`}
                                        >
                                            Institutional intelligence <br />
                                            <span className="font-bold text-transparent bg-clip-text animate-shimmer-text">
                                                at your fingertips
                                            </span>
                                        </h1>
                                    </div>
                                )}

                                {/* Crossfade Grid for Intro and Analyzing States */}
                                {searchStatus !== "complete" && (
                                    <div className="grid w-full items-center justify-items-center">
                                        {/* 1. Intro & Search Block */}
                                        <div
                                            className={`col-start-1 row-start-1 w-full flex flex-col items-center transition-all duration-500 ease-in-out ${searchStatus === "analyzing" ? "opacity-0 scale-95 -translate-y-4 pointer-events-none" : "opacity-100 scale-100 translate-y-0"}`}
                                        >
                                            {(remiScanState === "welcome" ||
                                                remiScanState === "idle") && (
                                                    <div className="flex flex-col items-center justify-center mb-12 relative z-20 animate-welcome-sequence">
                                                        <h1
                                                            className={`text-5xl md:text-7xl font-display font-bold tracking-tight text-center ${theme === "light" ? "text-slate-900" : "text-white"}`}
                                                        >
                                                            Welcome back,{" "}
                                                            <span className="text-blue-500">{userMeta?.first_name?.trim() || 'there'}</span>
                                                        </h1>
                                                    </div>
                                                )}

                                            {remiScanState === "idle" && (
                                                <div className="w-full max-w-xl flex flex-col items-center text-center space-y-8 relative z-30 animate-idle-sequence">
                                                    <div className="space-y-2">
                                                        <p
                                                            className={`text-xl font-medium ${theme === "light" ? "text-slate-500" : "text-gray-400"}`}
                                                        >
                                                            What project can I analyze for you?
                                                        </p>
                                                    </div>

                                                    <div className="relative w-full max-w-3xl">
                                                      <div className="relative group">
                                                        {/* Glow Effect */}
                                                        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full opacity-20 group-hover:opacity-40 transition duration-500 blur-md"></div>

                                                        {/* Search Bar Container */}
                                                        <div
                                                            className={`relative flex flex-row items-center gap-4 p-2 pl-6 rounded-full shadow-2xl transition-all ${theme === "light" ? "bg-white border border-slate-200" : "bg-[#13141b] border border-white/10"}`}
                                                        >
                                                            <input
                                                                ref={searchInputRef}
                                                                type="text"
                                                                value={searchQuery}
                                                                onChange={(e) => handleSearchInput(e.target.value)}
                                                                onFocus={() => { if (searchQuery.trim()) setShowSuggestions(true); }}
                                                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "ArrowDown" && showSuggestions && searchSuggestions.length > 0) {
                                                                        e.preventDefault();
                                                                        setSelectedSuggestionIndex(prev => Math.min(prev + 1, searchSuggestions.length - 1));
                                                                    } else if (e.key === "ArrowUp" && showSuggestions) {
                                                                        e.preventDefault();
                                                                        setSelectedSuggestionIndex(prev => Math.max(prev - 1, -1));
                                                                    } else if (e.key === "Enter") {
                                                                        if (showSuggestions && selectedSuggestionIndex >= 0 && searchSuggestions[selectedSuggestionIndex]) {
                                                                            selectSuggestion(searchSuggestions[selectedSuggestionIndex], true);
                                                                        } else if (showSuggestions && searchSuggestions.length > 0) {
                                                                            // Auto-select best match, flash name + ticker, then search
                                                                            selectSuggestion(searchSuggestions[0], true);
                                                                        } else {
                                                                            handleSmartSearch();
                                                                        }
                                                                    } else if (e.key === "Escape") {
                                                                        setShowSuggestions(false);
                                                                    }
                                                                }}
                                                                placeholder="Enter a symbol (e.g. Bitcoin, NVDA, Tesla, SOL)"
                                                                className={`flex-1 bg-transparent border-none text-left text-lg font-medium focus:outline-none focus:ring-0 ${theme === "light" ? "text-slate-900 placeholder:text-slate-400" : "text-white placeholder:text-gray-500"}`}
                                                                autoFocus
                                                                autoComplete="off"
                                                            />
                                                            <button
                                                                onClick={() => handleSmartSearch()}
                                                                disabled={!searchQuery.trim() || lookupsExhausted}
                                                                title={lookupsExhausted ? "Daily lookup limit reached — upgrade for more" : ""}
                                                                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${searchQuery.trim() && !lookupsExhausted ? "bg-gradient-to-r from-blue-500 to-emerald-500 text-white shadow-lg hover:shadow-blue-500/25 hover:scale-105" : "bg-gray-100 dark:bg-white/5 text-gray-400 cursor-not-allowed"}`}
                                                            >
                                                                <ArrowUp size={24} strokeWidth={2.5} />
                                                            </button>
                                                        </div>
                                                      </div>
                                                        {dailyLookupLimit !== null && dailyLookupsRemaining !== null && (
                                                            <div className={`text-[10px] mt-2 text-center ${theme === "light" ? "text-slate-500" : "text-gray-400"}`}>
                                                                Daily lookups remaining: {dailyLookupsRemaining}/{dailyLookupLimit}
                                                                {lookupsExhausted && (
                                                                    <> · <a href="/pricing.html?reason=daily-lookup-cap" className="underline">Upgrade</a></>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Autocomplete Dropdown */}
                                                        {showSuggestions && (suggestionsLoading || searchSuggestions.length > 0) && (
                                                            <div className={`absolute left-0 right-0 top-full mt-2 rounded-2xl border max-h-[240px] overflow-y-auto overflow-x-hidden thin-scrollbar z-50 ${theme === "light"
                                                                ? "bg-white border-slate-200 shadow-xl shadow-slate-200/60"
                                                                : "bg-[#13132a] border-white/10 shadow-2xl shadow-black/40"
                                                            }`}>
                                                                {suggestionsLoading ? (
                                                                    /* Skeleton rows while waiting for all sources */
                                                                    Array.from({ length: 3 }).map((_, i) => (
                                                                        <div key={i} className={`flex items-center gap-3 px-5 py-3 ${i > 0 ? (theme === "light" ? "border-t border-slate-100" : "border-t border-white/5") : ""}`}>
                                                                            <div className={`h-4 w-12 rounded-full ${theme === "light" ? "bg-slate-100" : "bg-white/[0.06]"} skeleton-shimmer`} />
                                                                            <div className={`h-4 w-24 rounded-lg ${theme === "light" ? "bg-slate-100" : "bg-white/[0.06]"} skeleton-shimmer`} />
                                                                            <div className={`h-4 w-14 rounded-lg ${theme === "light" ? "bg-slate-100" : "bg-white/[0.06]"} skeleton-shimmer`} />
                                                                        </div>
                                                                    ))
                                                                ) : searchSuggestions.map((entry, i) => {
                                                                    const isSelected = i === selectedSuggestionIndex;

                                                                    return (
                                                                        <div
                                                                            key={entry.symbol}
                                                                            onMouseDown={(e) => { e.preventDefault(); selectSuggestion(entry); }}
                                                                            onMouseEnter={() => setSelectedSuggestionIndex(i)}
                                                                            className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-all duration-150 ${i > 0 ? (theme === "light" ? "border-t border-slate-100" : "border-t border-white/5") : ""} ${
                                                                                isSelected
                                                                                    ? theme === "light" ? "bg-blue-50" : "bg-white/[0.06]"
                                                                                    : theme === "light" ? "hover:bg-slate-50" : "hover:bg-white/[0.03]"
                                                                            }`}
                                                                        >
                                                                            <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 ${
                                                                                entry.category === "crypto"
                                                                                    ? theme === "light" ? "bg-orange-50 text-orange-500" : "bg-orange-500/10 text-orange-400"
                                                                                    : entry.category === "stock"
                                                                                    ? theme === "light" ? "bg-blue-50 text-blue-500" : "bg-blue-500/10 text-blue-400"
                                                                                    : entry.category === "metal"
                                                                                    ? theme === "light" ? "bg-slate-100 text-slate-500" : "bg-white/10 text-gray-400"
                                                                                    : entry.category === "dex"
                                                                                    ? theme === "light" ? "bg-purple-50 text-purple-500" : "bg-purple-500/10 text-purple-400"
                                                                                    : theme === "light" ? "bg-emerald-50 text-emerald-500" : "bg-emerald-500/10 text-emerald-400"
                                                                            }`}>
                                                                                {entry.category}
                                                                            </span>
                                                                            <span className={`text-sm font-semibold ${theme === "light" ? "text-slate-800" : "text-white"}`}>
                                                                                {entry.name}
                                                                            </span>
                                                                            <span className={`text-sm ${theme === "light" ? "text-slate-400" : "text-gray-500"}`}>
                                                                                ${entry.symbol}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* 2. Analyzing Block */}
                                        <div
                                            className={`col-start-1 row-start-1 w-full transition-all duration-500 ease-in-out ${searchStatus === "analyzing" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}
                                        >
                                            {searchStatus === "analyzing" && (
                                                <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto h-32 relative gap-4">
                                                    {/* Active Stage Text */}
                                                    <div className="w-full flex justify-center h-8 pointer-events-none relative">
                                                        <style>
                                                            {STEP_DURATIONS.map((dur, i) => {
                                                                const FADE = 280;
                                                                const inPct = +((FADE / dur) * 100).toFixed(2);
                                                                const outPct = +(
                                                                    100 -
                                                                    (FADE / dur) * 100
                                                                ).toFixed(2);
                                                                return `
                                                                @keyframes stepGlide${i} {
                                                                    0%        { opacity: 0; transform: translateY(-8px); }
                                                                    ${inPct}% { opacity: 1; transform: translateY(0); }
                                                                    ${outPct}% { opacity: 1; transform: translateY(0); }
                                                                    100%      { opacity: 0; transform: translateY(8px); }
                                                                }
                                                            `;
                                                            }).join("")}
                                                            {`
                                                            @keyframes stepFadeInOnly {
                                                                0%   { opacity: 0; transform: translateY(-8px); }
                                                                15%  { opacity: 1; transform: translateY(0); }
                                                                100% { opacity: 1; transform: translateY(0); }
                                                            }
                                                        `}
                                                        </style>
                                                        {[
                                                            "Fetching Market Data...",
                                                            "Adding Indicators...",
                                                            "Analyzing Chart...",
                                                            "Checking Key Levels...",
                                                            "Scoring...",
                                                            "Finalizing Confidence Score...",
                                                            "Done",
                                                        ].map((stepText, index) => {
                                                            if (searchStep !== index) return null;
                                                            const isDone = index === 6;

                                                            return (
                                                                <div
                                                                    key={index}
                                                                    className="absolute inset-x-0 mx-auto flex justify-center"
                                                                    style={{
                                                                        animation: isDone
                                                                            ? `stepFadeInOnly ${(STEP_DURATIONS[index] ?? 1000) / 1000}s linear forwards`
                                                                            : `stepGlide${index} ${(STEP_DURATIONS[index] ?? 1000) / 1000}s linear forwards`,
                                                                    }}
                                                                >
                                                                    {isDone ? (
                                                                        <span
                                                                            className={`text-md md:text-lg font-display font-bold tracking-wide ${theme === "light" ? "text-slate-900" : "text-white"}`}
                                                                        >
                                                                            {stepText}
                                                                        </span>
                                                                    ) : (
                                                                        <span
                                                                            className={`text-md md:text-lg font-display font-bold tracking-wide bg-clip-text text-transparent`}
                                                                            style={{
                                                                                backgroundSize: "800% auto",
                                                                                animation: "loading-shimmer 12s linear infinite",
                                                                                backgroundImage:
                                                                                    theme === "light"
                                                                                        ? "linear-gradient(90deg, #94a3b8 0%, #94a3b8 14%, #e2e8f0 18%, #94a3b8 22%, #94a3b8 64%, #e2e8f0 68%, #94a3b8 72%, #94a3b8 100%)"
                                                                                        : "linear-gradient(90deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.35) 14%, rgba(255,255,255,1) 18%, rgba(255,255,255,0.35) 22%, rgba(255,255,255,0.35) 64%, rgba(255,255,255,1) 68%, rgba(255,255,255,0.35) 72%, rgba(255,255,255,0.35) 100%)",
                                                                            }}
                                                                        >
                                                                            {stepText}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Linear Progress Bar container — overflow visible so sparks can escape */}
                                                    <div className="w-full relative h-1 bg-black/10 dark:bg-white/10 rounded-full shadow-inner flex items-center">
                                                        <style>
                                                            {`
                                                            @keyframes struggleFill {
                                                                0%    { width: 0%; }
                                                                15%   { width: 18%; }
                                                                30%   { width: 22%; }   /* stall */
                                                                50%   { width: 70%; }   /* sprint */
                                                                68%   { width: 85%; }   /* Scoring begins */
                                                                80%   { width: 88%; }   /* Scoring struggles */
                                                                88%   { width: 96%; }   /* Finalizing begins */
                                                                95%   { width: 99%; }   /* crawled to 99% */
                                                                99.5% { width: 99%; }   /* hold at 99% */
                                                                100%  { width: 100%; }  /* Done — snap! */
                                                            }
                                                            @keyframes spark {
                                                                0%   { opacity: 1; transform: translate(0px, 0px) scale(1); }
                                                                100% { opacity: 0; transform: translate(var(--sx), var(--sy)) scale(0); }
                                                            }
                                                            @keyframes sparkGlow {
                                                                0%   { opacity: 0; transform: scale(0.5); }
                                                                25%  { opacity: 1; transform: scale(1.4); }
                                                                100% { opacity: 0; transform: scale(0.8); }
                                                            }
                                                        `}
                                                        </style>

                                                        {/* Organic struggling fill */}
                                                        <div
                                                            className={`absolute top-0 left-0 h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full`}
                                                            style={{
                                                                width: "0%",
                                                                animation: isFilling
                                                                    ? "struggleFill 16000ms ease-in-out forwards"
                                                                    : "none",
                                                            }}
                                                        />
                                                        {/* shimmering light effect on the active fill */}
                                                        <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-transparent via-white/50 to-transparent w-full animate-[shimmer_2s_infinite] transition-all duration-700" />

                                                        {/* Spark burst at 100% — triggers when bar locks */}
                                                        {searchStep >= 6 &&
                                                            (() => {
                                                                const R = 32; // px travel distance — larger = more spread
                                                                // 5 sparks fanning upward from bar tip: 15°–75° above horizontal
                                                                const sparks = [-60, -30, 0, 30, 60].map(
                                                                    (angleDeg) => {
                                                                        const angle = (angleDeg * Math.PI) / 180;
                                                                        return {
                                                                            x: Math.round(Math.cos(angle) * R),
                                                                            y: Math.round(Math.sin(angle) * R),
                                                                        };
                                                                    },
                                                                );
                                                                return (
                                                                    <div
                                                                        className="absolute right-0 top-1/2 pointer-events-none"
                                                                        style={{ width: 0, height: 0 }}
                                                                    >
                                                                        <style>
                                                                            {sparks
                                                                                .map(
                                                                                    (s, i) => `
                                                                    @keyframes spark${i} {
                                                                        0%   { opacity: 1; transform: translate(-50%,-50%) translate(0px,0px) scale(1.2); }
                                                                        100% { opacity: 0; transform: translate(-50%,-50%) translate(${s.x}px,${s.y}px) scale(0); }
                                                                    }
                                                                `,
                                                                                )
                                                                                .join("")}
                                                                        </style>
                                                                        {sparks.map((_, i) => (
                                                                            <div
                                                                                key={i}
                                                                                className={`absolute w-1.5 h-1.5 rounded-full ${theme === 'light' ? 'bg-slate-900' : 'bg-white'}`}
                                                                                style={{
                                                                                    top: 0,
                                                                                    left: 0,
                                                                                    animation: `spark${i} 650ms ease-out 0ms forwards`,
                                                                                }}
                                                                            />
                                                                        ))}
                                                                    </div>
                                                                );
                                                            })()}
                                                    </div>

                                                    {/* Cancel button */}
                                                    <button
                                                        onClick={cancelAnalysis}
                                                        className={`mt-4 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium tracking-wide transition-all duration-200 cursor-pointer ${
                                                            theme === "light"
                                                                ? "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                                                : "text-gray-600 hover:text-gray-300 hover:bg-white/5"
                                                        }`}
                                                    >
                                                        <X size={12} />
                                                        Cancel
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                </div>{/* /Centering wrapper */}

                                {/* Scorecard Result View — outside centering wrapper so -mt-32 doesn't affect it */}
                                {searchStatus === "complete" && searchResult && (
                                    <div className="flex-1 w-full flex flex-col items-center justify-center pt-16 animate-in fade-in slide-in-from-bottom-8 duration-700">
                                        <RemiScoreCard
                                            score={liveScore}
                                            asset={searchResult}
                                            theme={theme}
                                            isFoundingMember={isFoundingMember}
                                            failed={scoreFailed}
                                            onReset={cancelAnalysis}
                                        />

                                        <div className={`flex flex-col items-center gap-3 mt-4 mb-6 ${scoreFailed ? "hidden" : ""}`}>
                                            {/* Action Buttons under scorecard */}
                                            <div className="flex flex-row items-center gap-3 md:gap-4">
                                                <button
                                                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border transition-all ${theme === "light" ? "text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900" : "text-white/50 border-white/10 hover:bg-white/5 hover:text-white hover:border-white/20"} font-medium text-sm tracking-wide`}
                                                >
                                                    <BellPlus size={16} /> Alerts
                                                </button>
                                                <button
                                                    onClick={() => addSearchResultToWatchlist()}
                                                    disabled={!!watchlistAddedMsg}
                                                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border transition-all font-medium text-sm tracking-wide ${watchlistAddedMsg
                                                        ? 'text-green-500 border-green-500/30 bg-green-500/10'
                                                        : theme === "light" ? "text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900" : "text-white/50 border-white/10 hover:bg-white/5 hover:text-white hover:border-white/20"
                                                        }`}
                                                >
                                                    {watchlistAddedMsg ? <><Check size={16} /> Added!</> : <><ListPlus size={16} /> Watchlist</>}
                                                </button>
                                                <button
                                                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border transition-all ${theme === "light" ? "text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900" : "text-white/50 border-white/10 hover:bg-white/5 hover:text-white hover:border-white/20"} font-medium text-sm tracking-wide`}
                                                >
                                                    <Share size={16} /> Share
                                                </button>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    setRemiScanState("idle");
                                                    setSearchStatus("idle");
                                                    setSearchQuery("");
                                                    setSearchResult(null);
                                                    setSearchStep(0);
                                                    setIsFilling(false);
                                                }}
                                                className={`flex items-center gap-2 px-8 py-3 mt-2 rounded-xl font-display font-medium transition-all ${theme === "light" ? "bg-slate-200 text-slate-600 hover:bg-slate-300" : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"}`}
                                            >
                                                <Search size={18} />
                                                <span>Analyze Another Asset</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}




                        {currentView === ViewType.WATCHLIST && (
                            <div className="flex-1 p-6 md:p-8 overflow-y-auto animate-in fade-in slide-in-from-right-4 duration-500 no-scrollbar">
                                <header className="mb-6 flex justify-between items-start">
                                    <h1
                                        className={`text-2xl md:text-3xl font-display font-bold flex flex-col md:flex-row md:items-center gap-1 md:gap-2 transition-colors duration-500 ${theme === "light" ? "text-slate-900" : "text-white"}`}
                                    >
                                        <span className={`${theme === "light" ? "text-slate-400" : "text-gray-500"} font-light`}>
                                            Dashboard /
                                        </span>{" "}
                                        Watchlists
                                    </h1>
                                </header>

                                {/* ─── Header: Watchlist Dropdown & Search Bar ─── */}
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 relative z-40">
                                    {/* Watchlist Dropdown */}
                                    <div className="relative group self-start sm:self-auto">
                                        <button
                                            className={`flex items-center gap-1.5 text-[12px] uppercase tracking-wider font-bold transition-colors ${theme === "light"
                                                ? "text-slate-900 hover:text-blue-600"
                                                : "text-white hover:text-blue-400"
                                                }`}
                                        >
                                            {activeWatchlist?.name || 'Untitled'}
                                            <ChevronDown size={14} className="opacity-50 transition-transform group-hover:rotate-180" />
                                        </button>

                                        {/* Dropdown Menu */}
                                        <div className={`absolute left-0 top-full mt-2 w-48 rounded-xl border overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-left ${theme === "light"
                                            ? "bg-white border-slate-200 shadow-xl shadow-slate-200/60"
                                            : "bg-[#13132a] border-white/10 shadow-2xl shadow-black/40"
                                            }`}>
                                            <div className="p-2 flex flex-col gap-1">
                                                {watchlists.map((wl) => (
                                                    <div key={wl.id} className="relative group/item flex items-center">
                                                        {editingTabId === wl.id ? (
                                                            <input
                                                                autoFocus
                                                                value={editingTabName}
                                                                onChange={(e) => setEditingTabName(e.target.value)}
                                                                onBlur={finishEditingTab}
                                                                onKeyDown={(e) => { if (e.key === 'Enter') finishEditingTab(); if (e.key === 'Escape') { deleteWatchlist(wl.id); } }}
                                                                placeholder="List name..."
                                                                className={`w-full px-2 py-1.5 rounded-lg text-[11px] font-semibold border-2 outline-none transition-all ${theme === "light"
                                                                    ? "bg-white border-blue-400 text-slate-800"
                                                                    : "bg-white/5 border-blue-500/50 text-white"
                                                                    }`}
                                                            />
                                                        ) : (
                                                            <button
                                                                onClick={() => setActiveWatchlistId(wl.id)}
                                                                onDoubleClick={() => { setEditingTabId(wl.id); setEditingTabName(wl.name); }}
                                                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200 flex items-center ${activeWatchlistId === wl.id
                                                                    ? theme === "light"
                                                                        ? "bg-blue-50 text-blue-600"
                                                                        : "bg-blue-500/10 text-blue-400"
                                                                    : theme === "light"
                                                                        ? "text-slate-600 hover:bg-slate-50"
                                                                        : "text-gray-300 hover:bg-white/5"
                                                                    }`}
                                                            >
                                                                <span className="truncate pr-3">{wl.name || 'Untitled'}</span>
                                                            </button>
                                                        )}
                                                        {/* Delete tab */}
                                                        {watchlists.length > 1 && editingTabId !== wl.id && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); deleteWatchlist(wl.id); }}
                                                                className={`absolute right-2 w-5 h-5 rounded-md flex flex-shrink-0 items-center justify-center opacity-0 group-hover/item:opacity-100 transition-all duration-200 text-xs ${theme === "light" ? "bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600" : "bg-white/10 text-gray-400 hover:bg-white/20 hover:text-gray-200"
                                                                    }`}
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}

                                                <div className={`mt-2 pt-2 border-t ${theme === "light" ? "border-slate-100" : "border-white/5"}`}>
                                                    <button
                                                        onClick={createNewWatchlist}
                                                        disabled={atWatchlistCap}
                                                        title={atWatchlistCap ? `Upgrade to create more than ${maxWatchlists} watchlists` : ''}
                                                        className={`w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-300 border border-dashed ${atWatchlistCap ? 'opacity-50 cursor-not-allowed' : ''} ${theme === "light"
                                                            ? "text-slate-500 border-slate-300 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50"
                                                            : "text-gray-400 border-white/20 hover:text-blue-400 hover:border-blue-500/50 hover:bg-blue-500/10"
                                                            }`}
                                                    >
                                                        <Plus size={12} /> Create New List
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ─── Search Bar ─── */}
                                    <div className="relative w-full sm:w-80">
                                        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all duration-300 ${isWatchlistSearchFocused
                                            ? theme === "light"
                                                ? "bg-white border-slate-300 shadow-md ring-2 ring-blue-500/10"
                                                : "bg-white/[0.04] border-white/15 shadow-md shadow-black/20 ring-2 ring-blue-500/10"
                                            : theme === "light"
                                                ? "bg-slate-50 border-slate-200 hover:border-slate-300"
                                                : "bg-white/[0.02] border-white/5 hover:border-white/10"
                                            }`}>
                                            <Search size={16} className={`flex-shrink-0 transition-colors ${isWatchlistSearchFocused
                                                ? "text-blue-500"
                                                : theme === "light" ? "text-slate-400" : "text-gray-500"
                                                }`} />
                                            <input
                                                ref={watchlistSearchRef}
                                                value={watchlistSearch}
                                                onChange={(e) => setWatchlistSearch(e.target.value)}
                                                onFocus={() => setIsWatchlistSearchFocused(true)}
                                                onBlur={() => setTimeout(() => setIsWatchlistSearchFocused(false), 200)}
                                                placeholder="Search assets to add..."
                                                className={`flex-1 min-w-0 bg-transparent text-sm font-medium outline-none placeholder:font-normal ${theme === "light" ? "text-slate-800 placeholder:text-slate-400" : "text-white placeholder:text-gray-500"
                                                    }`}
                                            />
                                            {watchlistSearch && (
                                                <button onClick={() => setWatchlistSearch('')} className={`p-0.5 rounded-full transition-colors flex-shrink-0 ${theme === "light" ? "text-slate-400 hover:text-slate-600" : "text-gray-500 hover:text-white"}`}>
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>

                                        {/* Search Results Dropdown */}
                                        {watchlistSearch && isWatchlistSearchFocused && (
                                            <div className={`absolute left-0 right-0 top-full mt-2 rounded-2xl border overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200 ${theme === "light"
                                                ? "bg-white border-slate-200 shadow-xl shadow-slate-200/60"
                                                : "bg-[#13132a] border-white/10 shadow-2xl shadow-black/40"
                                                }`}>
                                                {watchlistSearchResults.length > 0 ? (
                                                    watchlistSearchResults.map((asset, i) => {
                                                        const logo = (() => {
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
                                                            return logos[asset.symbol] || '';
                                                        })();

                                                        return (
                                                            <div
                                                                key={asset.symbol}
                                                                onClick={() => addAssetToWatchlist(asset)}
                                                                className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-all duration-200 ${i > 0 ? (theme === "light" ? "border-t border-slate-100" : "border-t border-white/5") : ""
                                                                    } ${theme === "light" ? "hover:bg-blue-50" : "hover:bg-white/5"}`}
                                                            >
                                                                {logo ? (
                                                                    <img src={logo} alt={asset.symbol} className="w-8 h-8 rounded-full" />
                                                                ) : (
                                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${theme === "light" ? "bg-slate-100 text-slate-500" : "bg-white/10 text-gray-400"}`}>
                                                                        {asset.symbol[0]}
                                                                    </div>
                                                                )}
                                                                <div className="flex-1">
                                                                    <div className={`text-sm font-bold ${theme === "light" ? "text-slate-800" : "text-white"}`}>{asset.symbol}</div>
                                                                    <div className={`text-[11px] ${theme === "light" ? "text-slate-400" : "text-gray-500"}`}>{asset.name}</div>
                                                                </div>
                                                                <div className={`text-xs font-mono ${theme === "light" ? "text-slate-500" : "text-gray-400"}`}>{asset.price}</div>
                                                                <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${theme === "light"
                                                                    ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                                                                    : "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                                                                    }`}>
                                                                    <Plus size={12} /> Add
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div className={`flex flex-col items-center py-8 ${theme === "light" ? "text-slate-400" : "text-gray-500"}`}>
                                                        <Search size={20} className="opacity-30 mb-2" />
                                                        <p className="text-xs">No matching assets found</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* ─── Two-Column Layout: Table + Sidebar ─── */}
                                <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
                                    {/* Left: Table */}
                                    <div className={`rounded-2xl overflow-hidden flex flex-col ${theme === "light" ? "bg-white shadow-md" : baseTileClasses}`}>
                                        <div>
                                            <WatchlistTable
                                                assets={activeWatchlist.assets}
                                                theme={theme}
                                                onRemove={removeAssetFromWatchlist}
                                                onAnalyze={(asset) => {
                                                    setSearchQuery(asset.symbol);
                                                    setCurrentView(ViewType.SEARCH);
                                                }}
                                                onSetAlert={(asset) => {
                                                    setAlertPrefillSymbol(asset.symbol);
                                                    setCurrentView(ViewType.ALERTS);
                                                }}
                                                recentlyAdded={recentlyAddedSymbol}
                                                loadingSymbols={loadingSymbols}
                                            />
                                        </div>

                                        {/* Discover Assets — grid tiles */}
                                        {(() => {
                                            const suggestions = SEARCHABLE_POOL.filter(
                                                a => !activeWatchlist.assets.some(existing => existing.symbol === a.symbol)
                                            );
                                            if (suggestions.length === 0) return null;

                                            const getLogo = (symbol: string) => {
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

                                            return (
                                                <div className={`border-t px-6 py-5 ${theme === "light" ? "border-slate-100" : "border-white/5"}`}>
                                                    <div className={`text-[10px] font-semibold uppercase tracking-wider mb-4 flex items-center gap-2 ${theme === "light" ? "text-slate-400" : "text-gray-500"}`}>
                                                        <Plus size={12} className="text-gray-400" /> Discover Assets
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-3">
                                                        {suggestions.slice(0, 6).map((asset) => {
                                                            const isPos = asset.change?.startsWith('+');
                                                            const logo = getLogo(asset.symbol);
                                                            return (
                                                                <div
                                                                    key={asset.symbol}
                                                                    onClick={() => addAssetToWatchlist(asset)}
                                                                    className={`group relative rounded-xl p-3 cursor-pointer transition-all duration-300 ${theme === "light"
                                                                        ? "bg-slate-50 hover:bg-blue-50 hover:shadow-sm"
                                                                        : "bg-white/[0.02] hover:bg-white/[0.05]"}`}
                                                                >
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <div className="flex items-center gap-2">
                                                                            {logo ? (
                                                                                <img src={logo} alt={asset.symbol} className="w-5 h-5 rounded-full" />
                                                                            ) : (
                                                                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${theme === "light" ? "bg-slate-200 text-slate-500" : "bg-white/10 text-gray-400"}`}>{asset.symbol[0]}</div>
                                                                            )}
                                                                            <span className={`text-xs font-bold ${theme === "light" ? "text-slate-800" : "text-white"}`}>{asset.symbol}</span>
                                                                        </div>
                                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isPos ? "text-green-600 bg-green-500/10" : "text-red-500 bg-red-500/10"}`}>
                                                                            {asset.change}
                                                                        </span>
                                                                    </div>
                                                                    <div className={`text-[10px] truncate ${theme === "light" ? "text-slate-400" : "text-gray-500"}`}>{asset.name}</div>
                                                                    {/* Mini bar chart */}
                                                                    <div className="mt-2 flex items-end gap-[2px] h-4">
                                                                        {Array.from({ length: 7 }, (_, i) => {
                                                                            const h = 4 + Math.random() * 12;
                                                                            return (
                                                                                <div
                                                                                    key={i}
                                                                                    className={`flex-1 rounded-sm transition-all duration-300 ${isPos ? "bg-green-500/30 group-hover:bg-green-500/50" : "bg-red-500/30 group-hover:bg-red-500/50"}`}
                                                                                    style={{ height: `${h}px` }}
                                                                                />
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* Right: Sidebar */}
                                    <div className="hidden lg:flex flex-col gap-5">
                                        {/* Portfolio Snapshot */}
                                        {(() => {
                                            const assets = activeWatchlist.assets;
                                            const getScore = (s: string) => ({ 'Strong Buy': 94, 'Buy': 78, 'Hold': 48, 'Sell': 24, 'Strong Sell': 12 }[s] ?? 50);
                                            const topAsset = assets.length > 0 ? [...assets].sort((a, b) => getScore(b.sentiment) - getScore(a.sentiment))[0] : null;
                                            const buyCount = assets.filter(a => a.sentiment?.includes('Buy')).length;
                                            const holdCount = assets.filter(a => a.sentiment === 'Hold').length;
                                            const sellCount = assets.filter(a => a.sentiment?.includes('Sell')).length;
                                            const total = assets.length || 1;
                                            const buyPct = Math.round((buyCount / total) * 100);
                                            const holdPct = Math.round((holdCount / total) * 100);
                                            const sellPct = Math.round((sellCount / total) * 100);

                                            return (
                                                <div className={`rounded-2xl p-5 ${theme === "light" ? "bg-white shadow-md" : baseTileClasses}`}>
                                                    <div className={`text-xs font-semibold uppercase tracking-wider mb-4 ${theme === "light" ? "text-slate-400" : "text-gray-500"}`}>
                                                        Portfolio Snapshot
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className={`rounded-xl p-3 ${theme === "light" ? "bg-slate-50" : "bg-white/[0.03]"}`}>
                                                            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${theme === "light" ? "text-slate-400" : "text-gray-500"}`}>Assets</div>
                                                            <div className={`text-2xl font-bold ${theme === "light" ? "text-slate-900" : "text-white"}`}>{assets.length}</div>
                                                        </div>
                                                        <div className={`rounded-xl p-3 ${theme === "light" ? "bg-slate-50" : "bg-white/[0.03]"}`}>
                                                            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 flex items-center justify-between group/tooltip relative ${theme === "light" ? "text-slate-400" : "text-gray-500"}`}>
                                                                Top Pick
                                                                <Info size={12} className={`cursor-help ${theme === "light" ? "text-slate-300 hover:text-slate-500" : "text-gray-600 hover:text-gray-400"} transition-colors`} />
                                                                {/* Tooltip */}
                                                                <div className={`absolute bottom-full right-0 mb-2 w-48 p-2 rounded-lg text-[10px] normal-case leading-relaxed font-normal opacity-0 pointer-events-none group-hover/tooltip:opacity-100 transition-opacity z-10 shadow-lg ${theme === "light" ? "bg-slate-800 text-slate-200" : "bg-gray-800 text-gray-300 border border-white/10"}`}>
                                                                    The asset in your watchlist with the strongest current system indicators. For informational purposes only, not financial advice.
                                                                </div>
                                                            </div>
                                                            <div className={`text-lg font-bold truncate ${theme === "light" ? "text-slate-900" : "text-white"}`}>{topAsset?.symbol ?? '—'}</div>
                                                        </div>
                                                    </div>
                                                    {/* Sentiment Split - replaces Avg Score */}
                                                    <div className={`mt-3 rounded-xl p-3 ${theme === "light" ? "bg-slate-50" : "bg-white/[0.03]"}`}>
                                                        <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${theme === "light" ? "text-slate-400" : "text-gray-500"}`}>Sentiment Split</div>
                                                        {/* Stacked bar */}
                                                        <div className="flex rounded-full overflow-hidden h-2.5 gap-0.5">
                                                            {buyPct > 0 && <div className="bg-green-500 rounded-full transition-all duration-500" style={{ width: `${buyPct}%` }} />}
                                                            {holdPct > 0 && <div className="bg-yellow-500 rounded-full transition-all duration-500" style={{ width: `${holdPct}%` }} />}
                                                            {sellPct > 0 && <div className="bg-red-500 rounded-full transition-all duration-500" style={{ width: `${sellPct}%` }} />}
                                                        </div>
                                                        <div className="flex justify-between mt-2">
                                                            <div className="flex items-center gap-1">
                                                                <div className="w-2 h-2 rounded-full bg-green-500" />
                                                                <span className={`text-[10px] font-medium ${theme === "light" ? "text-slate-500" : "text-gray-400"}`}>Buy {buyCount}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                                                                <span className={`text-[10px] font-medium ${theme === "light" ? "text-slate-500" : "text-gray-400"}`}>Hold {holdCount}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <div className="w-2 h-2 rounded-full bg-red-500" />
                                                                <span className={`text-[10px] font-medium ${theme === "light" ? "text-slate-500" : "text-gray-400"}`}>Sell {sellCount}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* History Section */}
                                        <div className={`rounded-2xl p-5 flex-1 flex flex-col min-h-0 ${theme === "light" ? "bg-white shadow-md" : baseTileClasses}`}>
                                            <div className={`text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2 ${theme === "light" ? "text-slate-400" : "text-gray-500"}`}>
                                                <Clock size={12} className="text-gray-400" /> History
                                            </div>
                                            <div className="flex flex-col gap-1 overflow-y-auto flex-1 no-scrollbar">
                                                {/* Dynamic Max/Min call history for active watchlist + Scans */}
                                                {(() => {
                                                    const now = Date.now();
                                                    
                                                    // Map algorithmic history calls
                                                    const algorithmicEntries = activeWatchlist.assets.map((asset) => {
                                                        const seed = asset.symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
                                                        const isMax = seed % 2 === 0;
                                                        const value = 15 + (seed % 80);
                                                        const timeNum = 2 + (seed % 45); // mocked minutes ago
                                                        return {
                                                            action: isMax ? 'Max call' : 'Min call',
                                                            symbol: asset.symbol,
                                                            value: value.toString(),
                                                            time: `${timeNum} min ago`,
                                                            type: isMax ? 'max' : 'min',
                                                            sortMs: now - (timeNum * 60000)
                                                        };
                                                    });

                                                    // Map scan history
                                                    const scanEntries = scanHistory.map((scan) => {
                                                        const diffMs = now - scan.timestamp;
                                                        const diffMin = Math.max(1, Math.floor(diffMs / 60000));
                                                        return {
                                                            action: 'Scanned',
                                                            symbol: scan.symbol,
                                                            value: 'REMi',
                                                            time: `${diffMin} min ago`,
                                                            type: 'scan',
                                                            sortMs: scan.timestamp
                                                        };
                                                    });

                                                    const historyEntries = [...algorithmicEntries, ...scanEntries].sort((a, b) => b.sortMs - a.sortMs);

                                                    if (historyEntries.length === 0) {
                                                        return (
                                                            <div className={`p-4 text-center text-[10px] ${theme === "light" ? "text-slate-400" : "text-gray-500"}`}>
                                                                Add assets to see algorithmic calls.
                                                            </div>
                                                        );
                                                    }

                                                    return historyEntries.map((entry) => (
                                                        <div
                                                            key={`${entry.symbol}-${entry.type}`}
                                                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${theme === "light"
                                                                ? "hover:bg-slate-50"
                                                                : "hover:bg-white/[0.03]"
                                                                }`}
                                                        >
                                                            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${entry.type === 'max'
                                                                ? theme === "light" ? "bg-green-50 text-green-500" : "bg-green-500/10 text-green-400"
                                                                : entry.type === 'min' 
                                                                    ? theme === "light" ? "bg-red-50 text-red-500" : "bg-red-500/10 text-red-400"
                                                                    : theme === "light" ? "bg-blue-50 text-blue-500" : "bg-blue-500/10 text-blue-400"
                                                                }`}>
                                                                {entry.type === 'max' ? <TrendingUp size={12} /> : entry.type === 'min' ? <TrendingDown size={12} /> : <Search size={12} />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-baseline gap-1.5">
                                                                    <span className={`text-[11px] font-medium ${theme === "light" ? "text-slate-600" : "text-gray-300"}`}>{entry.action}</span>
                                                                    <span className={`text-[11px] font-bold ${entry.type === 'max' ? 'text-green-500' : entry.type === 'min' ? 'text-red-500' : 'text-blue-500'}`}>{entry.value}</span>
                                                                    <span className={`text-[11px] font-bold ${theme === "light" ? "text-slate-800" : "text-white"}`}>{entry.symbol}</span>
                                                                </div>
                                                                <span className={`text-[10px] ${theme === "light" ? "text-slate-400" : "text-gray-500"}`}>{entry.time}</span>
                                                            </div>
                                                        </div>
                                                    ));
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* ─── Suggested Assets (Mobile only - shown below table) ─── */}
                                <div className="lg:hidden">
                                    {(() => {
                                        const suggestions = SEARCHABLE_POOL.filter(
                                            a => !activeWatchlist.assets.some(existing => existing.symbol === a.symbol)
                                        );
                                        if (suggestions.length === 0) return null;

                                        const getLogo = (symbol: string) => {
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

                                        return (
                                            <div className="mt-8">
                                                <div className={`text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2 ${theme === "light" ? "text-slate-400" : "text-gray-500"}`}>
                                                    <Plus size={12} className="text-gray-400" /> Suggested Assets
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    {suggestions.map((asset) => {
                                                        const logo = getLogo(asset.symbol);
                                                        const isPos = asset.change?.startsWith('+');
                                                        return (
                                                            <div
                                                                key={asset.symbol}
                                                                onClick={() => addAssetToWatchlist(asset)}
                                                                className={`group relative rounded-2xl p-4 border cursor-pointer transition-all duration-300 hover:-translate-y-0.5 ${theme === "light"
                                                                    ? "bg-white border-slate-200 hover:border-slate-300 hover:shadow-md"
                                                                    : "bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]"
                                                                    }`}
                                                            >
                                                                <div className="flex items-center gap-3 mb-3">
                                                                    {logo ? (
                                                                        <img src={logo} alt={asset.symbol} className="w-8 h-8 rounded-full" />
                                                                    ) : (
                                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${theme === "light" ? "bg-slate-100 text-slate-500" : "bg-white/10 text-gray-400"}`}>
                                                                            {asset.symbol[0]}
                                                                        </div>
                                                                    )}
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className={`text-sm font-bold truncate ${theme === "light" ? "text-slate-800" : "text-white"}`}>{asset.symbol}</div>
                                                                        <div className={`text-[10px] truncate ${theme === "light" ? "text-slate-400" : "text-gray-500"}`}>{asset.name}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center justify-between">
                                                                    <div>
                                                                        <div className={`text-xs font-mono font-medium ${theme === "light" ? "text-slate-600" : "text-gray-300"}`}>{asset.price}</div>
                                                                        <div className={`text-[10px] font-medium ${isPos ? "text-green-500" : "text-red-500"}`}>{asset.change}</div>
                                                                    </div>
                                                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 ${theme === "light"
                                                                        ? "bg-blue-50 text-blue-500"
                                                                        : "bg-blue-500/10 text-blue-400"
                                                                        }`}>
                                                                        <Plus size={14} />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}

                        {currentView === ViewType.ALERTS && (
                            <AlertsPage
                                theme={theme}
                                alerts={userAlerts}
                                alertEvents={alertEvents}
                                globalAggressiveness={globalAggressiveness}
                                onCreateAlert={handleCreateAlert}
                                onUpdateAlert={handleUpdateAlert}
                                onToggleAlert={handleToggleAlert}
                                onDeleteAlert={handleDeleteAlert}
                                onMarkEventRead={handleMarkEventRead}
                                onMarkAllEventsRead={handleMarkAllEventsRead}
                                onDismissEvent={handleDismissEvent}
                                onChangeGlobalAggressiveness={handleChangeGlobalAggressiveness}
                                nudgeEnabled={nudgeEnabled}
                                nudgeFrequency={nudgeFrequency}
                                nudgeTime={nudgeTime}
                                onNudgeEnabledChange={handleNudgeEnabledChange}
                                onNudgeFrequencyChange={handleNudgeFrequencyChange}
                                onNudgeTimeChange={handleNudgeTimeChange}
                                prefillSymbol={alertPrefillSymbol}
                                emailEnabled={emailEnabled}
                                discordEnabled={discordEnabled}
                                telegramEnabled={telegramEnabled}
                                onEmailEnabledChange={handleEmailEnabledChange}
                                onDiscordEnabledChange={handleDiscordEnabledChange}
                                onTelegramEnabledChange={handleTelegramEnabledChange}
                                userConnections={userConnections}
                                onConnectionComplete={handleConnectionComplete}
                                userId={userId}
                                trialStartedAt={alertTrialStartedAt}
                            />
                        )}
                        {/* ── Owner Dashboard (engine inspector) ── */}
                        {currentView === ViewType.OWNER && isOwner && (
                            <div className="p-8 text-sm opacity-60">Owner dashboard unavailable in public build.</div>
                        )}
                        {/* ── Profile View ── */}
                        {currentView === ViewType.PROFILE && (
                            <div className="flex-1 p-6 md:p-8 overflow-y-auto animate-in fade-in duration-500 no-scrollbar">
                                <header className="mb-8">
                                    <h1 className={`text-2xl md:text-3xl font-display font-bold transition-colors duration-500 ${theme === "light" ? "text-slate-900" : "text-white"}`}>
                                        <span className={`${theme === "light" ? "text-slate-400" : "text-gray-500"} font-light`}>Dashboard /</span> My Account
                                    </h1>
                                </header>

                                <div className="max-w-2xl flex flex-col gap-6">

                                    {/* Profile Info Card */}
                                    <div className={`rounded-3xl border p-6 transition-colors duration-500 ${theme === "light" ? "bg-white border-black/5" : "bg-black/30 border-[#27273a]"}`}>
                                        <div className="flex items-center gap-4 mb-6">
                                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold ${theme === "light" ? "bg-blue-50 text-blue-600" : "bg-blue-600/10 text-blue-400"}`}>
                                                {userMeta?.first_name?.[0]?.toUpperCase() ?? userEmail[0]?.toUpperCase() ?? '?'}
                                            </div>
                                            <div>
                                                <p className={`font-bold text-lg ${theme === "light" ? "text-slate-900" : "text-white"}`}>
                                                    {userMeta?.first_name && userMeta?.last_name
                                                        ? `${userMeta.first_name} ${userMeta.last_name}`
                                                        : userEmail}
                                                </p>
                                                <p className={`text-sm ${theme === "light" ? "text-slate-500" : "text-gray-400"}`}>{userEmail}</p>
                                            </div>
                                            {(isOwner || isFoundingMember) && <div className="flex flex-col gap-1.5">
                                                {isOwner && <OwnerBadge variant="pill" theme={theme} />}
                                                {isFoundingMember && <FoundingBadge variant="pill" theme={theme} />}
                                            </div>}
                                        </div>
                                        <div className={`grid grid-cols-2 gap-4 pt-4 border-t ${theme === "light" ? "border-slate-100" : "border-[#27273a]"}`}>
                                            {userMeta?.trades && (
                                                <div>
                                                    <p className={`text-xs uppercase tracking-widest font-semibold mb-1 ${theme === "light" ? "text-slate-400" : "text-gray-500"}`}>Trades</p>
                                                    <p className={`text-sm font-semibold capitalize ${theme === "light" ? "text-slate-700" : "text-gray-200"}`}>{userMeta.trades}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Subscription Card */}
                                    <div className={`rounded-3xl border p-6 transition-colors duration-500 ${theme === "light" ? "bg-white border-black/5" : "bg-black/30 border-[#27273a]"}`}>
                                        <h2 className={`text-sm uppercase tracking-widest font-semibold mb-4 ${theme === "light" ? "text-slate-400" : "text-gray-500"}`}>Subscription</h2>
                                        <div className="flex items-center justify-between flex-wrap gap-4">
                                            <div className="flex items-center gap-3">
                                                {userPlan === 'founder' && <Crown size={20} className="text-yellow-400" />}
                                                {userPlan === 'pro' && <Zap size={20} className="text-blue-400" />}
                                                <div>
                                                    <p className={`font-bold text-lg capitalize ${theme === "light" ? "text-slate-900" : "text-white"}`}>
                                                        {userPlan === 'founder' ? 'Founding Member' : userPlan === 'free' ? 'Free Plan' : `${userPlan} Plan`}
                                                    </p>
                                                    <p className={`text-sm ${theme === "light" ? "text-slate-500" : "text-gray-400"}`}>
                                                        {userPlan === 'founder' ? 'Full Pro access · Price locked forever' :
                                                         userPlan === 'free' ? '1 score check/day · 3 tickers' :
                                                         userPlan === 'core' ? 'Unlimited checks · 3 watchlists · 30-day history' :
                                                         'Everything in Core + full history · priority support'}
                                                    </p>
                                                </div>
                                            </div>
                                            {userPlan === 'free' && (
                                                <a
                                                    href="/pricing.html"
                                                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors"
                                                >
                                                    Upgrade
                                                </a>
                                            )}
                                        </div>

                                        {userPlan === 'free' && (
                                            <div className={`mt-5 pt-5 border-t ${theme === "light" ? "border-slate-100" : "border-[#27273a]"}`}>
                                                <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${theme === "light" ? "text-slate-400" : "text-gray-500"}`}>You're missing out on</p>
                                                <ul className={`text-sm space-y-1.5 ${theme === "light" ? "text-slate-600" : "text-gray-300"}`}>
                                                    {['Unlimited REMi score checks', 'Alerts on all tickers', 'Full score history'].map(f => (
                                                        <li key={f} className="flex items-center gap-2">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                                            {f}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>

                                    {/* Sign Out */}
                                    <button
                                        onClick={handleSignOut}
                                        className={`flex items-center gap-2 text-sm font-medium px-4 py-3 rounded-xl transition-colors w-fit ${theme === "light" ? "text-red-500 hover:bg-red-50" : "text-red-400 hover:bg-red-500/10"}`}
                                    >
                                        <LogOut size={16} />
                                        Sign Out
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>



        </div>
    );
};

export default App;
