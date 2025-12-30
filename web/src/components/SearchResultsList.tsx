
import type { TorrentResult } from '../types';
import {
    getResultTitle,
    getResultIndexer,
    getResultSize,
    getResultSeeders,
    getResultPeers,
    getResultDate,
    getResultCategories,
    getResultIndexerId,
    getResultLink,
    getResultMagnet
} from '../types';

interface SearchResultsListProps {
    results: TorrentResult[];
    loading?: boolean;
    error?: string | null;
    onInspect: (result: TorrentResult) => void;
    downloadConfigured?: boolean;
    onDownload: (link: string, title: string) => void;
    downloadingId?: string | null;
    clients: { id: string; name: string }[];
    onSendToClient: (clientId: string, magnet: string, title: string) => void;
    TORZNAB_CATEGORIES: Record<number, string>;
}

export default function SearchResultsList({
    results,
    loading,
    error,
    onInspect,
    downloadConfigured = false,
    onDownload,
    downloadingId = null,
    clients,
    onSendToClient,
    TORZNAB_CATEGORIES
}: SearchResultsListProps) {

    const formatSize = (bytes: number) => {
        if (!bytes) return '-';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        let size = bytes;
        while (size >= 1024 && i < units.length - 1) {
            size /= 1024;
            i++;
        }
        return `${size.toFixed(1)} ${units[i]}`;
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr).toLocaleDateString();
        } catch {
            return dateStr;
        }
    };

    if (loading) {
        return <div className="text-center py-8 opacity-50">Loading results...</div>;
    }

    if (error) {
        return null; // Error usually handled by parent
    }

    return (
        <div className="space-y-3">
            {results.map((result, idx) => {
                const title = getResultTitle(result);
                const indexer = getResultIndexer(result);
                const indexerId = getResultIndexerId(result) || indexer;
                const link = getResultLink(result);
                const magnet = getResultMagnet(result);
                const size = getResultSize(result);
                const seeders = getResultSeeders(result);
                const peers = getResultPeers(result);
                const date = getResultDate(result);
                const categories = getResultCategories(result);

                return (
                    <div key={`${idx}-${title}`} className="rounded-lg p-4 space-y-3" style={{ backgroundColor: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}>
                        {/* Title & Indexer */}
                        <div>
                            <span className="px-2 py-0.5 rounded text-[10px] mb-2 inline-block" style={{ backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)' }}>
                                {indexer}
                            </span>
                            <button
                                onClick={() => onInspect(result)}
                                className="font-medium text-sm block leading-snug mt-1 text-left hover:underline"
                                style={{ color: 'var(--theme-accent)' }}
                            >
                                {title}
                            </button>
                        </div>

                        {/* Stats Row */}
                        <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-4">
                                <span className="font-mono opacity-80">{formatSize(size)}</span>
                                <div className="flex gap-2 font-mono">
                                    <span className="text-emerald-400">↑{seeders}</span>
                                    <span className="text-red-400">↓{peers}</span>
                                </div>
                            </div>
                            <span className="opacity-50">{formatDate(date)}</span>
                        </div>

                        {/* Categories */}
                        {categories && categories.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {categories.slice(0, 3).map(c => (
                                    <span key={c} className="px-1.5 py-0.5 rounded text-[10px] opacity-60" style={{ backgroundColor: 'var(--theme-bg)' }}>
                                        {TORZNAB_CATEGORIES[c] || c}
                                    </span>
                                ))}
                                {categories.length > 3 && (
                                    <span className="text-[10px] opacity-40">+{categories.length - 3}</span>
                                )}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-1 flex-wrap">
                            <button
                                onClick={() => onInspect(result)}
                                className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                                style={{ backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)' }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                                </svg>
                            </button>
                            <a
                                href={`/api/v2.0/indexers/${encodeURIComponent(indexerId)}/dl?link=${encodeURIComponent(link || '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 min-w-[100px] py-2 rounded-lg text-center text-sm font-medium transition-colors"
                                style={{ backgroundColor: 'var(--theme-accent)', color: 'white' }}
                            >
                                Download
                            </a>
                            {downloadConfigured && (
                                <button
                                    onClick={() => link && onDownload(link, title)}
                                    disabled={downloadingId === link || !link}
                                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                    style={{ backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)' }}
                                >
                                    {downloadingId === link ? '...' : 'To Server'}
                                </button>
                            )}
                            {/* Send to Client Actions */}
                            {clients.length > 0 && (
                                <>
                                    {clients.length === 1 ? (
                                        <button
                                            onClick={() => onSendToClient(clients[0].id, magnet || link || '', title)}
                                            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto"
                                            style={{ backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-accent)' }}
                                        >
                                            Send to {clients[0].name}
                                        </button>
                                    ) : (
                                        <select
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    onSendToClient(e.target.value, magnet || link || '', title);
                                                    e.target.value = ''; // Reset
                                                }
                                            }}
                                            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors appearance-none cursor-pointer w-full sm:w-auto"
                                            style={{ backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-accent)' }}
                                            defaultValue=""
                                        >
                                            <option value="" disabled>Send to...</option>
                                            {clients.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
