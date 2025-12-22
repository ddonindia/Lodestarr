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
    IndexerId?: string | null;  // Added for proxy download URLs
    Magnet?: string;  // Magnet link
}

export interface IndexerDefinition {
    id: string;
    name: string;
    description?: string;
    language: string;
    type: string;
    encoding?: string;
    links?: string[];
    legacylinks?: string[];
    enabled?: boolean; // UI-only property for toggle state
}
