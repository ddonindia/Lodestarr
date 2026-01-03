import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardBody } from '../ui';
import toast from 'react-hot-toast';

export default function DataSettings() {
    const [clearing, setClearing] = useState(false);

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
        </div>
    );
}
