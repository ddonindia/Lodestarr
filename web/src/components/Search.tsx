import { useState, useEffect } from 'react';
import type { TorrentResult, IndexerDefinition } from '../types';

interface Category {
    id: number;
    name: string;
}

export default function Search() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<TorrentResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [indexers, setIndexers] = useState<IndexerDefinition[]>([]);
    const [loadingIndexers, setLoadingIndexers] = useState(true);
    const [selectedIndexers, setSelectedIndexers] = useState<string>('');

    // Categories
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [loadingCats, setLoadingCats] = useState(false);

    // Filtering & Pagination
    const [filterText, setFilterText] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadConfigured, setDownloadConfigured] = useState(false);

    useEffect(() => {
        // Check if download path matches
        fetch('/api/settings/download')
            .then(res => res.json())
            .then(data => setDownloadConfigured(!!data.path))
            .catch(() => { });
    }, []);
    const itemsPerPage = 25;

    // Fetch available indexers on mount
    useEffect(() => {
        fetch('/api/v2.0/indexers')
            .then(res => res.json())
            .then(data => {
                const list: IndexerDefinition[] = data.indexers || [];
                setIndexers(list.sort((a, b) => a.name.localeCompare(b.name)));
                setLoadingIndexers(false);
            })
            .catch(err => {
                console.error('Failed to load indexers', err);
                setLoadingIndexers(false);
            });
    }, []);

    // Fetch categories when indexer changes (if single indexer selected)
    useEffect(() => {
        if (selectedIndexers && selectedIndexers !== 'all') {
            setLoadingCats(true);
            fetch(`/api/v2.0/indexers/${selectedIndexers}/caps`)
                .then(res => res.json())
                .then(data => {
                    setCategories(data.categories || []);
                    setLoadingCats(false);
                })
                .catch(() => setLoadingCats(false));
        } else {
            setCategories([]);
        }
    }, [selectedIndexers]);

    // Reset pagination when results change
    useEffect(() => {
        setCurrentPage(1);
    }, [results, filterText]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (!query) return;
        setLoading(true);
        setError(null);
        setResults([]);
        setCurrentPage(1);

        const params = new URLSearchParams();
        params.append('q', query);
        if (selectedIndexers && selectedIndexers !== 'all') {
            params.append('indexer', selectedIndexers);
        }
        if (selectedCategory) params.append('cat', selectedCategory);

        fetch(`/api/v2.0/search?${params.toString()}`)
            .then(res => {
                if (!res.ok) throw new Error('Search failed');
                return res.json();
            })
            .then(data => {
                setResults(data || []);
                if (!data || data.length === 0) {
                    // Keep error null, empty results handled in UI
                }
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    };

    const handleServerDownload = (url: string, title?: string) => {
        if (!url) return;
        setDownloading(url);

        fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, title })
        })
            .then(async res => {
                if (!res.ok) {
                    const txt = await res.text();
                    throw new Error(txt || 'Download failed');
                }
                // Show success toast or visual indicator? 
                // For now just clear downloading state
            })
            .catch(e => {
                console.error(e);
                alert(`Download failed: ${e.message}`);
            })
            .finally(() => setDownloading(null));
    };

    // Filter results
    const filteredResults = results.filter(r =>
        !filterText || r.Title.toLowerCase().includes(filterText.toLowerCase())
    );

    // Paginate results
    const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
    const paginatedResults = filteredResults.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    return (
        <div className="w-full max-w-7xl mx-auto p-6">
            <div className="mb-6 space-y-4">
                {/* Search Form */}
                <form onSubmit={handleSearch} className="flex gap-4 flex-wrap items-end bg-neutral-800 p-4 rounded-xl border border-neutral-700 shadow-sm">
                    <div className="relative w-64">
                        <label className="block text-xs text-neutral-400 mb-1 ml-1">Indexer</label>
                        <select
                            value={selectedIndexers}
                            onChange={(e) => setSelectedIndexers(e.target.value)}
                            disabled={loadingIndexers}
                            className="w-full appearance-none px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-white transition-all cursor-pointer"
                        >
                            <option value="" disabled>Select Indexer</option>
                            <option value="all">All Indexers</option>
                            {indexers.map(idx => (
                                <option key={idx.id} value={idx.id}>
                                    {idx.name}
                                </option>
                            ))}
                        </select>
                        <div className="absolute right-4 bottom-3 pointer-events-none text-neutral-400">▼</div>
                    </div>

                    <div className="relative w-48">
                        <label className="block text-xs text-neutral-400 mb-1 ml-1">Category</label>
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            disabled={!selectedIndexers || selectedIndexers === 'all' || loadingCats}
                            className="w-full appearance-none px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-white transition-all cursor-pointer disabled:opacity-50"
                        >
                            <option value="">Any Category</option>
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>
                        <div className="absolute right-4 bottom-3 pointer-events-none text-neutral-400">▼</div>
                    </div>

                    <div className="flex-1 min-w-[300px]">
                        <label className="block text-xs text-neutral-400 mb-1 ml-1">Query</label>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search torrents..."
                            className="w-full px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-white placeholder-neutral-500 transition-all font-medium"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors h-[50px] shadow-lg shadow-emerald-900/20"
                    >
                        {loading ? '...' : 'Search'}
                    </button>
                </form>

                {/* Filter & Pagination Controls */}
                {results.length > 0 && (
                    <div className="flex items-center justify-between bg-neutral-800 p-2 pl-4 rounded-xl border border-neutral-700">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-neutral-400">Filter results:</span>
                            <input
                                type="text"
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                                placeholder="Type to filter..."
                                className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1.5 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none w-64"
                            />
                        </div>

                        <div className="flex items-center gap-2 pr-2">
                            <span className="text-sm text-neutral-400 mr-2">
                                Page {currentPage} of {totalPages || 1} ({filteredResults.length} items)
                            </span>
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 rounded-md bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm transition-colors"
                            >
                                Prev
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                                className="px-3 py-1.5 rounded-md bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-900/50 border border-red-800/50 text-red-200 rounded-lg">
                    {error}
                </div>
            )}

            <div className="bg-neutral-800 rounded-xl overflow-hidden shadow-xl border border-neutral-700">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-neutral-900 text-neutral-400 uppercase text-xs font-semibold tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Indexer</th>
                                <th className="px-6 py-4 w-1/2">Title</th>
                                <th className="px-6 py-4 text-right">Size</th>
                                <th className="px-6 py-4 text-right">S/L</th>
                                <th className="px-6 py-4 text-right">Date</th>
                                <th className="px-6 py-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-700">
                            {paginatedResults.length === 0 && !loading && !error && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-neutral-500">
                                        {query ? (selectedIndexers ? 'No results found' : 'Select an indexer and enter a query') : 'Select an indexer to start'}
                                    </td>
                                </tr>
                            )}
                            {paginatedResults.map((result, idx) => (
                                <tr key={idx} className="hover:bg-neutral-700/50 transition-colors group">
                                    <td className="px-6 py-4 text-sm text-neutral-400">
                                        <span className="px-2 py-1 rounded bg-neutral-900 border border-neutral-700 text-xs text-nowrap">
                                            {result.Indexer || 'Unknown'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {result.Comments ? (
                                            <a
                                                href={result.Comments}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-white hover:text-emerald-400 font-medium transition-colors block truncate max-w-lg"
                                                title={result.Title}
                                            >
                                                {result.Title}
                                            </a>
                                        ) : (
                                            <span
                                                className="text-white font-medium block truncate max-w-lg"
                                                title={result.Title}
                                            >
                                                {result.Title}
                                            </span>
                                        )}
                                        <div className="text-xs text-neutral-500 mt-1 flex gap-2">
                                            {result.Category?.map(c => (
                                                <span key={c} className="bg-neutral-700 px-1.5 py-0.5 rounded">{c}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-neutral-300 text-right font-mono whitespace-nowrap">
                                        {formatSize(result.Size)}
                                    </td>
                                    <td className="px-6 py-4 text-right whitespace-nowrap">
                                        <div className="flex justify-end gap-3 text-sm font-mono">
                                            <span className="text-emerald-400">{result.Seeders ?? '-'}</span>
                                            <span className="text-red-400 text-opacity-80">{result.Peers ?? '-'}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-neutral-400 text-right whitespace-nowrap">
                                        {formatDate(result.PublishDate)}
                                    </td>
                                    <td className="px-6 py-4 text-center flex justify-end gap-2">
                                        {downloadConfigured && (
                                            <button
                                                onClick={() => handleServerDownload(result.Link || '', result.Title)}
                                                disabled={downloading === result.Link}
                                                className="p-2 text-neutral-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-full transition-all disabled:opacity-50"
                                                title="Download to Server (Blackhole)"
                                            >
                                                {downloading === result.Link ? (
                                                    <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3.75m-3-3.75-3 3.75M12 9.75V1.5m-9 22.5h18" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 22.5a2.25 2.25 0 002.25-2.25V16.5m-16.5 6V16.5a2.25 2.25 0 012.25-2.25" opacity="0.5" />
                                                    </svg>
                                                )}
                                            </button>
                                        )}
                                        <a
                                            href={`/api/v2.0/indexers/${encodeURIComponent(result.Indexer || '')}/dl?link=${encodeURIComponent(result.Link || '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-block p-2 text-neutral-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-full transition-all"
                                            title="Download .torrent locally"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                            </svg>
                                        </a>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bottom Pagination */}
            {results.length > 0 && totalPages > 1 && (
                <div className="flex justify-center mt-6">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors border border-neutral-700"
                        >
                            Previous
                        </button>
                        <div className="flex items-center px-4 text-neutral-400">
                            Page {currentPage} of {totalPages}
                        </div>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage >= totalPages}
                            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors border border-neutral-700"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function formatSize(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined) return '-';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    try {
        return new Date(dateStr).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric'
        });
    } catch {
        return dateStr;
    }
}
