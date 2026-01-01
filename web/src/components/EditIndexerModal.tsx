import { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import { Button, Spinner } from './ui';
import toast from 'react-hot-toast';
import { type IndexerSetting } from '../types/api';
import IndexerSettingsForm from './indexers/IndexerSettingsForm';
import ProxiedIndexerForm from './indexers/ProxiedIndexerForm';
import IndexerTestSection from './indexers/IndexerTestSection';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    indexer: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    onSave: () => void;
}

export default function EditIndexerModal({ isOpen, onClose, indexer, onSave }: Props) {
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [definitions, setDefinitions] = useState<IndexerSetting[]>([]);

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
                    setTestResults({
                        success: true,
                        count: 0,
                        time_ms: 0,
                        message: 'Connection successful'
                    });
                } else {
                    toast.error(data.message || 'Test failed');
                    setTestResults({
                        success: false,
                        count: 0,
                        time_ms: 0,
                        message: data.message || 'Test failed'
                    });
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Test failed';
            toast.error(message);
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
                                <IndexerSettingsForm
                                    definitions={definitions}
                                    settings={settings}
                                    links={indexer.links}
                                    onSettingsChange={setSettings}
                                />
                            ) : (
                                <ProxiedIndexerForm
                                    url={proxiedForm.url}
                                    apikey={proxiedForm.apikey}
                                    onChange={setProxiedForm}
                                />
                            )}

                            <IndexerTestSection
                                onTest={handleTest}
                                testing={testing}
                                results={testResults}
                            />
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
