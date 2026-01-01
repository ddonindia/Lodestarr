
import type { TorrentResult, SortField } from '../types';
import {
    getResultTitle,
    getResultSize,
    getResultSeeders,
    getResultPeers,
    getResultLink,
    getResultIndexer,
    getResultDate,
    getResultMagnet,
    getResultIndexerId
} from '../types';
import { formatSize, formatDate } from '../utils/formatters';
import { buttonSecondaryStyle } from '../styles/shared';

interface SearchResultsTableProps {
    results: TorrentResult[];
    loading?: boolean;
    error?: string | null;
    sortField?: SortField | null;
    sortDirection?: 'asc' | 'desc';
    onSort?: (field: SortField) => void;
    onInspect: (result: TorrentResult) => void;
    onDownload: (link: string, title: string) => void;
    downloadConfigured?: boolean;
    downloadingId?: string | null;
    variant?: 'full' | 'simple'; // 'full' allows sorting columns, 'simple' is for basic display
    clients?: { id: string; name: string }[];
    onSendToClient?: (clientId: string, magnet: string, title: string) => void;
}

export default function SearchResultsTable({
    results,
    loading,
    error,
    sortField,
    sortDirection,
    onSort,
    onInspect,
    onDownload,
    downloadConfigured = false,
    downloadingId = null,
    variant = 'full',
    clients = [],
    onSendToClient
}: SearchResultsTableProps) {

    const SortIcon = ({ field }: { field: SortField }) => {
        if (variant !== 'full' || !onSort) return null;
        if (sortField !== field) return <span className="ml-1 opacity-20">↕</span>;
        return sortDirection === 'asc'
            ? <span className="ml-1" style={{ color: 'var(--theme-accent)' }}>↑</span>
            : <span className="ml-1" style={{ color: 'var(--theme-accent)' }}>↓</span>;
    };

    const handleSort = (field: SortField) => {
        if (variant === 'full' && onSort) {
            onSort(field);
        }
    };

    return (
        <div className="rounded-lg border border-neutral-800 overflow-hidden shadow-xl bg-[#1a1a1a]">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-[#262626] text-neutral-400 font-medium border-b border-neutral-800">
                        <tr className="uppercase text-xs font-semibold tracking-wider">
                            <th
                                data-testid="sort-indexer"
                                className={`px-6 py-4 select-none transition-colors ${variant === 'full' ? 'cursor-pointer hover:text-white' : ''}`}
                                onClick={() => handleSort('Indexer')}
                            >
                                <div className="flex items-center gap-1">
                                    Indexer
                                    <SortIcon field="Indexer" />
                                </div>
                            </th>
                            <th
                                data-testid="sort-title"
                                className={`px-6 py-4 w-1/2 select-none transition-colors ${variant === 'full' ? 'cursor-pointer hover:text-white' : ''}`}
                                onClick={() => handleSort('Title')}
                            >
                                <div className="flex items-center gap-1">
                                    Title
                                    <SortIcon field="Title" />
                                </div>
                            </th>
                            <th
                                data-testid="sort-size"
                                className={`px-6 py-4 text-right select-none transition-colors ${variant === 'full' ? 'cursor-pointer hover:text-white' : ''}`}
                                onClick={() => handleSort('Size')}
                            >
                                <div className="flex items-center justify-end gap-1">
                                    Size
                                    <SortIcon field="Size" />
                                </div>
                            </th>
                            <th
                                data-testid="sort-seeders"
                                className={`px-6 py-4 text-right select-none transition-colors ${variant === 'full' ? 'cursor-pointer hover:text-white' : ''}`}
                                onClick={() => handleSort('Seeders')}
                            >
                                <div className="flex items-center justify-end gap-1">
                                    S/L
                                    <SortIcon field="Seeders" />
                                </div>
                            </th>
                            {variant === 'full' && (
                                <th
                                    data-testid="sort-date"
                                    className="px-6 py-4 text-right cursor-pointer hover:text-white select-none transition-colors"
                                    onClick={() => handleSort('Date')}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        Date
                                        <SortIcon field="Date" />
                                    </div>
                                </th>
                            )}
                            <th className="px-6 py-4 text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                        {results.length === 0 && !loading && !error && (
                            <tr>
                                <td colSpan={variant === 'full' ? 6 : 5} className="px-6 py-12 text-center text-neutral-500">
                                    No results found
                                </td>
                            </tr>
                        )}
                        {loading && (
                            <tr>
                                <td colSpan={variant === 'full' ? 6 : 5} className="px-6 py-12 text-center text-neutral-500">
                                    Loading...
                                </td>
                            </tr>
                        )}
                        {results.map((result, idx) => {
                            const indexer = getResultIndexer(result);
                            const title = getResultTitle(result);
                            const size = getResultSize(result);
                            const seeders = getResultSeeders(result).toString();
                            const peers = getResultPeers(result);
                            const date = getResultDate(result);
                            const link = getResultLink(result);
                            const magnet = getResultMagnet(result);
                            const indexerId = getResultIndexerId(result);

                            return (
                                <tr key={`${idx}-${title}`} className="hover:bg-white/5 transition-colors group">
                                    <td className="px-6 py-4 font-mono text-xs opacity-70 whitespace-nowrap">
                                        {indexer}
                                    </td>
                                    <td
                                        className="px-6 py-4 font-medium text-white max-w-xl truncate cursor-pointer hover:text-[var(--theme-accent)] transition-colors"
                                        title={title}
                                        onClick={() => onInspect(result)}
                                    >
                                        {title}
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-xs opacity-80 whitespace-nowrap">
                                        {formatSize(size)}
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-xs whitespace-nowrap">
                                        <span className="text-emerald-400">{seeders}</span>
                                        <span className="opacity-30 mx-1">/</span>
                                        <span className="text-red-400">{peers}</span>
                                    </td>
                                    {variant === 'full' && (
                                        <td className="px-6 py-4 text-right font-mono text-xs opacity-60 whitespace-nowrap">
                                            {formatDate(date)}
                                        </td>
                                    )}
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {/* Direct Download Link */}
                                            {link && (
                                                <a
                                                    href={indexerId ? `/api/v2.0/indexers/${encodeURIComponent(indexerId)}/dl?link=${encodeURIComponent(link)}` : link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-2 rounded-md hover:bg-neutral-700 transition-colors"
                                                    title="Download .torrent"
                                                    style={buttonSecondaryStyle}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                                    </svg>
                                                </a>
                                            )}

                                            {/* Download to Server */}
                                            {downloadConfigured && link && (
                                                <button
                                                    onClick={() => onDownload(link, title)}
                                                    disabled={downloadingId === link}
                                                    className="p-2 rounded-md hover:bg-neutral-700 transition-colors disabled:opacity-50"
                                                    title="Save to Server"
                                                    style={buttonSecondaryStyle}
                                                >
                                                    {downloadingId === link ? (
                                                        <span className="animate-spin text-xs">⌛</span>
                                                    ) : (
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3v5.25a3 3 0 0 1-3 3m-13.5 0v5.25a3 3 0 0 0 3 3h7.5a3 3 0 0 0 3-3v-5.25" />
                                                        </svg>
                                                    )}
                                                </button>
                                            )}

                                            {/* Send to Client */}
                                            {clients.length > 0 && onSendToClient && (
                                                <div className="relative group/client">
                                                    {clients.length === 1 ? (
                                                        <button
                                                            onClick={() => onSendToClient(clients[0].id, magnet || link || '', title)}
                                                            className="p-2 rounded-md hover:bg-neutral-700 transition-colors"
                                                            title={`Send to ${clients[0].name}`}
                                                            style={buttonSecondaryStyle}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.126A59.768 59.768 0 0 1 21.485 12 59.77 59.77 0 0 1 3.27 20.876L5.999 12Zm0 0h7.5" />
                                                            </svg>
                                                        </button>
                                                    ) : (
                                                        <div className="relative">
                                                            <button
                                                                className="p-2 rounded-md hover:bg-neutral-700 transition-colors"
                                                                title="Send to..."
                                                                style={buttonSecondaryStyle}
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.126A59.768 59.768 0 0 1 21.485 12 59.77 59.77 0 0 1 3.27 20.876L5.999 12Zm0 0h7.5" />
                                                                </svg>
                                                            </button>
                                                            <select
                                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                                                onChange={(e) => {
                                                                    if (e.target.value) {
                                                                        onSendToClient(e.target.value, magnet || link || '', title);
                                                                        e.target.value = '';
                                                                    }
                                                                }}
                                                                value=""
                                                            >
                                                                <option value="" disabled>Send to...</option>
                                                                {clients.map(c => (
                                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
