import { useEffect, useState } from 'react';
import { Search, Trash2, RefreshCw, Eye, X, ExternalLink, Magnet, Download, Info, Copy, Check } from 'lucide-react';
import { Card, CardHeader, CardBody, CardTitle, Button, Badge, Spinner } from './ui';
import toast from 'react-hot-toast';

interface CachedSearch {
    cache_key: string;
    query: string;
    indexer: string;
    expires_at: string;
    result_count: number;
}

interface TorrentResult {
    title: string;
    guid: string;
    link?: string;
    details?: string;
    magnet?: string;
    seeders?: number;
    leechers?: number;
    size?: number;
    indexer?: string;
    info_hash?: string;
    grabs?: number;
    categories?: number[];
    publish_date?: string;
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

    useEffect(() => {
        loadActivity();
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

    const formatSize = (bytes?: number) => {
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
                        <div className="overflow-auto flex-1 p-4">
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
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-[#262626] text-neutral-400 font-medium sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2">Title</th>
                                            <th className="px-4 py-2 text-center">Size</th>
                                            <th className="px-4 py-2 text-center">S/L</th>
                                            <th className="px-4 py-2 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-800">
                                        {selectedResults.map((result, idx) => (
                                            <tr key={idx} className="hover:bg-white/5">
                                                <td className="px-4 py-2 max-w-md">
                                                    <div className="truncate text-white" title={result.title}>
                                                        {result.title}
                                                    </div>
                                                    {result.indexer && (
                                                        <div className="mt-1">
                                                            <Badge variant="neutral" size="sm">
                                                                {result.indexer}
                                                            </Badge>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2 text-center text-neutral-400">
                                                    {formatSize(result.size)}
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                    <span className="text-green-500">{result.seeders ?? '-'}</span>
                                                    <span className="text-neutral-500"> / </span>
                                                    <span className="text-red-500">{result.leechers ?? '-'}</span>
                                                </td>
                                                <td className="px-4 py-2 text-right space-x-1">
                                                    <button
                                                        onClick={() => setInspectedResult(result)}
                                                        className="inline-flex items-center px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-xs"
                                                        title="Inspect details"
                                                    >
                                                        <Info className="w-3 h-3" />
                                                    </button>
                                                    {result.details && (
                                                        <a
                                                            href={result.details}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-xs"
                                                        >
                                                            <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                    )}
                                                    {result.magnet && (
                                                        <a
                                                            href={result.magnet}
                                                            className="inline-flex items-center px-2 py-1 bg-purple-600 hover:bg-purple-500 rounded text-xs"
                                                        >
                                                            <Magnet className="w-3 h-3" />
                                                        </a>
                                                    )}
                                                    {result.link && !result.link.startsWith('magnet:') && (
                                                        <a
                                                            href={result.link}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
                                                        >
                                                            <Download className="w-3 h-3" />
                                                        </a>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div className="p-4 border-t border-neutral-800 text-center text-neutral-400 text-sm">
                            {selectedResults.length} results
                        </div>
                    </div>
                </div>
            )}

            {/* Inspect Modal */}
            {inspectedResult && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
                    <div className="bg-[#1e1e1e] rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col border border-neutral-700">
                        <div className="flex items-center justify-between p-4 border-b border-neutral-700 bg-[#262626]">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Info className="w-5 h-5 text-blue-400" />
                                Result Details
                            </h3>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setInspectedResult(null)}
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="overflow-auto flex-1 p-4 space-y-4">
                            {/* Title */}
                            <div>
                                <label className="block text-xs text-neutral-400 mb-1">Title</label>
                                <div className="text-white font-medium">{inspectedResult.title}</div>
                            </div>

                            {/* Basic Info */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Size</label>
                                    <div className="text-white">{formatSize(inspectedResult.size)}</div>
                                </div>
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Seeders</label>
                                    <div className="text-green-500">{inspectedResult.seeders ?? '-'}</div>
                                </div>
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Leechers</label>
                                    <div className="text-red-500">{inspectedResult.leechers ?? '-'}</div>
                                </div>
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Indexer</label>
                                    <div className="text-white">{inspectedResult.indexer || '-'}</div>
                                </div>
                            </div>

                            {/* Info Hash */}
                            {inspectedResult.info_hash && (
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Info Hash</label>
                                    <div className="flex items-center gap-2">
                                        <code className="text-xs bg-neutral-800 px-2 py-1 rounded text-amber-400 flex-1 truncate">
                                            {inspectedResult.info_hash}
                                        </code>
                                        <button
                                            onClick={() => copyToClipboard(inspectedResult.info_hash!, 'hash')}
                                            className="p-1 hover:bg-neutral-700 rounded"
                                        >
                                            {copiedField === 'hash' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-neutral-400" />}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Magnet Link */}
                            {inspectedResult.magnet && (
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Magnet Link</label>
                                    <div className="flex items-center gap-2">
                                        <code className="text-xs bg-neutral-800 px-2 py-1 rounded text-purple-400 flex-1 truncate">
                                            {inspectedResult.magnet}
                                        </code>
                                        <button
                                            onClick={() => copyToClipboard(inspectedResult.magnet!, 'magnet')}
                                            className="p-1 hover:bg-neutral-700 rounded"
                                        >
                                            {copiedField === 'magnet' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-neutral-400" />}
                                        </button>
                                        <a
                                            href={inspectedResult.magnet}
                                            className="p-1 hover:bg-purple-600 bg-purple-700 rounded"
                                        >
                                            <Magnet className="w-4 h-4" />
                                        </a>
                                    </div>
                                </div>
                            )}

                            {/* Download Link */}
                            {inspectedResult.link && !inspectedResult.link.startsWith('magnet:') && (
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Download URL (Proxy)</label>
                                    <div className="flex items-center gap-2">
                                        <code className="text-xs bg-neutral-800 px-2 py-1 rounded text-blue-400 flex-1 truncate">
                                            {inspectedResult.link}
                                        </code>
                                        <button
                                            onClick={() => copyToClipboard(inspectedResult.link!, 'link')}
                                            className="p-1 hover:bg-neutral-700 rounded"
                                        >
                                            {copiedField === 'link' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-neutral-400" />}
                                        </button>
                                        <a
                                            href={inspectedResult.link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1 hover:bg-blue-600 bg-blue-700 rounded"
                                        >
                                            <Download className="w-4 h-4" />
                                        </a>
                                    </div>
                                </div>
                            )}

                            {/* Details URL */}
                            {inspectedResult.details && (
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Details Page</label>
                                    <div className="flex items-center gap-2">
                                        <code className="text-xs bg-neutral-800 px-2 py-1 rounded text-cyan-400 flex-1 truncate">
                                            {inspectedResult.details}
                                        </code>
                                        <button
                                            onClick={() => copyToClipboard(inspectedResult.details!, 'details')}
                                            className="p-1 hover:bg-neutral-700 rounded"
                                        >
                                            {copiedField === 'details' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-neutral-400" />}
                                        </button>
                                        <a
                                            href={inspectedResult.details}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1 hover:bg-cyan-600 bg-cyan-700 rounded"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    </div>
                                </div>
                            )}

                            {/* GUID */}
                            {inspectedResult.guid && (
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">GUID</label>
                                    <div className="flex items-center gap-2">
                                        <code className="text-xs bg-neutral-800 px-2 py-1 rounded text-neutral-300 flex-1 truncate">
                                            {inspectedResult.guid}
                                        </code>
                                        <button
                                            onClick={() => copyToClipboard(inspectedResult.guid, 'guid')}
                                            className="p-1 hover:bg-neutral-700 rounded"
                                        >
                                            {copiedField === 'guid' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-neutral-400" />}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
