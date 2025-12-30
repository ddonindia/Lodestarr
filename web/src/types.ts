export interface TorrentResult {
    Title: string; // Used by Search.tsx (PascalCase from Go struct)
    // Support lowercase aliases for compatibility if needed, or normalize in API response
    title?: string;

    Guid: string;
    guid?: string;

    Link: string | null;
    link?: string | null;

    Magnet?: string;
    magnet?: string;

    Comments: string | null;
    comments?: string | null; // or details

    PublishDate: string | null;
    publish_date?: string | null;

    Category: number[];
    categories?: number[];

    Size: number | null;
    size?: number | null;

    Grabs: number | null;
    grabs?: number | null;

    Seeders: number | null;
    seeders?: number | null;

    Peers: number | null;
    leechers?: number | null;

    Indexer: string | null;
    indexer?: string | null;

    IndexerId?: string | null;
    indexer_id?: string | null;

    InfoHash?: string;
    info_hash?: string;
}

// Helper to normalize result access
export function getResultTitle(r: TorrentResult): string { return r.Title || r.title || ''; }
export function getResultLink(r: TorrentResult): string | null { return r.Link || r.link || null; }
export function getResultMagnet(r: TorrentResult): string | undefined { return r.Magnet || r.magnet; }
export function getResultSize(r: TorrentResult): number { return r.Size || r.size || 0; }
export function getResultSeeders(r: TorrentResult): number { return r.Seeders ?? r.seeders ?? 0; }
export function getResultPeers(r: TorrentResult): number { return r.Peers ?? r.leechers ?? 0; }
export function getResultIndexer(r: TorrentResult): string { return r.Indexer || r.indexer || 'Unknown'; }
export function getResultDate(r: TorrentResult): string { return r.PublishDate || r.publish_date || ''; }
export function getResultCategories(r: TorrentResult): number[] { return r.Category || r.categories || []; }
export function getResultGuid(r: TorrentResult): string { return r.Guid || r.guid || ''; }
export function getResultDetails(r: TorrentResult): string | null { return r.Comments || r.comments || null; }
export function getResultInfoHash(r: TorrentResult): string | undefined { return r.InfoHash || r.info_hash; }
export function getResultIndexerId(r: TorrentResult): string | null { return r.IndexerId || r.indexer_id || null; }


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

export type SortField = 'Indexer' | 'Title' | 'Size' | 'Seeders' | 'Date';

export interface TorrentMetadata {
    name: string;
    info_hash: string;
    total_size: number;
    piece_length: number;
    files: { path: string; size: number }[];
    trackers: string[];
    created_by?: string;
    creation_date?: string;
    comment?: string;
}
