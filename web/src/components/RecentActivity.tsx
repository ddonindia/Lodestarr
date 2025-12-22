import { useEffect, useState } from 'react';
import { Search, Trash2, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardBody, CardTitle, Button, Badge, Spinner } from './ui';
import toast from 'react-hot-toast';

interface SearchLog {
    query: string;
    indexer: string;
    timestamp: { secs_since_epoch: number; nanos_since_epoch: number } | string;
    result_count: number;
}

interface StatsResponse {
    recent_searches: SearchLog[];
}

export default function RecentActivity() {
    const [searches, setSearches] = useState<SearchLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [clearing, setClearing] = useState(false);

    useEffect(() => {
        loadActivity();
    }, []);

    const loadActivity = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/stats');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: StatsResponse = await res.json();
            setSearches(data.recent_searches || []);
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
            const res = await fetch('/api/settings/activity/clear', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                toast.success(`Cleared ${data.deleted} activity entries`);
                setSearches([]);
            } else {
                throw new Error('Failed to clear');
            }
        } catch (err) {
            toast.error('Failed to clear activity');
        } finally {
            setClearing(false);
        }
    };

    const recentSearches = searches.map(s => {
        let ts = 0;
        if (typeof s.timestamp === 'string') {
            ts = new Date(s.timestamp).getTime();
        } else if (s.timestamp && 'secs_since_epoch' in s.timestamp) {
            ts = s.timestamp.secs_since_epoch * 1000;
        }
        return { ...s, timestamp_ms: ts };
    }).slice(0, 4);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Recent Activity</CardTitle>
                    <div className="flex items-center gap-2">
                        <Badge variant="neutral">{recentSearches.length} items</Badge>
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
                            disabled={clearing || searches.length === 0}
                            loading={clearing}
                        >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Clear All
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
                                    <th className="px-6 py-3">Time</th>
                                    <th className="px-6 py-3 text-right">Results</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800 bg-[#1a1a1a]">
                                {recentSearches.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center opacity-50">
                                            <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                            <p>No recent activity</p>
                                        </td>
                                    </tr>
                                ) : (
                                    recentSearches.map((search, idx) => (
                                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-3 font-medium text-white max-w-xs truncate" title={search.query}>
                                                {search.query}
                                            </td>
                                            <td className="px-6 py-3">
                                                <Badge variant="neutral" size="sm">{search.indexer}</Badge>
                                            </td>
                                            <td className="px-6 py-3 text-neutral-400 font-mono text-xs">
                                                {new Date(search.timestamp_ms).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                <Badge variant={search.result_count > 0 ? "success" : "neutral"} size="sm">
                                                    {search.result_count} found
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardBody>
            </Card>
        </div>
    );
}
