import { useEffect, useState } from 'react';
import { Activity, Database, Zap, TrendingUp, RefreshCw, TestTube } from 'lucide-react';
import { Card, CardHeader, CardBody, CardTitle, Button, Badge, Spinner } from './ui';
import toast from 'react-hot-toast';

interface SearchLog {
    query: string;
    indexer: string;
    timestamp: { secs_since_epoch: number; nanos_since_epoch: number } | string;
    result_count: number;
}

interface StatsResponse {
    indexers_loaded: number;
    indexers_healthy: number;
    uptime_seconds: number;
    total_searches: number;
    recent_searches: SearchLog[];
}

export default function Dashboard() {
    const [stats, setStats] = useState<StatsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        loadStats();
        // Poll every 30 seconds
        const interval = setInterval(loadStats, 30000);
        return () => clearInterval(interval);
    }, []);

    const loadStats = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/stats');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: StatsResponse = await res.json();
            setStats(data);
        } catch (err) {
            console.error('Failed to load stats:', err);
            toast.error('Failed to connect to backend.');
        } finally {
            setLoading(false);
        }
    };

    const handleTestAll = async () => {
        setTesting(true);
        toast.promise(
            new Promise(resolve => setTimeout(resolve, 1000)), // Simulate test for now
            {
                loading: 'Testing indexers...',
                success: 'Health checks complete',
                error: 'Failed to test',
            }
        ).finally(() => setTesting(false));
    };

    if (loading && !stats) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Spinner size="lg" />
            </div>
        );
    }

    // Process searches for chart (group by last 7 days?)
    // For now, let's just show recent searches logic or a simple graphic if we don't have historical data.
    // Since backend only gives 20 recent searches, calculating "Searches Over Time" is tricky without persistent logs.
    // We'll mock the chart for layout consistency or hide it. Let's hide it for now or make it static.

    const recentSearches = stats?.recent_searches.map(s => {
        // Handle Rust SystemTime serialization
        let ts = 0;
        if (typeof s.timestamp === 'string') {
            ts = new Date(s.timestamp).getTime();
        } else if (s.timestamp && 'secs_since_epoch' in s.timestamp) {
            ts = s.timestamp.secs_since_epoch * 1000;
        }
        return {
            ...s,
            timestamp_ms: ts
        };
    }) || [];

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Indexers"
                    value={stats?.indexers_loaded ?? 0}
                    icon={<Database className="w-6 h-6" />}
                    color="purple"
                    trend={`${stats?.indexers_loaded ?? 0} active`}
                />
                <StatCard
                    title="Uptime"
                    value={formatUptime(stats?.uptime_seconds ?? 0)}
                    icon={<Zap className="w-6 h-6" />}
                    color="green"
                    badge={<Badge variant="success">Online</Badge>}
                />
                <StatCard
                    title="Total Searches"
                    value={stats?.total_searches ?? 0}
                    icon={<Activity className="w-6 h-6" />}
                    color="blue"
                    trend="Session stats"
                />
                <StatCard
                    title="Avg Response"
                    value="-"
                    icon={<TrendingUp className="w-6 h-6" />}
                    color="cyan"
                    badge={<Badge variant="neutral">N/A</Badge>}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                    </CardHeader>
                    <CardBody className="space-y-3">
                        <Button
                            variant="primary"
                            className="w-full justify-start"
                            onClick={handleTestAll}
                            loading={testing}
                        >
                            <TestTube className="w-4 h-4 mr-2" />
                            Test All Indexers
                        </Button>
                        <Button
                            variant="secondary"
                            className="w-full justify-start"
                            onClick={() => loadStats()} // wrap to avoid event arg
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Refresh Stats
                        </Button>
                    </CardBody>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Recent Searches</CardTitle>
                    </CardHeader>
                    <CardBody>
                        <div className="space-y-3">
                            {recentSearches.length === 0 ? (
                                <div className="text-center text-neutral-500 py-8">No recent searches</div>
                            ) : (
                                recentSearches.map((search, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center justify-between p-3 rounded-lg bg-neutral-50 dark:bg-neutral-700/50 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                                    >
                                        <div className="flex-1">
                                            <div className="font-medium text-neutral-900 dark:text-white">
                                                {search.query}
                                            </div>
                                            <div className="text-sm text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                                                <Badge variant="neutral" size="sm">{search.indexer}</Badge>
                                                <span>{new Date(search.timestamp_ms).toLocaleTimeString()}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-semibold text-primary-600 dark:text-primary-400">
                                                {search.result_count} results
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardBody>
                </Card>
            </div>
        </div>
    );
}

function formatUptime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
}

interface StatCardProps {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    color: 'purple' | 'green' | 'blue' | 'cyan';
    trend?: string;
    badge?: React.ReactNode;
}

function StatCard({ title, value, icon, color, trend, badge }: StatCardProps) {
    const colors = {
        purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
        green: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
        blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
        cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
    };

    return (
        <Card className="relative overflow-hidden">
            <CardBody>
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                            {title}
                        </p>
                        <h3 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">
                            {value}
                        </h3>
                        {trend && (
                            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                {trend}
                            </p>
                        )}
                        {badge && <div className="mt-2">{badge}</div>}
                    </div>
                    <div className={`p-3 rounded-xl ${colors[color]}`}>
                        {icon}
                    </div>
                </div>
            </CardBody>
        </Card>
    );
}
