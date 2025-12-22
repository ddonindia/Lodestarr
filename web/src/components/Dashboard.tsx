import { useEffect, useState, useMemo } from 'react';
import { Activity, Database, Zap, TrendingUp, RefreshCw, TestTube, HardDrive, Cpu } from 'lucide-react';
import { Card, CardHeader, CardBody, CardTitle, Button, Badge, Spinner } from './ui';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
    indexers_native: number;
    indexers_proxied: number;
    indexers_enabled: number;
    uptime_seconds: number;
    total_searches: number;
    avg_search_time_ms: number;
    recent_searches: SearchLog[];
}

export default function Dashboard() {
    const [stats, setStats] = useState<StatsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        loadStats();
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
            new Promise(resolve => setTimeout(resolve, 1500)),
            {
                loading: 'Testing indexers...',
                success: 'All indexers responded within timeout',
                error: 'Failed to test',
            }
        ).finally(() => setTesting(false));
    };

    // Data for the chart - group searches by time bucket
    const chartData = useMemo(() => {
        if (!stats?.recent_searches || stats.recent_searches.length === 0) return [];

        const sorted = stats.recent_searches.map(s => {
            let ts = 0;
            if (typeof s.timestamp === 'string') {
                ts = new Date(s.timestamp).getTime();
            } else if (s.timestamp && 'secs_since_epoch' in s.timestamp) {
                ts = s.timestamp.secs_since_epoch * 1000;
            }
            return { ...s, timestamp_ms: ts };
        }).sort((a, b) => a.timestamp_ms - b.timestamp_ms);

        return sorted.map(s => ({
            time: new Date(s.timestamp_ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            results: s.result_count,
            query: s.query.length > 15 ? s.query.substring(0, 15) + '...' : s.query
        }));
    }, [stats]);

    if (loading && !stats) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Indexers"
                    value={stats?.indexers_loaded ?? 0}
                    icon={<Database className="w-6 h-6" />}
                    color="purple"
                    trend={`${stats?.indexers_enabled ?? 0} enabled, ${stats?.indexers_proxied ?? 0} proxied`}
                />
                <StatCard
                    title="Avg Response"
                    value={`${(stats?.avg_search_time_ms ?? 0).toFixed(0)}ms`}
                    icon={<TrendingUp className="w-6 h-6" />}
                    color="cyan"
                    trend="Search performance"
                />
                <StatCard
                    title="Total Searches"
                    value={stats?.total_searches ?? 0}
                    icon={<Activity className="w-6 h-6" />}
                    color="blue"
                    trend="Cumulative session searches"
                />
                <StatCard
                    title="Uptime"
                    value={formatUptime(stats?.uptime_seconds ?? 0)}
                    icon={<Zap className="w-6 h-6" />}
                    color="green"
                    badge={<Badge variant="success">Online</Badge>}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Search Activity Trend</CardTitle>
                        <Badge variant="neutral">Results per Search</Badge>
                    </CardHeader>
                    <CardBody className="h-[300px]">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="colorResults" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                    <XAxis
                                        dataKey="time"
                                        stroke="#888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        stroke="#888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#171717', border: '1px solid #333', borderRadius: '8px' }}
                                        itemStyle={{ color: '#10b981' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="results"
                                        stroke="#10b981"
                                        fillOpacity={1}
                                        fill="url(#colorResults)"
                                        name="Result Count"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-neutral-500">
                                <Activity className="w-12 h-12 mb-2 opacity-20" />
                                <p>No search data available for trend</p>
                            </div>
                        )}
                    </CardBody>
                </Card>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Indexer Breakdown</CardTitle>
                        </CardHeader>
                        <CardBody className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <HardDrive className="w-4 h-4 text-purple-500" />
                                    <span className="text-sm font-medium">Native Indexers</span>
                                </div>
                                <span className="font-bold">{stats?.indexers_native ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Cpu className="w-4 h-4 text-emerald-500" />
                                    <span className="text-sm font-medium">Proxied Indexers</span>
                                </div>
                                <span className="font-bold">{stats?.indexers_proxied ?? 0}</span>
                            </div>
                            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
                                <div className="flex items-center justify-between text-xs text-neutral-500">
                                    <span>Total Configured</span>
                                    <span>{stats?.indexers_loaded ?? 0}</span>
                                </div>
                            </div>
                        </CardBody>
                    </Card>

                    <Card>
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
                                onClick={() => loadStats()}
                            >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Refresh Stats
                            </Button>
                        </CardBody>
                    </Card>
                </div>
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
        <Card className="relative overflow-hidden border border-neutral-800 bg-[#262626]">
            <CardBody className="p-4">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${colors[color]}`}>
                        {icon}
                    </div>
                    <div>
                        <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
                            {title}
                        </p>
                        <h3 className="text-2xl font-bold text-white mt-0.5">
                            {value}
                        </h3>
                        {trend && (
                            <p className="text-[11px] text-neutral-500 mt-1">
                                {trend}
                            </p>
                        )}
                        {badge && <div className="mt-1">{badge}</div>}
                    </div>
                </div>
            </CardBody>
        </Card>
    );
}
