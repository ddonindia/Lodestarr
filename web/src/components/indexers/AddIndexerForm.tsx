import { Plus, Save } from 'lucide-react';
import { Card, CardBody, Button, Spinner } from '../ui';
import toast from 'react-hot-toast';
import { useState } from 'react';

interface IndexerFormData {
    name: string;
    url: string;
    apikey: string;
}

interface AddIndexerFormProps {
    onSuccess: () => void;
}

export default function AddIndexerForm({ onSuccess }: AddIndexerFormProps) {
    const [form, setForm] = useState<IndexerFormData>({ name: '', url: '', apikey: '' });
    const [testing, setTesting] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleTest = async () => {
        if (!form.url) {
            toast.error('URL is required for testing');
            return;
        }
        setTesting(true);
        try {
            const res = await fetch('/api/settings/indexer/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || 'Test failed');
            }
            toast.success('Connection successful! ✅');
        } catch (e: any) {
            toast.error(e.message || 'Connection failed');
        } finally {
            setTesting(false);
        }
    };

    const handleAdd = async () => {
        if (!form.name || !form.url) {
            toast.error('Name and URL are required');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/settings/indexer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || 'Failed to add indexer');
            }
            toast.success('Indexer added successfully');
            setForm({ name: '', url: '', apikey: '' });
            onSuccess();
        } catch (e: any) {
            toast.error(e.message || 'Failed to add indexer');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <Card>
                <CardBody className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white flex items-center gap-2 mb-4">
                            <Plus className="w-5 h-5 text-primary-500" />
                            Add Custom Torznab Indexer
                        </h3>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
                            Add any Torznab-compatible indexer (e.g., Prowlarr, Jackett) manually.
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                    Indexer Name
                                </label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                                    placeholder="e.g. My Private Tracker"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                    Torznab URL
                                </label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none font-mono text-sm"
                                    placeholder="http://localhost:9696/prowlarr/1/api"
                                    value={form.url}
                                    onChange={e => setForm({ ...form, url: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                    API Key <span className="opacity-50 text-xs">(Optional)</span>
                                </label>
                                <input
                                    type="password"
                                    className="w-full px-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none font-mono text-sm"
                                    placeholder="••••••••••••"
                                    value={form.apikey}
                                    onChange={e => setForm({ ...form, apikey: e.target.value })}
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <Button
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={handleTest}
                                    disabled={testing || !form.url}
                                >
                                    {testing ? <Spinner size="sm" /> : 'Test Connection'}
                                </Button>
                                <Button
                                    variant="primary"
                                    className="flex-[2]"
                                    onClick={handleAdd}
                                    disabled={saving || !form.name || !form.url}
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    Save Indexer
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardBody>
            </Card>
        </div>
    );
}
