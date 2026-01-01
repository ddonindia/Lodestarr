// Type definitions for indexer components
// Shared across NativeIndexers and its sub-components

export interface GithubIndexer {
    name: string;
    installed: boolean;
}

export interface LocalIndexer {
    id: string;
    name: string;
    description: string;
    language: string;
    indexer_type: string;
    links: string[];
    legacylinks: string[];
    isNative: true;
    enabled: boolean;
}

export interface ProxiedIndexer {
    id: string;
    name: string;
    description: string;
    language: string;
    isNative: false;
    enabled: boolean;
}

export interface UnifiedIndexer {
    id: string;
    name: string;
    description: string;
    language: string;
    indexer_type?: string;
    isNative: boolean;
    links?: string[];
    legacylinks?: string[];
    url?: string;
    enabled: boolean;
}
