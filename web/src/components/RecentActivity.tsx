
import { useEffect, useState } from 'react';
import { Search, Trash2, RefreshCw, Eye, X } from 'lucide-react';
import { Card, CardHeader, CardBody, CardTitle, Button, Badge, Spinner } from './ui';
import toast from 'react-hot-toast';
import type { TorrentResult } from '../types';
import SearchResultsTable from './SearchResultsTable';
import ResultDetailsModal from './ResultDetailsModal';

interface CachedSearch {
    cache_key: string;
    query: string;
    indexer: string;
    expires_at: string;
    result_count: number;
}

export default function RecentActivity() {
    const [cachedSearches, setCachedSearches] = useState<CachedSearch[]>([]);
    const [loading, setLoading] = useState(true);
    const [clearing, setClearing] = useState(false);
    const [selectedResults, setSelectedResults] = useState<TorrentResult[] | null>(null);
    const [selectedQuery, setSelectedQuery] = useState('');
    const [loadingResults, setLoadingResults] = useState(false);
    const [inspectedResult, setInspectedResult] = useState<TorrentResult | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    // Download state for shared table compatibility
    const [downloadConfigured, setDownloadConfigured] = useState(false);
    const [downloading, setDownloading] = useState<string | null>(null);

    useEffect(() => {
        loadActivity();
        // Check if download path matches (for shared table compatibility)
        fetch('/api/settings/download')
            .then(res => res.json())
            .then(data => setDownloadConfigured(!!data.path))
            .catch(() => { });
    }, []);

    const loadActivity = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/history');
            if (res.ok) {
                const data: CachedSearch[] = await res.json();
                setCachedSearches(data);
            }
        } catch (err) {
            console.error('Failed to load activity:', err);
            toast.error('Failed to load activity.');
        } finally {
            setLoading(false);
        }
    };

    const clearActivity = async () => {
        setClearing(true);
        try {
            const res = await fetch('/api/settings/cache/clear', { method: 'POST' });
            if (res.ok) {
                toast.success('Cache cleared');
                setCachedSearches([]);
            } else {
                throw new Error('Failed to clear');
            }
        } catch (err) {
            toast.error('Failed to clear cache');
        } finally {
            setClearing(false);
        }
    };

    const viewResults = async (cacheKey: string, query: string) => {
        setLoadingResults(true);
        setSelectedQuery(query);
        try {
            const encodedKey = encodeURIComponent(cacheKey);
            const res = await fetch(`/api/history/${encodedKey}`);
            if (res.ok) {
                const results: TorrentResult[] = await res.json();
                setSelectedResults(results);
            } else {
                toast.error('Cached results expired or not found');
            }
        } catch (err) {
            toast.error('Failed to load cached results');
        } finally {
            setLoadingResults(false);
        }
    };

    const copyToClipboard = async (text: string, field: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 2000);
            toast.success('Copied to clipboard');
        } catch {
            toast.error('Failed to copy');
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
                toast.error('Download failed');
            } else {
                toast.success('Download started');
            }
        } catch (err) {
            console.error('Download error', err);
            toast.error('Download error');
        } finally {
            setDownloading(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Recent Searches</CardTitle>
                    <div className="flex items-center gap-2">
                        <Badge variant="neutral">{cachedSearches.length} cached</Badge>
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
                            disabled={clearing || cachedSearches.length === 0}
                            loading={clearing}
                        >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Clear
                        </Button>
                    </div>
                </CardHeader>
                <CardBody className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[#262626] text-neutral-400 font-medium border-b border-neutral-800">
                                <tr>
                                    <th className="px-6 py-3">Query</th>
                                    <th className="px-6 py-3">Indexer</th>
                                    <th className="px-6 py-3 text-center">Results</th>
                                    <th className="px-6 py-3">Expires</th>
                                    <th className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800 bg-[#1a1a1a]">
                                {cachedSearches.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center opacity-50">
                                            <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                            <p>No recent searches</p>
                                        </td>
                                    </tr>
                                ) : (
                                    cachedSearches.map((search, idx) => (
                                        <tr key={idx} className="hover:bg-white/5 transition-colors">
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
                                                {new Date(search.expires_at).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => viewResults(search.cache_key, search.query)}
                                                    disabled={search.result_count === 0}
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
                    </div>
                </CardBody>
            </Card>

            {/* Results Modal */}
            {selectedResults !== null && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-[#1a1a1a] rounded-lg max-w-5xl w-full max-h-[80vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                            <h3 className="text-lg font-semibold text-white">
                                Results: "{selectedQuery || 'Search'}"
                            </h3>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setSelectedResults(null)}
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="overflow-auto flex-1 p-0">
                            {loadingResults ? (
                                <div className="flex items-center justify-center py-12">
                                    <Spinner size="lg" />
                                </div>
                            ) : selectedResults.length === 0 ? (
                                <div className="text-center py-12 opacity-50">
                                    <Search className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                    <p>No results</p>
                                </div>
                            ) : (
                                <SearchResultsTable
                                    results={selectedResults}
                                    onInspect={setInspectedResult}
                                    onDownload={handleServerDownload}
                                    downloadConfigured={downloadConfigured}
                                    downloadingId={downloading}
                                    variant="simple"
                                />
                            )}
                        </div>
                        <div className="p-4 border-t border-neutral-800 text-center text-neutral-400 text-sm">
                            {selectedResults.length} results
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
            />
        </div>
    );
}
