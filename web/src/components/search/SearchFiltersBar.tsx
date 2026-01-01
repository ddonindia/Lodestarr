import type { TorrentResult } from '../../types';
import { TORZNAB_CATEGORIES } from '../../constants/categories';
import { inputStyle } from '../../styles/shared';

interface SearchFiltersBarProps {
    filterIndexer: string;
    setFilterIndexer: (value: string) => void;
    filterCategory: string;
    setFilterCategory: (value: string) => void;
    filterText: string;
    setFilterText: (value: string) => void;
    resultIndexers: string[];
    results: TorrentResult[];
}

export default function SearchFiltersBar({
    filterIndexer,
    setFilterIndexer,
    filterCategory,
    setFilterCategory,
    filterText,
    setFilterText,
    resultIndexers,
    results
}: SearchFiltersBarProps) {
    const categoryIds = Array.from(new Set(results.flatMap(r => r.Category || []))).sort((a, b) => a - b);

    return (
        <div
            className="flex gap-2 items-center p-2 rounded-lg overflow-x-auto scrollbar-hide"
            style={{ backgroundColor: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}
        >
            <span className="text-xs lg:text-sm opacity-60 px-2 font-medium whitespace-nowrap">Filter:</span>

            {/* Indexer Filter */}
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

            {/* Category Filter */}
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
                    {categoryIds.map(catId => (
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

            {/* Text Filter */}
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
    );
}
