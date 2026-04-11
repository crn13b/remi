export enum ViewType {
    WATCHLIST = 'watchlist',
    ALERTS = 'alerts',
    SEARCH = 'search',
    PROFILE = 'profile',
    OWNER = 'owner'
}

export interface Asset {
    symbol: string;
    name: string;
    price: string;
    change: string;
    sentiment: 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell' | 'High Probability Setup';
    color: string;
    score?: number; // Live REMi divergence score (10-100)
}

