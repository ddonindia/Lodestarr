// API response types for better type safety
// These represent the raw JSON responses from the backend

/** Raw search result from native indexer API (snake_case) */
export interface NativeSearchResult {
    title: string;
    guid?: string;
    link?: string;
    magnet?: string;
    size?: number;
    seeders?: number;
    leechers?: number;
    grabs?: number;
    publish_date?: string;
    categories?: number[];
    indexer?: string;
    indexer_id?: string;
    comments?: string;
    info_hash?: string;
    details?: string;
}

/** Error object for catch blocks */
export interface ApiError extends Error {
    message: string;
    status?: number;
}

/** Indexer setting from API */
export interface IndexerSetting {
    name: string;
    label?: string;
    type: string;
    default?: string | number | boolean;
    options?: { value: string; name: string }[];
}

/** Native indexer from /api/native/local */
export interface NativeIndexerResponse {
    id: string;
    name: string;
    description: string;
    language: string;
    indexer_type: string;
    links?: string[];
    legacylinks?: string[];
    enabled: boolean;
    settings?: IndexerSetting[];
}
