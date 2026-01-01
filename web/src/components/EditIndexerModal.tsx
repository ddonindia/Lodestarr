import { useEffect, useState } from 'react';
import { Save, X, FlaskConical, AlertCircle } from 'lucide-react';
import { Button, Spinner } from './ui';
import toast from 'react-hot-toast';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    indexer: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    onSave: () => void;
}

interface SettingDef {
    name: string;
    type: string;
    label: string;
    default: any;
    options?: Record<string, string>;
}

export default function EditIndexerModal({ isOpen, onClose, indexer, onSave }: Props) {
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [definitions, setDefinitions] = useState<SettingDef[]>([]);

    // For Proxied Indexers
    const [proxiedForm, setProxiedForm] = useState({ url: '', apikey: '' });

    // Test state
    const [testing, setTesting] = useState(false);
    const [testResults, setTestResults] = useState<{ success: boolean; count: number; time_ms: number; message: string } | null>(null);


    useEffect(() => {
        if (isOpen && indexer) {
            if (indexer.isNative) {
                loadNativeSettings();
            } else {
                // Pre-fill for proxied
                setProxiedForm({
                    url: indexer.url || '', // Passed from parent if available
                    apikey: '' // Don't show API key for security
                });
            }
            setTestResults(null);
        }
    }, [isOpen, indexer]);

    const loadNativeSettings = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/native/${indexer.id}/settings`);
            if (res.ok) {
                const data = await res.json();
                setDefinitions(data.settings || []);
                // Merge saved values with defaults for advanced settings
                const savedValues = data.values || {};
                setSettings({
                    '_enabled': indexer.enabled !== false ? 'true' : 'false',
                    '_priority': '50',
                    '_timeout': '30',
                    '_resultLimit': '100',
                    '_mirror': '0',
                    ...savedValues
                });
            } else {
                toast.error('Failed to load settings');
            }
        } catch (e) {
            console.error(e);
            toast.error('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            let res;
            if (indexer.isNative) {
                // Save settings
                res = await fetch(`/api/native/${indexer.id}/settings`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ settings })
                });

                // Also update enabled status if changed
                const shouldBeEnabled = settings['_enabled'] !== 'false';
                if (shouldBeEnabled !== indexer.enabled) {
                    await fetch(`/api/settings/indexer/${indexer.id}/status`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ enabled: shouldBeEnabled })
                    });
                }
            } else {
                // Proxied update
                res = await fetch(`/api/settings/indexer/${indexer.name}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: indexer.name, // Name logic if we allow renaming? For now keep same
                        url: proxiedForm.url,
                        apikey: proxiedForm.apikey || undefined // Only send if changed
                    })
                });
            }

            if (res.ok) {
                toast.success('Settings saved');
                onSave();
                onClose();
            } else {
                const txt = await res.text();
                toast.error(txt || 'Failed to save');
            }
        } catch (e) {
            console.error(e);
            toast.error('Failed to save');
        } finally {
            setLoading(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResults(null);
        try {
            let res;
            if (indexer.isNative) {
                res = await fetch(`/api/native/${indexer.id}/test`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        settings: settings // Test with CURRENT form values
                    })
                });
            } else {
                // Proxied test
                res = await fetch('/api/settings/indexer/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: indexer.name,
                        url: proxiedForm.url,
                        apikey: proxiedForm.apikey
                    })
                });
            }

            const data = await res.json();

            if (indexer.isNative) {
                setTestResults(data);
                if (data.success) {
                    toast.success(data.message);
                } else {
                    toast.error(data.message);
                }
            } else {
                if (res.ok) {
                    toast.success('Connection successful');
                } else {
                    toast.error(data.message || 'Test failed');
                }
            }
        } catch (e: any) {
            toast.error(e.message || 'Test failed');
        } finally {
            setTesting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-[#1a1a1a] border border-neutral-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-neutral-800">
                    <div>
                        <h2 className="text-xl font-bold text-white">Edit {indexer?.name}</h2>
                        <p className="text-sm text-neutral-400">
                            {indexer?.isNative ? 'Configure native indexer settings' : 'Update connection details'}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {loading && !definitions.length && indexer.isNative ? (
                        <div className="flex justify-center py-8"><Spinner size="lg" /></div>
                    ) : (
                        <>
                            {indexer.isNative ? (
                                <div className="space-y-4">
                                    {/* Mirror Selector - Show if indexer has multiple links */}
                                    {indexer.links?.length > 1 && (
                                        <div>
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">
                                                Mirror / Domain
                                            </label>
                                            <select
                                                value={settings['_mirror'] || '0'}
                                                onChange={(e) => setSettings({ ...settings, '_mirror': e.target.value })}
                                                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white"
                                            >
                                                {indexer.links?.map((url: string, idx: number) => (
                                                    <option key={idx} value={String(idx)}>
                                                        {(() => { try { return new URL(url).hostname; } catch { return url; } })()}
                                                        {idx === 0 ? ' (Default)' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-neutral-500 mt-1">
                                                Select an alternative domain if the default is blocked or slow.
                                            </p>
                                        </div>
                                    )}

                                    {definitions.length === 0 && !(indexer.links?.length > 1 || indexer.legacylinks?.length > 0) && (
                                        <div className="p-4 bg-blue-500/10 text-blue-400 rounded-lg flex items-center gap-2">
                                            <AlertCircle size={18} />
                                            No configuration options available for this indexer.
                                        </div>
                                    )}
                                    {definitions.map((def) => (
                                        <div key={def.name}>
                                            <label className="block text-sm font-medium text-neutral-300 mb-1">
                                                {def.label || def.name}
                                            </label>
                                            {def.type === 'password' || def.name.includes('password') || def.name.includes('key') ? (
                                                <input
                                                    type="password"
                                                    value={settings[def.name] || ''}
                                                    onChange={(e) => setSettings({ ...settings, [def.name]: e.target.value })}
                                                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white"
                                                />
                                            ) : def.type === 'select' && def.options ? (
                                                <select
                                                    value={settings[def.name] || ''}
                                                    onChange={(e) => setSettings({ ...settings, [def.name]: e.target.value })}
                                                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white"
                                                >
                                                    {Object.entries(def.options).map(([val, label]) => (
                                                        <option key={val} value={val}>{label}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    type="text"
                                                    value={settings[def.name] || ''}
                                                    onChange={(e) => setSettings({ ...settings, [def.name]: e.target.value })}
                                                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white"
                                                />
                                            )}
                                        </div>
                                    ))}

                                    {/* Advanced Settings Section */}
                                    <div className="pt-4 border-t border-neutral-800">
                                        <h3 className="text-sm font-semibold text-white mb-4">Advanced Settings</h3>

                                        <div className="grid grid-cols-2 gap-4">
                                            {/* Priority */}
                                            <div>
                                                <label className="block text-sm font-medium text-neutral-300 mb-1">
                                                    Priority
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="100"
                                                    value={settings['_priority'] || '50'}
                                                    onChange={(e) => setSettings({ ...settings, '_priority': e.target.value })}
                                                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white"
                                                />
                                                <p className="text-xs text-neutral-500 mt-1">Lower = searched first</p>
                                            </div>

                                            {/* Timeout */}
                                            <div>
                                                <label className="block text-sm font-medium text-neutral-300 mb-1">
                                                    Timeout (seconds)
                                                </label>
                                                <input
                                                    type="number"
                                                    min="5"
                                                    max="120"
                                                    value={settings['_timeout'] || '30'}
                                                    onChange={(e) => setSettings({ ...settings, '_timeout': e.target.value })}
                                                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white"
                                                />
                                                <p className="text-xs text-neutral-500 mt-1">Connection timeout</p>
                                            </div>

                                            {/* Result Limit */}
                                            <div>
                                                <label className="block text-sm font-medium text-neutral-300 mb-1">
                                                    Result Limit
                                                </label>
                                                <input
                                                    type="number"
                                                    min="10"
                                                    max="500"
                                                    value={settings['_resultLimit'] || '100'}
                                                    onChange={(e) => setSettings({ ...settings, '_resultLimit': e.target.value })}
                                                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white"
                                                />
                                                <p className="text-xs text-neutral-500 mt-1">Max results per search</p>
                                            </div>
                                        </div>

                                        {/* Enable Toggle */}
                                        <div className="mt-4 flex items-center justify-between p-3 bg-neutral-900 rounded-lg">
                                            <div>
                                                <span className="text-sm font-medium text-neutral-300">Enabled</span>
                                                <p className="text-xs text-neutral-500">Include in searches</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setSettings({
                                                    ...settings,
                                                    '_enabled': settings['_enabled'] === 'false' ? 'true' : 'false'
                                                })}
                                                className={`relative w-12 h-6 rounded-full transition-colors ${settings['_enabled'] !== 'false' ? 'bg-emerald-500' : 'bg-neutral-700'
                                                    }`}
                                            >
                                                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${settings['_enabled'] !== 'false' ? 'left-7' : 'left-1'
                                                    }`} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-300 mb-1">URL</label>
                                        <input
                                            type="text"
                                            value={proxiedForm.url}
                                            onChange={(e) => setProxiedForm({ ...proxiedForm, url: e.target.value })}
                                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-300 mb-1">
                                            API Key <span className="opacity-50 font-normal">(Leave blank to keep unchanged)</span>
                                        </label>
                                        <input
                                            type="password"
                                            value={proxiedForm.apikey}
                                            onChange={(e) => setProxiedForm({ ...proxiedForm, apikey: e.target.value })}
                                            placeholder="••••••••••••"
                                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white font-mono"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Test Section */}
                            <div className="pt-6 border-t border-neutral-800">
                                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                                    <FlaskConical className="w-4 h-4 text-primary-500" />
                                    Test Connection
                                </h3>

                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleTest}
                                    disabled={testing}
                                    className="w-full"
                                >
                                    {testing ? <Spinner size="sm" /> : 'Run Test'}
                                </Button>

                                {testResults && (
                                    <div className={`mt-4 p-3 rounded-lg text-sm ${testResults.success
                                        ? 'bg-emerald-500/10 text-emerald-400'
                                        : 'bg-red-500/10 text-red-400'
                                        }`}>
                                        <div className="font-medium">{testResults.message}</div>
                                        {testResults.time_ms > 0 && (
                                            <div className="text-xs mt-1 opacity-75">
                                                Response time: {testResults.time_ms}ms
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="p-6 border-t border-neutral-800 bg-neutral-900/50 flex justify-end gap-3 rounded-b-xl">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" onClick={handleSave} disabled={loading || testing}>
                        {loading ? <Spinner size="sm" /> : <><Save size={16} className="mr-2" /> Save Changes</>}
                    </Button>
                </div>
            </div>
        </div>
    );
}
