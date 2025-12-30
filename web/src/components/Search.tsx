
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import type { TorrentResult, IndexerDefinition, SortField, TorrentMetadata } from '../types';
import SearchResultsTable from './SearchResultsTable';
import SearchResultsList from './SearchResultsList';
import ResultDetailsModal from './ResultDetailsModal';

interface Category {
    id: number;
    name: string;
}

interface NativeIndexer {
    id: string;
    name: string;
    description: string;
    language: string;
    indexer_type: string;
    categories: number[];
}

const TORZNAB_CATEGORIES: Record<number, string> = {
    // Console
    1000: "Console", 1010: "NDS", 1020: "PSP", 1030: "Wii", 1040: "Xbox", 1050: "Xbox 360", 1060: "Wiiware", 1070: "Xbox 360 DLC", 1080: "PS3", 1090: "Other", 1110: "3DS", 1120: "PS Vita", 1130: "WiiU", 1140: "Xbox One", 1180: "PS4",
    // Movies
    2000: "Movies", 2010: "Movies/Foreign", 2020: "Movies/Other", 2030: "Movies/SD", 2040: "Movies/HD", 2045: "Movies/UHD", 2050: "Movies/BluRay", 2060: "Movies/3D", 2070: "Movies/DVD", 2080: "Movies/WEB-DL",
    // Audio
    3000: "Audio", 3010: "Audio/MP3", 3020: "Audio/Video", 3030: "Audio/Audiobook", 3040: "Audio/Lossless", 3050: "Audio/Other", 3060: "Audio/Foreign",
    // PC
    4000: "PC", 4010: "PC/0day", 4020: "PC/ISO", 4030: "PC/Mac", 4040: "PC/Mobile-Other", 4050: "PC/Games", 4060: "PC/Mobile-iOS", 4070: "PC/Mobile-Android",
    // TV
    5000: "TV", 5010: "TV/WEB-DL", 5020: "TV/Foreign", 5030: "TV/SD", 5040: "TV/HD", 5045: "TV/UHD", 5050: "TV/Other", 5060: "TV/Sport", 5070: "TV/Anime", 5080: "TV/Documentary",
    // XXX
    6000: "XXX", 6010: "XXX/DVD", 6020: "XXX/WMV", 6030: "XXX/XviD", 6040: "XXX/x264", 6050: "XXX/Other", 6060: "XXX/ImageSet", 6070: "XXX/Packs",
    // Books
    7000: "Books", 7010: "Books/Mags", 7020: "Books/EBook", 7030: "Books/Comics", 7040: "Books/Technical", 7050: "Books/Other", 7060: "Books/Foreign",
    // Other
    8000: "Other", 8010: "Other/Misc", 8020: "Other/Hashed"
};

// Shared input style object using CSS variables
const inputStyle: React.CSSProperties = {
    backgroundColor: 'var(--theme-card)',
    border: '1px solid var(--theme-border)',
    color: 'inherit',
};

const buttonPrimaryStyle: React.CSSProperties = {
    backgroundColor: 'var(--theme-accent)',
    color: 'white',
};

const buttonSecondaryStyle: React.CSSProperties = {
    backgroundColor: 'var(--theme-card)',
    border: '1px solid var(--theme-border)',
    color: 'inherit',
};

export default function Search() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<TorrentResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [indexers, setIndexers] = useState<IndexerDefinition[]>([]);
    const [nativeIndexers, setNativeIndexers] = useState<NativeIndexer[]>([]);
    const [selectedIndexers, setSelectedIndexers] = useState<string>('');

    // Categories
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');

    // Filtering & Pagination
    const [filterText, setFilterText] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterIndexer, setFilterIndexer] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadConfigured, setDownloadConfigured] = useState(false);

    // Sorting
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    // Inspect modal state
    const [inspectedResult, setInspectedResult] = useState<TorrentResult | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [torrentMeta, setTorrentMeta] = useState<TorrentMetadata | null>(null);
    const [loadingMeta, setLoadingMeta] = useState(false);

    // Copy to clipboard
    const copyToClipboard = async (text: string, field: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 2000);
        } catch {
            console.error('Failed to copy');
        }
    };

    // Download Clients
    interface DownloadClient {
        id: string;
        name: string;
    }
    const [clients, setClients] = useState<DownloadClient[]>([]);

    useEffect(() => {
        fetch('/api/settings/clients')
            .then(res => res.json())
            .then(data => setClients(data))
            .catch(err => console.error('Failed to load clients', err));
    }, []);

    const handleSendToClient = async (clientId: string, magnet: string, title: string) => {
        if (!magnet) return;
        const toastId = toast.loading(`Sending "${title}"...`);
        try {
            const res = await fetch(`/api/clients/${clientId}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ magnet })
            });

            if (res.ok) {
                toast.success('Sent to client', { id: toastId });
            } else {
                throw new Error('Failed to send');
            }
        } catch (err) {
            toast.error('Failed to send torrent', { id: toastId });
        }
    };

    // Fetch torrent metadata from backend
    const fetchTorrentMeta = async (url: string) => {
        setLoadingMeta(true);
        setTorrentMeta(null);
        try {
            const res = await fetch('/api/torrent/meta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            if (res.ok) {
                const data = await res.json();
                setTorrentMeta(data);
            }
        } catch (err) {
            console.error('Failed to fetch torrent metadata', err);
        } finally {
            setLoadingMeta(false);
        }
    };

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
        const loadIndexers = async () => {
            try {
                // Load proxied indexers
                const proxiedRes = await fetch('/api/v2.0/indexers');
                if (proxiedRes.ok) {
                    const data = await proxiedRes.json();
                    const list: IndexerDefinition[] = data.indexers || [];
                    setIndexers(list.sort((a, b) => a.name.localeCompare(b.name)));
                }

                // Load native indexers (show all, not just enabled)
                const nativeRes = await fetch('/api/native/local');
                if (nativeRes.ok) {
                    const data = await nativeRes.json();
                    setNativeIndexers(data.indexers || []);
                }
            } catch (err) {
                console.error('Failed to load indexers', err);
            }
        };
        loadIndexers();
    }, []);

    // Fetch categories when indexer changes (if single indexer selected)
    useEffect(() => {
        if (!selectedIndexers) {
            setCategories([]);
            return;
        }

        // Check native first
        const native = nativeIndexers.find(n => n.id === selectedIndexers);
        if (native) {
            if (native.categories && native.categories.length > 0) {
                setCategories(native.categories.map(id => ({ id, name: TORZNAB_CATEGORIES[id] || `Category ${id}` })));
            } else {
                setCategories(Object.entries(TORZNAB_CATEGORIES).map(([id, name]) => ({ id: parseInt(id), name })));
            }
            return;
        }

        // Check proxied
        if (selectedIndexers === 'all' || selectedIndexers === 'all-native') {
            // For all indexers, show standard categories
            setCategories(Object.entries(TORZNAB_CATEGORIES)
                .map(([id, name]) => ({ id: parseInt(id), name }))
                .sort((a, b) => a.name.localeCompare(b.name)));
            return;
        }

        // Specific proxied indexer
        const idx = indexers.find(i => String(i.id) === selectedIndexers);
        if (idx) {
            // Fetch capabilities
            fetch(`/api/v2.0/indexers/${selectedIndexers}/caps`)
                .then(res => res.text())
                .then(xml => {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(xml, 'text/xml');
                    const cats = Array.from(doc.querySelectorAll('category')).map(el => ({
                        id: parseInt(el.getAttribute('id') || '0'),
                        name: el.getAttribute('name') || ''
                    }));
                    setCategories(cats);
                })
                .catch(err => {
                    console.error('Failed to load capabilities', err);
                    setCategories([]);
                });
        }
    }, [selectedIndexers, indexers, nativeIndexers]);

    // Derived state for results: reset pagination
    useEffect(() => {
        setCurrentPage(1);
    }, [results, filterText, filterCategory, filterIndexer, sortField, sortDirection]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedIndexers && !query) return;

        setLoading(true);
        setError(null);
        setResults([]);
        setSortField('Seeders');
        setSortDirection('desc');

        try {
            let searchResults: TorrentResult[] = [];

            const nativeId = selectedIndexers;
            const isNative = nativeId === 'all-native' || nativeIndexers.some(n => n.id === nativeId);

            if (isNative) {
                const baseUrl = '/api/native/search';
                const params = new URLSearchParams();
                params.append('q', query);
                if (nativeId !== 'all' && nativeId !== 'all-native') {
                    params.append('indexer', nativeId);
                }
                if (selectedCategory) {
                    params.append('cat', selectedCategory);
                }

                const res = await fetch(`${baseUrl}?${params.toString()}`);
                if (!res.ok) throw new Error('Search failed');
                const data = await res.json();

                if (Array.isArray(data)) {
                    searchResults = (data || []).map((r: any) => ({
                        Title: r.title,
                        Link: r.link || r.magnet,
                        Magnet: r.magnet,
                        Size: r.size,
                        Seeders: r.seeders,
                        Peers: r.leechers,
                        Indexer: r.indexer,
                        IndexerId: r.indexer_id,  // Added for proxy download URLs
                        PublishDate: r.publish_date,
                        Category: r.categories || [],
                        Comments: r.comments || r.guid,
                        Guid: r.guid,
                        Grabs: r.grabs || 0
                    }));
                }
            } else {
                const indexerIds = selectedIndexers === 'all'
                    ? indexers.map(i => i.id)
                    : [parseInt(selectedIndexers)];

                const promises = indexerIds.map(id => {
                    const params = new URLSearchParams();
                    params.append('q', query);
                    if (selectedCategory) params.append('cat', selectedCategory);

                    return fetch(`/api/v2.0/indexers/${id}/results?${params.toString()}`)
                        .then(r => r.json())
                        .then(data => (data.results || []).map((r: any) => ({ ...r, Indexer: indexers.find(i => i.id === id)?.name })))
                        .catch(() => []);
                });

                const all = await Promise.all(promises);
                searchResults = all.flat();
            }

            setResults(searchResults);
        } catch (err: any) {
            setError(err.message || 'Search failed');
        } finally {
            setLoading(false);
        }
    };

    const handleServerDownload = async (link: string, title: string) => {
        if (!link) return;
        setDownloading(link);
        try {
            const res = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: link,
                    title: title
                })
            });

            if (!res.ok) {
                console.error('Download failed');
            }
        } catch (err) {
            console.error('Download error', err);
        } finally {
            setDownloading(null);
        }
    };

    const resultIndexers = Array.from(new Set(results.map(r => r.Indexer || 'Unknown').filter(Boolean))).sort();

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const filteredAndSortedResults = results.filter(r => {
        if (filterIndexer && r.Indexer !== filterIndexer) return false;
        if (filterCategory) {
            const catId = parseInt(filterCategory);
            if (!r.Category || !r.Category.includes(catId)) return false;
        }
        if (!filterText) return true;
        const lower = filterText.toLowerCase();
        return r.Title.toLowerCase().includes(lower) ||
            (r.Indexer?.toLowerCase().includes(lower)) ||
            (r.Category || []).some(c => (TORZNAB_CATEGORIES[c] || '').toLowerCase().includes(lower));
    }).sort((a, b) => {
        if (!sortField) return 0;

        let valA: any = null;
        let valB: any = null;

        switch (sortField) {
            case 'Indexer': valA = a.Indexer || ''; valB = b.Indexer || ''; break;
            case 'Title': valA = a.Title || ''; valB = b.Title || ''; break;
            case 'Size': valA = a.Size || 0; valB = b.Size || 0; break;
            case 'Seeders': valA = a.Seeders || 0; valB = b.Seeders || 0; break;
            case 'Date': valA = a.PublishDate ? new Date(a.PublishDate).getTime() : 0; valB = b.PublishDate ? new Date(b.PublishDate).getTime() : 0; break;
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const totalPages = Math.ceil(filteredAndSortedResults.length / itemsPerPage);
    const paginatedResults = filteredAndSortedResults.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    return (
        <div className="max-w-[1600px] mx-auto pb-24">
            <div className="mb-6 lg:mb-8 space-y-3 lg:space-y-4">
                {/* Indexer & Category Selection */}
                <div className="flex flex-col lg:flex-row gap-3 lg:gap-4">
                    <div className="flex flex-col sm:flex-row gap-2 lg:flex-1">
                        <select
                            id="indexer-select"
                            data-testid="indexer-select"
                            className="flex-1 rounded-lg px-4 py-3 outline-none appearance-none"
                            style={inputStyle}
                            value={selectedIndexers}
                            onChange={(e) => {
                                setSelectedIndexers(e.target.value);
                                setCategories([]);
                                setFilterCategory('');
                            }}
                        >
                            <option value="">Select Indexer...</option>
                            <optgroup label="Groups">
                                <option value="all">All Proxied Indexers</option>
                                <option value="all-native">All Native Indexers</option>
                            </optgroup>
                            {nativeIndexers.length > 0 && (
                                <optgroup label="Native Indexers">
                                    {nativeIndexers.map(idx => (
                                        <option key={idx.id} value={idx.id}>{idx.name}</option>
                                    ))}
                                </optgroup>
                            )}
                            {indexers.length > 0 && (
                                <optgroup label="Proxied Indexers">
                                    {indexers.map(idx => (
                                        <option key={idx.id} value={idx.id}>{idx.name}</option>
                                    ))}
                                </optgroup>
                            )}
                        </select>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <select
                            id="category-select"
                            data-testid="category-select"
                            className="w-1/3 rounded-lg px-4 py-3 outline-none appearance-none disabled:opacity-50"
                            style={inputStyle}
                            value={selectedCategory}
                            onChange={(e) => {
                                setSelectedCategory(e.target.value);
                                setFilterCategory('');
                            }}
                            disabled={categories.length === 0}
                        >
                            <option value="">All Categories</option>
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>
                        <form onSubmit={handleSearch} className="flex gap-2 flex-1 lg:min-w-[40%]">
                            <div className="relative flex-1">
                                <input
                                    id="search-input"
                                    data-testid="search-input"
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search queries..."
                                    className="w-full rounded-lg pl-10 pr-4 py-3 outline-none"
                                    style={inputStyle}
                                />
                                <svg className="absolute left-3 top-3.5 h-5 w-5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <button
                                id="search-button"
                                data-testid="search-button"
                                type="submit"
                                disabled={loading || !selectedIndexers}
                                className="disabled:opacity-50 disabled:cursor-not-allowed px-8 py-3 rounded-lg font-medium transition-colors"
                                style={buttonPrimaryStyle}
                            >
                                {loading ? 'Searching...' : 'Search'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Filters Row - Horizontally scrollable on mobile */}
                <div className="flex gap-2 items-center p-2 rounded-lg overflow-x-auto scrollbar-hide" style={{ backgroundColor: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}>
                    <span className="text-xs lg:text-sm opacity-60 px-2 font-medium whitespace-nowrap">Filter:</span>

                    <div className="relative">
                        <select
                            id="filter-indexer-select"
                            data-testid="filter-indexer-select"
                            value={filterIndexer}
                            onChange={(e) => setFilterIndexer(e.target.value)}
                            className="rounded-md pl-2 pr-8 py-1.5 text-sm outline-none appearance-none cursor-pointer transition-colors"
                            style={{ ...inputStyle, maxWidth: '160px' }}
                        >
                            <option value="">All Indexers</option>
                            {resultIndexers.map(idx => (
                                <option key={idx} value={idx}>{idx}</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 opacity-50">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>

                    <div className="relative">
                        <select
                            id="filter-category-select"
                            data-testid="filter-category-select"
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="rounded-md pl-2 pr-8 py-1.5 text-sm outline-none appearance-none cursor-pointer transition-colors"
                            style={{ ...inputStyle, maxWidth: '160px' }}
                        >
                            <option value="">All Categories</option>
                            {Array.from(new Set(results.flatMap(r => r.Category || []))).sort((a, b) => a - b).map(catId => (
                                <option key={catId} value={catId}>{TORZNAB_CATEGORIES[catId] || catId}</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 opacity-50">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>

                    <div className="hidden sm:block w-px h-6 opacity-30" style={{ backgroundColor: 'var(--theme-border)' }}></div>

                    <div className="relative">
                        <input
                            id="filter-text-input"
                            data-testid="filter-text-input"
                            type="text"
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            placeholder="Text filter..."
                            className="rounded-md pl-8 pr-3 py-1.5 text-sm outline-none w-40 lg:w-64"
                            style={inputStyle}
                        />
                        <svg className="absolute left-2.5 top-2 h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>

                {results.length > 0 && (
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs lg:text-sm opacity-60 px-1">
                        <div>Found {results.length} results</div>
                        <div className="flex items-center gap-2 pr-2">
                            <span className="text-sm mr-2">
                                Page {currentPage} of {totalPages || 1} ({filteredAndSortedResults.length} filtered)
                            </span>
                            <button
                                id="prev-page-button"
                                data-testid="prev-page-button"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 rounded-md disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors"
                                style={buttonSecondaryStyle}
                            >
                                Prev
                            </button>
                            <button
                                id="next-page-button"
                                data-testid="next-page-button"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                                className="px-3 py-1.5 rounded-md disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors"
                                style={buttonSecondaryStyle}
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

            {/* Mobile Card View */}
            <div className="lg:hidden">
                {paginatedResults.length === 0 && !loading && !error && (
                    <div className="p-8 text-center text-neutral-500 rounded-lg" style={{ backgroundColor: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}>
                        {query ? (selectedIndexers ? 'No results found' : 'Select an indexer and enter a query') : 'Select an indexer to start'}
                    </div>
                )}
                {paginatedResults.length > 0 && (
                    <SearchResultsList
                        results={paginatedResults}
                        onInspect={setInspectedResult}
                        downloadConfigured={downloadConfigured}
                        onDownload={handleServerDownload}
                        downloadingId={downloading}
                        clients={clients}
                        onSendToClient={handleSendToClient}
                        TORZNAB_CATEGORIES={TORZNAB_CATEGORIES}
                    />
                )}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block">
                <SearchResultsTable
                    results={paginatedResults}
                    loading={loading}
                    error={error}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    onInspect={setInspectedResult}
                    onDownload={handleServerDownload}
                    downloadConfigured={downloadConfigured}
                    downloadingId={downloading}
                    clients={clients}
                    onSendToClient={handleSendToClient}
                />
            </div>

            <ResultDetailsModal
                result={inspectedResult}
                onClose={() => {
                    setInspectedResult(null);
                    setTorrentMeta(null);
                }}
                onCopyToClipboard={copyToClipboard}
                copiedField={copiedField}
                onFetchMeta={fetchTorrentMeta}
                loadingMeta={loadingMeta}
                torrentMeta={torrentMeta}
            />
        </div>
    );
}

// Format helpers removed as they are now in shared components or local generic logic
