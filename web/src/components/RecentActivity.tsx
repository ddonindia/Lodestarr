import { useEffect, useState, useCallback } from 'react';
import { Search, Trash2, RefreshCw, Eye, X } from 'lucide-react';
import { Card, CardHeader, CardBody, CardTitle, Button, Badge, Spinner } from './ui';
import toast from 'react-hot-toast';
import type { TorrentResult, SortField } from '../types';
import { 
    getResultTitle, 
    getResultGuid, 
    getResultLink, 
    getResultMagnet, 
    getResultDetails, 
    getResultDate, 
    getResultCategories, 
    getResultSize, 
    getResultSeeders, 
    getResultPeers, 
    getResultIndexer, 
    getResultIndexerId, 
    getResultInfoHash, 
    getResultPoster, 
    getResultCategory 
} from '../types';
import SearchResultsTable from './SearchResultsTable';
import ResultDetailsModal from './ResultDetailsModal';
import { useDownloadClients } from '../hooks/useDownloadClients';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { useTorrentMeta } from '../hooks/useTorrentMeta';
import { SearchPagination, SearchFiltersBar } from './search/index';
import { inputStyle } from '../styles/shared';
import { TORZNAB_CATEGORIES } from '../constants/categories';

interface RecentSearch {
    id: number;
    query: string;
    indexer: string;
    timestamp: string;
    result_count: number;
    has_results: boolean;
}

interface HistoryResponse {
    results: RecentSearch[];
    total: number;
}

export default function RecentActivity() {
    const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [clearing, setClearing] = useState(false);
    const [selectedResults, setSelectedResults] = useState<TorrentResult[] | null>(null);
    const [selectedQuery, setSelectedQuery] = useState('');
    const [loadingResults, setLoadingResults] = useState(false);
    const [inspectedResult, setInspectedResult] = useState<TorrentResult | null>(null);

    // Search & Pagination (Main History List)
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const limit = 25;

    // Modal Results State (Filtering & Pagination)
    const [modalFilterText, setModalFilterText] = useState('');
    const [modalFilterIndexer, setModalFilterIndexer] = useState('');
    const [modalFilterCategory, setModalFilterCategory] = useState('');
    const [modalSortField, setModalSortField] = useState<SortField | null>('Seeders');
    const [modalSortDirection, setModalSortDirection] = useState<'asc' | 'desc'>('desc');
    const [modalCurrentPage, setModalCurrentPage] = useState(1);
    const modalItemsPerPage = 25;

    // Use the shared hooks
    const { clients, handleSendToClient, downloadConfigured, downloading, handleServerDownload, downloadedLinks } = useDownloadClients();
    const { copiedField, copyToClipboard } = useCopyToClipboard();
    const { torrentMeta, loadingMeta, fetchTorrentMeta } = useTorrentMeta();

    const loadActivity = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                limit: limit.toString(),
                offset: ((currentPage - 1) * limit).toString(),
            });
            if (searchTerm) params.append('q', searchTerm);

            const res = await fetch(`/api/history?${params.toString()}`);
            if (res.ok) {
                const data: HistoryResponse = await res.json();
                setRecentSearches(data.results);
                setTotalCount(data.total);
            }
        } catch (err) {
            console.error('Failed to load activity:', err);
            toast.error('Failed to load activity.');
        } finally {
            setLoading(false);
        }
    }, [currentPage, searchTerm, limit]);

    useEffect(() => {
        loadActivity();
    }, [loadActivity]);

    const clearActivity = async () => {
        setClearing(true);
        try {
            const res = await fetch('/api/stats/clear', { method: 'POST' });
            if (res.ok) {
                toast.success('Search history cleared');
                setRecentSearches([]);
                setTotalCount(0);
            } else {
                throw new Error('Failed to clear');
            }
        } catch (err) {
            toast.error('Failed to clear history');
        } finally {
            setClearing(false);
        }
    };

    const viewResults = async (id: number, query: string) => {
        setLoadingResults(true);
        setSelectedQuery(query);
        // Reset modal filters/pagination when opening new results
        setModalFilterText('');
        setModalFilterIndexer('');
        setModalFilterCategory('');
        setModalSortField('Seeders');
        setModalSortDirection('desc');
        setModalCurrentPage(1);

        try {
            const res = await fetch(`/api/history/${id}`);
            if (res.ok) {
                const data: any[] = await res.json();
                // Normalize results to always use PascalCase (Indexer, Title, Category, etc.)
                // This is needed because native results might be stored with lowercase fields in history
                const normalized: TorrentResult[] = (data || []).map(r => ({
                    Title: getResultTitle(r),
                    Guid: getResultGuid(r),
                    Link: getResultLink(r),
                    Magnet: getResultMagnet(r),
                    Comments: getResultDetails(r),
                    PublishDate: getResultDate(r),
                    Category: getResultCategories(r),
                    Size: getResultSize(r),
                    Seeders: getResultSeeders(r),
                    Peers: getResultPeers(r),
                    Indexer: getResultIndexer(r),
                    IndexerId: getResultIndexerId(r),
                    InfoHash: getResultInfoHash(r),
                    Poster: getResultPoster(r),
                    Grabs: r.Grabs ?? r.grabs ?? 0,
                    category: getResultCategory(r)
                }));
                setSelectedResults(normalized);
            } else {
                toast.error('Results not available for this search');
            }
        } catch (err) {
            toast.error('Failed to load results');
        } finally {
            setLoadingResults(false);
        }
    };

    const totalPages = Math.ceil(totalCount / limit);

    // Derived modal state
    const modalResultIndexers = Array.from(new Set((selectedResults || []).map(r => r.Indexer || 'Unknown').filter(Boolean))).sort();

    const handleModalSort = (field: SortField) => {
        if (modalSortField === field) {
            setModalSortDirection(modalSortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setModalSortField(field);
            setModalSortDirection('desc');
        }
    };

    const filteredAndSortedModalResults = (selectedResults || [])
        .filter(r => {
            if (modalFilterIndexer && r.Indexer !== modalFilterIndexer) return false;
            if (modalFilterCategory) {
                const catId = parseInt(modalFilterCategory);
                if (!r.Category || !r.Category.includes(catId)) return false;
            }
            if (!modalFilterText) return true;
            const lower = modalFilterText.toLowerCase();
            return r.Title.toLowerCase().includes(lower) ||
                (r.Indexer?.toLowerCase().includes(lower)) ||
                (r.Category || []).some(c => (TORZNAB_CATEGORIES[c] || '').toLowerCase().includes(lower));
        })
        .sort((a, b) => {
            if (!modalSortField) return 0;

            let valA: string | number | null = null;
            let valB: string | number | null = null;

            switch (modalSortField) {
                case 'Indexer': valA = a.Indexer || ''; valB = b.Indexer || ''; break;
                case 'Title': valA = a.Title || ''; valB = b.Title || ''; break;
                case 'Size': valA = a.Size || 0; valB = b.Size || 0; break;
                case 'Seeders': valA = a.Seeders || 0; valB = b.Seeders || 0; break;
                case 'Date': valA = a.PublishDate ? new Date(a.PublishDate).getTime() : 0; valB = b.PublishDate ? new Date(b.PublishDate).getTime() : 0; break;
            }

            if (valA < valB) return modalSortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return modalSortDirection === 'asc' ? 1 : -1;
            return 0;
        });

    const modalTotalPages = Math.ceil(filteredAndSortedModalResults.length / modalItemsPerPage);
    const paginatedModalResults = filteredAndSortedModalResults.slice(
        (modalCurrentPage - 1) * modalItemsPerPage,
        modalCurrentPage * modalItemsPerPage
    );

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <Card>
                <CardHeader className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <CardTitle>Recent Searches</CardTitle>
                        <Badge variant="neutral">{totalCount} total</Badge>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                        <div className="relative flex-1 sm:min-w-[250px] w-full">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                                placeholder="Filter history..."
                                className="w-full rounded-lg pl-9 pr-4 py-2 outline-none text-sm"
                                style={inputStyle}
                            />
                            <Search className="absolute left-3 top-2.5 h-4 w-4 opacity-50" />
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={loadActivity}
                                disabled={loading}
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={clearActivity}
                                disabled={clearing || totalCount === 0}
                                loading={clearing}
                            >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Clear
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardBody className="p-0">
                    <div className="overflow-x-auto">
                        {loading && recentSearches.length === 0 ? (
                            <div className="flex items-center justify-center py-20">
                                <Spinner size="lg" />
                            </div>
                        ) : (
                            <table className="w-full text-left text-sm">
                                <thead className="bg-[#262626] text-neutral-400 font-medium border-b border-neutral-800">
                                    <tr>
                                        <th className="px-6 py-3">Query</th>
                                        <th className="px-6 py-3">Indexer</th>
                                        <th className="px-6 py-3 text-center">Results</th>
                                        <th className="px-6 py-3">Time</th>
                                        <th className="px-6 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-800 bg-[#1a1a1a]">
                                    {recentSearches.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center opacity-50">
                                                <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                                <p>No recent searches matching your filter</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        recentSearches.map((search) => (
                                            <tr key={search.id} className="hover:bg-white/5 transition-colors">
                                                <td className="px-6 py-3 font-medium text-white max-w-xs truncate" title={search.query}>
                                                    {search.query || '(empty)'}
                                                </td>
                                                <td className="px-6 py-3">
                                                    <Badge variant="neutral" size="sm">{search.indexer}</Badge>
                                                </td>
                                                <td className="px-6 py-3 text-center">
                                                    <Badge variant={search.result_count > 0 ? "success" : "neutral"} size="sm">
                                                        {search.result_count}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-3 text-neutral-400 font-mono text-xs">
                                                    {new Date(search.timestamp).toLocaleString()}
                                                </td>
                                                <td className="px-6 py-3 text-right">
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => viewResults(search.id, search.query)}
                                                        disabled={!search.has_results}
                                                    >
                                                        <Eye className="w-4 h-4 mr-1" />
                                                        View
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </CardBody>
                {totalCount > 0 && (
                    <div className="p-4 border-t border-neutral-800">
                        <SearchPagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalResults={totalCount}
                            filteredCount={recentSearches.length}
                            onPageChange={setCurrentPage}
                        />
                    </div>
                )}
            </Card>

            {/* Results Modal */}
            {selectedResults !== null && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-[#1a1a1a] rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-neutral-800">
                        <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-[#262626]">
                            <h3 className="text-lg font-semibold text-white">
                                Results: "{selectedQuery || 'Search'}"
                            </h3>
                            <div className="flex items-center gap-4">
                                <Badge variant="neutral">{selectedResults.length} total results</Badge>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setSelectedResults(null)}
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="p-3 bg-[#1e1e1e] border-b border-neutral-800">
                            <SearchFiltersBar
                                filterIndexer={modalFilterIndexer}
                                setFilterIndexer={setModalFilterIndexer}
                                filterCategory={modalFilterCategory}
                                setFilterCategory={setModalFilterCategory}
                                filterText={modalFilterText}
                                setFilterText={(text) => {
                                    setModalFilterText(text);
                                    setModalCurrentPage(1);
                                }}
                                resultIndexers={modalResultIndexers}
                                results={selectedResults}
                            />
                        </div>

                        <div className="overflow-auto flex-1 p-0">
                            {loadingResults ? (
                                <div className="flex items-center justify-center py-12">
                                    <Spinner size="lg" />
                                </div>
                            ) : paginatedModalResults.length === 0 ? (
                                <div className="text-center py-24 opacity-50">
                                    <Search className="w-12 h-12 mx-auto mb-2 opacity-10" />
                                    <p>No results found</p>
                                </div>
                            ) : (
                                <SearchResultsTable
                                    results={paginatedModalResults}
                                    onInspect={setInspectedResult}
                                    onDownload={handleServerDownload}
                                    downloadConfigured={downloadConfigured}
                                    downloadingId={downloading}
                                    variant="full"
                                    sortField={modalSortField}
                                    sortDirection={modalSortDirection}
                                    onSort={handleModalSort}
                                    clients={clients}
                                    onSendToClient={handleSendToClient}
                                    downloadedLinks={downloadedLinks}
                                />
                            )}
                        </div>
                        
                        <div className="p-4 border-t border-neutral-800 bg-[#262626]">
                            <SearchPagination
                                currentPage={modalCurrentPage}
                                totalPages={modalTotalPages}
                                totalResults={filteredAndSortedModalResults.length}
                                filteredCount={paginatedModalResults.length}
                                onPageChange={setModalCurrentPage}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Inspect Modal */}
            <ResultDetailsModal
                result={inspectedResult}
                onClose={() => setInspectedResult(null)}
                onCopyToClipboard={copyToClipboard}
                copiedField={copiedField}
                clients={clients}
                onSendToClient={handleSendToClient}
                downloadConfigured={downloadConfigured}
                onDownload={handleServerDownload}
                downloadingId={downloading}
                onFetchMeta={fetchTorrentMeta}
                loadingMeta={loadingMeta}
                torrentMeta={torrentMeta}
            />
        </div>
    );
}
