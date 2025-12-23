import { useState } from 'react';
import { Trash2 } from 'lucide-react';

export default function CacheSettings() {
    const [clearing, setClearing] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const clearCache = async () => {
        setClearing(true);
        setError('');
        setSuccess('');

        try {
            const res = await fetch('/api/settings/cache/clear', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                setSuccess(`Cache cleared (${data.deleted} entries removed)`);
                setTimeout(() => setSuccess(''), 3000);
            } else {
                throw new Error('Failed to clear');
            }
        } catch (err) {
            setError('Failed to clear cache');
        } finally {
            setClearing(false);
        }
    };

    return (
        <section className="rounded-2xl shadow-xl overflow-hidden" style={{ backgroundColor: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}>
            <div className="p-6">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                        <Trash2 size={16} />
                    </span>
                    Cache Management
                </h2>
                <p className="text-sm text-neutral-400 mb-6">
                    Clear cached search results to force fresh queries from indexers.
                </p>

                {/* Local Feedback Area */}
                {(error || success) && (
                    <div className="mb-4">
                        {error && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 text-red-400 rounded-lg text-sm border border-red-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                {error}
                            </div>
                        )}
                        {success && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 text-emerald-400 rounded-lg text-sm border border-emerald-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                {success}
                            </div>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-neutral-700/50 pt-6 mt-2">
                    <div className="space-y-1">
                        <label className="block text-sm font-semibold text-white">Clear Cache</label>
                        <p className="text-sm text-neutral-400">
                            Force fresh queries from indexers.
                        </p>
                    </div>
                    <div className="md:col-span-2 flex justify-start items-center">
                        <button
                            onClick={clearCache}
                            disabled={clearing}
                            className="disabled:opacity-50 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-all active:scale-95 flex items-center gap-2"
                            style={{ backgroundColor: '#d97706' }}
                        >
                            <Trash2 size={16} />
                            {clearing ? 'Clearing...' : 'Clear Search Cache'}
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
