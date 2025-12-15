export interface TorrentResult {
    Title: string;
    Guid: string;
    Link: string | null;
    Comments: string | null;
    PublishDate: string | null;
    Category: number[];
    Size: number | null;
    Grabs: number | null;
    Seeders: number | null;
    Peers: number | null;
    Indexer: string | null;
}

export interface IndexerDefinition {
    id: string;
    name: string;
    description?: string;
    language: string;
    type: string;
    encoding?: string;
    links?: string[];
    enabled?: boolean; // UI-only property for toggle state
}

export interface IndexerHealth {
    id: string;
    name: string;
    status: 'healthy' | 'failing' | 'unknown';
    lastChecked: string | null;
    responseTime: number | null;
    errorMessage: string | null;
    successRate: number;
}

export interface SearchStats {
    totalSearches: number;
    recentSearches: Array<{
        query: string;
        indexer: string;
        timestamp: string;
        resultCount: number;
    }>;
    searchesOverTime: Array<{
        date: string;
        count: number;
    }>;
}

export interface SystemStats {
    indexersLoaded: number;
    indexersHealthy: number;
    indexersFailing: number;
    version: string;
    uptime: number;
    averageResponseTime: number;
}

export interface UserSettings {
    apiKey: string;
    baseUrl: string;
    theme: 'dark' | 'light' | 'auto';
    defaultIndexer: string | null;
    resultsPerPage: number;
    searchTimeout: number;
}
