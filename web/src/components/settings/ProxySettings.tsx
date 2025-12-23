import { useState, useEffect } from 'react';
import { Globe, Save } from 'lucide-react';

export default function ProxySettings() {
    const [proxyUrl, setProxyUrl] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        fetchProxyConfig();
    }, []);

    const fetchProxyConfig = () => {
        fetch('/api/settings/proxy')
            .then(res => res.json())
            .then(data => setProxyUrl(data.proxy_url || ''))
            .catch(() => { });
    };

    const saveSettings = async () => {
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            const res = await fetch('/api/settings/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ proxy_url: proxyUrl })
            });

            if (res.ok) {
                setSuccess('Proxy settings saved');
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
        <section className="rounded-2xl shadow-xl overflow-hidden relative group" style={{ backgroundColor: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}>
            <div className="p-6">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <Globe size={16} />
                    </span>
                    HTTP Proxy Settings
                </h2>
                <p className="text-sm text-neutral-400 mb-6">
                    Configure a proxy server for all indexer connections (including Torznab and GitHub downloads).
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1">
                        <label className="block text-sm font-semibold text-white">Proxy URL</label>
                        <p className="text-sm text-neutral-400">
                            Supports HTTP, HTTPS, and SOCKS5. Leave empty to disable.
                        </p>
                    </div>
                    <div className="md:col-span-2 space-y-4">
                        <input
                            className="w-full rounded-lg px-4 py-2.5 text-sm transition-all outline-none font-mono focus:ring-2 focus:ring-emerald-500/50"
                            style={{ backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'inherit' }}
                            value={proxyUrl}
                            onChange={e => setProxyUrl(e.target.value)}
                            placeholder="http://user:pass@127.0.0.1:8080"
                        />
                        <div className="flex justify-end">
                            <button
                                onClick={saveSettings}
                                disabled={saving}
                                className="disabled:opacity-50 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-all active:scale-95 flex items-center gap-2"
                                style={{ backgroundColor: 'var(--theme-accent)' }}
                            >
                                <Save size={16} />
                                Save Proxy Settings
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
