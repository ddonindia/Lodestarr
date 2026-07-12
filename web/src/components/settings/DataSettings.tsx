import { useState, useEffect } from 'react';
import { Trash2, Clock } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardBody } from '../ui';
import toast from 'react-hot-toast';

export default function DataSettings() {
    const [clearing, setClearing] = useState(false);
    const [cacheTtl, setCacheTtl] = useState(60);
    const [savingTtl, setSavingTtl] = useState(false);

    useEffect(() => {
        fetch('/api/settings/cache_ttl')
            .then(res => res.json())
            .then(data => {
                if (data.cache_ttl_minutes !== undefined) {
                    setCacheTtl(data.cache_ttl_minutes);
                }
            })
            .catch(() => { });
    }, []);

    const handleSaveCacheTtl = async () => {
        setSavingTtl(true);
        try {
            const res = await fetch('/api/settings/cache_ttl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cache_ttl_minutes: cacheTtl })
            });
            if (res.ok) {
                toast.success('Cache TTL saved');
            } else {
                toast.error('Failed to save Cache TTL');
            }
        } catch {
            toast.error('Failed to save Cache TTL');
        } finally {
            setSavingTtl(false);
        }
    };

    const handleClearAll = async () => {
        if (!confirm('Are you sure you want to clear all data? This will delete:\n• Search history & stats\n• Download history\n• Cached search results\n\nThis cannot be undone.')) {
            return;
        }

        setClearing(true);
        try {
            const res = await fetch('/api/clear-all', { method: 'DELETE' });
            if (res.ok) {
                const text = await res.text();
                toast.success(text || 'All data cleared!');
            } else {
                toast.error('Failed to clear data');
            }
        } catch {
            toast.error('Failed to clear data');
        } finally {
            setClearing(false);
        }
    };

    const handleClearStats = async () => {
        try {
            const res = await fetch('/api/stats', { method: 'DELETE' });
            if (res.ok) {
                toast.success('Search stats cleared');
            }
        } catch {
            toast.error('Failed to clear stats');
        }
    };

    const handleClearDownloads = async () => {
        try {
            const res = await fetch('/api/downloads', { method: 'DELETE' });
            if (res.ok) {
                toast.success('Download history cleared');
            }
        } catch {
            toast.error('Failed to clear downloads');
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Data Management</CardTitle>
                </CardHeader>
                <CardBody className="space-y-6">
                    {/* Clear All */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                        <div>
                            <h3 className="font-medium text-white">Clear All Data</h3>
                            <p className="text-sm text-neutral-400 mt-1">
                                Delete all search stats, download history, and cached results
                            </p>
                        </div>
                        <Button
                            variant="danger"
                            onClick={handleClearAll}
                            disabled={clearing}
                            className="flex items-center gap-2"
                        >
                            <Trash2 size={16} />
                            {clearing ? 'Clearing...' : 'Clear All'}
                        </Button>
                    </div>

                    {/* Individual clear options */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">Or clear individually</h4>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-800/50">
                            <span className="text-sm text-neutral-300">Search Stats</span>
                            <Button variant="secondary" size="sm" onClick={handleClearStats}>
                                Clear
                            </Button>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-800/50">
                            <span className="text-sm text-neutral-300">Download History</span>
                            <Button variant="secondary" size="sm" onClick={handleClearDownloads}>
                                Clear
                            </Button>
                        </div>
                    </div>
                </CardBody>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock size={18} />
                        Cache Settings
                    </CardTitle>
                </CardHeader>
                <CardBody>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-white mb-1">
                                Search Cache TTL (minutes)
                            </label>
                            <p className="text-sm text-neutral-400 mb-3">
                                How long search results should be cached in the database. Set to 0 to disable caching entirely.
                            </p>
                            <div className="flex items-center gap-4">
                                <input
                                    type="number"
                                    min="0"
                                    value={cacheTtl}
                                    onChange={e => setCacheTtl(parseInt(e.target.value) || 0)}
                                    className="w-32 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent"
                                />
                                <Button
                                    variant="primary"
                                    onClick={handleSaveCacheTtl}
                                    disabled={savingTtl}
                                >
                                    {savingTtl ? 'Saving...' : 'Save Cache TTL'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardBody>
            </Card>
        </div>
    );
}
