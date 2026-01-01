
import { useState, useEffect } from 'react';
import type { TorrentResult, IndexerDefinition, SortField } from '../types';
import type { NativeSearchResult } from '../types/api';
import SearchResultsTable from './SearchResultsTable';
import SearchResultsList from './SearchResultsList';
import ResultDetailsModal from './ResultDetailsModal';
import { SearchFiltersBar, SearchPagination } from './search';
import { useDownloadClients } from '../hooks/useDownloadClients';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { useTorrentMeta } from '../hooks/useTorrentMeta';
import { TORZNAB_CATEGORIES } from '../constants/categories';
import { inputStyle, buttonPrimaryStyle } from '../styles/shared';

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

    // Use the shared hooks
    const { clients, handleSendToClient, downloadConfigured, downloading, handleServerDownload } = useDownloadClients();
    const { copiedField, copyToClipboard } = useCopyToClipboard();
    const { torrentMeta, loadingMeta, fetchTorrentMeta, clearMeta } = useTorrentMeta();

    // Sorting
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    // Inspect modal state
    const [inspectedResult, setInspectedResult] = useState<TorrentResult | null>(null);

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
                    searchResults = (data || []).map((r: NativeSearchResult) => ({
                        Title: r.title,
                        Link: r.link || r.magnet || '',
                        Magnet: r.magnet,
                        Size: r.size ?? null,
                        Seeders: r.seeders ?? null,
                        Peers: r.leechers ?? null,
                        Indexer: r.indexer ?? null,
                        IndexerId: r.indexer_id ?? null,
                        PublishDate: r.publish_date ?? null,
                        Category: r.categories || [],
                        Comments: r.comments || r.guid || '',
                        Guid: r.guid || r.title,
                        Grabs: r.grabs ?? 0
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
                        .then(data => (data.results || []).map((r: TorrentResult) => ({ ...r, Indexer: indexers.find(i => i.id === id)?.name })))
                        .catch(() => []);
                });

                const all = await Promise.all(promises);
                searchResults = all.flat();
            }

            setResults(searchResults);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Search failed';
            setError(message);
        } finally {
            setLoading(false);
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

                {/* Filters Row */}
                <SearchFiltersBar
                    filterIndexer={filterIndexer}
                    setFilterIndexer={setFilterIndexer}
                    filterCategory={filterCategory}
                    setFilterCategory={setFilterCategory}
                    filterText={filterText}
                    setFilterText={setFilterText}
                    resultIndexers={resultIndexers}
                    results={results}
                />

                {/* Pagination */}
                <SearchPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalResults={results.length}
                    filteredCount={filteredAndSortedResults.length}
                    onPageChange={setCurrentPage}
                />
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
                    clearMeta();
                }}
                onCopyToClipboard={copyToClipboard}
                copiedField={copiedField}
                onFetchMeta={fetchTorrentMeta}
                loadingMeta={loadingMeta}
                torrentMeta={torrentMeta}
                clients={clients}
                onSendToClient={handleSendToClient}
                downloadConfigured={downloadConfigured}
                onDownload={handleServerDownload}
                downloadingId={downloading}
            />
        </div>
    );
}

// Format helpers removed as they are now in shared components or local generic logic
