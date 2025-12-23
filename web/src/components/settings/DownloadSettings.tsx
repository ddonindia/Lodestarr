import { useState, useEffect } from 'react';
import { HardDrive, Save } from 'lucide-react';

export default function DownloadSettings() {
    const [downloadPath, setDownloadPath] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        fetchDownloadConfig();
    }, []);

    const fetchDownloadConfig = () => {
        fetch('/api/settings/download')
            .then(res => res.json())
            .then(data => setDownloadPath(data.path || ''))
            .catch(() => { });
    };

    const saveSettings = async () => {
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            const res = await fetch('/api/settings/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: downloadPath })
            });

            if (res.ok) {
                setSuccess('Download settings saved');
                setTimeout(() => setSuccess(''), 3000);
            } else {
                throw new Error('Failed to save');
            }
        } catch (err) {
            setError('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="rounded-2xl shadow-xl overflow-hidden" style={{ backgroundColor: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}>
            <div className="p-6">
                <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                        <HardDrive size={16} />
                    </span>
                    Server Download
                </h2>

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

                <div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-1">
                            <label className="block text-sm font-semibold text-white">Download Path</label>
                            <p className="text-sm text-neutral-400">
                                Enable "Download to Server" button in search results.
                            </p>
                        </div>
                        <div className="md:col-span-2 space-y-4">
                            <input
                                className="w-full rounded-lg px-4 py-2.5 text-sm transition-all outline-none font-mono focus:ring-2 focus:ring-indigo-500/50"
                                style={{ backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'inherit' }}
                                value={downloadPath}
                                onChange={e => setDownloadPath(e.target.value)}
                                placeholder="/path/to/downloads"
                            />
                            <div className="flex justify-end">
                                <button
                                    onClick={saveSettings}
                                    disabled={saving}
                                    className="disabled:opacity-50 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-all active:scale-95 flex items-center gap-2"
                                    style={{ backgroundColor: 'var(--theme-accent)' }}
                                >
                                    <Save size={16} />
                                    Save Path
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
