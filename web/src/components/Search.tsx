import { useState, useEffect } from 'react';
import type { TorrentResult, IndexerDefinition } from '../types';

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
    type SortField = 'Indexer' | 'Title' | 'Size' | 'Seeders' | 'Date';
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

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

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <span className="ml-1 opacity-20">↕</span>;
        return sortDirection === 'asc'
            ? <span className="ml-1" style={{ color: 'var(--theme-accent)' }}>↑</span>
            : <span className="ml-1" style={{ color: 'var(--theme-accent)' }}>↓</span>;
    };

    return (
        <div className="p-6 max-w-[1600px] mx-auto pb-24">
            <div className="mb-8 space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 flex gap-2">
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
                    </div>

                    <form onSubmit={handleSearch} className="flex gap-2 min-w-[50%]">
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

                {/* Filters Row */}
                <div className="flex gap-2 items-center p-2 rounded-lg" style={{ backgroundColor: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}>
                    <span className="text-sm opacity-60 px-2 font-medium">Filter results:</span>

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

                    <div className="w-px h-6 opacity-30" style={{ backgroundColor: 'var(--theme-border)' }}></div>

                    <div className="relative">
                        <input
                            id="filter-text-input"
                            data-testid="filter-text-input"
                            type="text"
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            placeholder="Text filter..."
                            className="rounded-md pl-8 pr-3 py-1.5 text-sm outline-none w-64"
                            style={inputStyle}
                        />
                        <svg className="absolute left-2.5 top-2 h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>

                {results.length > 0 && (
                    <div className="flex justify-between items-center text-sm opacity-60 px-1">
                        <div>Found {results.length} total results</div>
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

            <div className="rounded-lg border border-neutral-800 overflow-hidden shadow-xl bg-[#1a1a1a]">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-[#262626] text-neutral-400 font-medium border-b border-neutral-800">
                            <tr className="uppercase text-xs font-semibold tracking-wider">
                                <th
                                    id="sort-indexer"
                                    data-testid="sort-indexer"
                                    className="px-6 py-4 cursor-pointer hover:text-white select-none transition-colors"
                                    onClick={() => handleSort('Indexer')}
                                >
                                    <div className="flex items-center gap-1">
                                        Indexer
                                        <SortIcon field="Indexer" />
                                    </div>
                                </th>
                                <th
                                    id="sort-title"
                                    data-testid="sort-title"
                                    className="px-6 py-4 w-1/2 cursor-pointer hover:text-white select-none transition-colors"
                                    onClick={() => handleSort('Title')}
                                >
                                    <div className="flex items-center gap-1">
                                        Title
                                        <SortIcon field="Title" />
                                    </div>
                                </th>
                                <th
                                    id="sort-size"
                                    data-testid="sort-size"
                                    className="px-6 py-4 text-right cursor-pointer hover:text-white select-none transition-colors"
                                    onClick={() => handleSort('Size')}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        Size
                                        <SortIcon field="Size" />
                                    </div>
                                </th>
                                <th
                                    id="sort-seeders"
                                    data-testid="sort-seeders"
                                    className="px-6 py-4 text-right cursor-pointer hover:text-white select-none transition-colors"
                                    onClick={() => handleSort('Seeders')}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        S/L
                                        <SortIcon field="Seeders" />
                                    </div>
                                </th>
                                <th
                                    id="sort-date"
                                    data-testid="sort-date"
                                    className="px-6 py-4 text-right cursor-pointer hover:text-white select-none transition-colors"
                                    onClick={() => handleSort('Date')}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        Date
                                        <SortIcon field="Date" />
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800">
                            {paginatedResults.length === 0 && !loading && !error && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-neutral-500">
                                        {query ? (selectedIndexers ? 'No results found' : 'Select an indexer and enter a query') : 'Select an indexer to start'}
                                    </td>
                                </tr>
                            )}
                            {paginatedResults.map((result, idx) => (
                                <tr key={idx} className="hover:opacity-80 transition-colors">
                                    <td className="px-6 py-4 text-sm opacity-70">
                                        <span className="px-2 py-1 rounded text-xs text-nowrap" style={{ backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)' }}>
                                            {result.Indexer || 'Unknown'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {result.Comments ? (
                                            <a
                                                href={result.Comments}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="font-medium transition-colors block truncate max-w-lg"
                                                style={{ color: 'var(--theme-accent)' }}
                                                title={result.Title}
                                            >
                                                {result.Title}
                                            </a>
                                        ) : (
                                            <span className="font-medium block truncate max-w-lg" title={result.Title}>
                                                {result.Title}
                                            </span>
                                        )}
                                        <div className="text-xs opacity-50 mt-1 flex gap-2">
                                            {result.Category?.map(c => (
                                                <span key={c} className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-bg)' }}>{TORZNAB_CATEGORIES[c] || c}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm opacity-80 text-right font-mono whitespace-nowrap">
                                        {formatSize(result.Size)}
                                    </td>
                                    <td className="px-6 py-4 text-right whitespace-nowrap">
                                        <div className="flex justify-end gap-3 text-sm font-mono">
                                            <span className="text-emerald-400">{result.Seeders ?? '-'}</span>
                                            <span className="text-red-400 opacity-80">{result.Peers ?? '-'}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm opacity-70 text-right whitespace-nowrap">
                                        {formatDate(result.PublishDate)}
                                    </td>
                                    <td className="px-6 py-4 text-center flex justify-end gap-2">
                                        {downloadConfigured && (
                                            <button
                                                onClick={() => handleServerDownload(result.Link || '', result.Title)}
                                                disabled={downloading === result.Link}
                                                className="p-2 opacity-70 hover:opacity-100 rounded-full transition-all disabled:opacity-50"
                                                title="Download to Server (Blackhole)"
                                                style={{ color: 'var(--theme-accent)' }}
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
                                            href={`/api/v2.0/indexers/${encodeURIComponent(result.IndexerId || result.Indexer || '')}/dl?link=${encodeURIComponent(result.Link || '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-block p-2 opacity-70 hover:opacity-100 rounded-full transition-all"
                                            title="Download .torrent locally"
                                            style={{ color: 'var(--theme-accent)' }}
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
                            className="px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            style={buttonSecondaryStyle}
                        >
                            Previous
                        </button>
                        <div className="flex items-center px-4 opacity-60">
                            Page {currentPage} of {totalPages}
                        </div>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage >= totalPages}
                            className="px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            style={buttonSecondaryStyle}
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
        return new Date(dateStr).toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch {
        return dateStr;
    }
}
