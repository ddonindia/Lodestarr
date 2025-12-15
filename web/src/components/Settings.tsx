import { useState, useEffect } from 'react';
import { Trash2, Plus, Edit } from 'lucide-react';

interface Indexer {
    name: string;
    url: string;
}

export default function Settings() {
    const [indexers, setIndexers] = useState<Indexer[]>([]);
    const [indexerForm, setIndexerForm] = useState({ name: '', url: '', apikey: '' });
    const [editingOriginalName, setEditingOriginalName] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [testing, setTesting] = useState(false);
    const [downloadPath, setDownloadPath] = useState('');
    const [savingPath, setSavingPath] = useState(false);

    useEffect(() => {
        fetchIndexers();
        fetchDownloadConfig();
    }, []);

    const fetchDownloadConfig = () => {
        fetch('/api/settings/download')
            .then(res => res.json())
            .then(data => setDownloadPath(data.path || ''))
            .catch(() => { });
    };

    const saveDownloadPath = () => {
        setSavingPath(true);
        fetch('/api/settings/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: downloadPath })
        })
            .then(() => {
                setSuccess('Download path saved');
                setTimeout(() => setSuccess(''), 3000);
            })
            .catch(() => setError('Failed to save download path'))
            .finally(() => setSavingPath(false));
    };

    const fetchIndexers = () => {
        fetch('/api/v2.0/indexers')
            .then(res => res.json())
            .then(data => setIndexers(data.indexers))
            .catch(() => setError('Failed to fetch indexers'));
    };

    const resetForm = () => {
        setIndexerForm({ name: '', url: '', apikey: '' });
        setEditingOriginalName(null);
        setError('');
        setSuccess('');
    };

    const handleEdit = (idx: Indexer) => {
        // Find full indexer details if we had them, or just prepopulate
        // Since list only gives name/url, we might need a fetch or just use what we have
        setIndexerForm({ name: idx.name, url: idx.url, apikey: '' }); // API key not returned for security
        setEditingOriginalName(idx.name);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSave = () => {
        if (!indexerForm.name || !indexerForm.url) {
            setError('Name and URL are required');
            return;
        }

        const url = editingOriginalName
            ? `/api/settings/indexer/${editingOriginalName}`
            : '/api/settings/indexer';

        const method = editingOriginalName ? 'PUT' : 'POST';

        fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(indexerForm)
        })
            .then(async res => {
                if (!res.ok) {
                    const txt = await res.text();
                    throw new Error(txt || 'Failed');
                }
                resetForm();
                fetchIndexers();
                setSuccess(editingOriginalName ? 'Indexer updated' : 'Indexer added');
                setTimeout(() => setSuccess(''), 3000);
            })
            .catch(e => setError(e.message));
    };

    const handleTest = () => {
        if (!indexerForm.url) {
            setError('URL is required for testing');
            return;
        }
        setTesting(true);
        setError('');
        setSuccess('');

        fetch('/api/settings/indexer/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(indexerForm)
        })
            .then(async res => {
                if (!res.ok) {
                    const txt = await res.text();
                    throw new Error(txt || 'Test failed');
                }
                setSuccess('Connection successful! ✅');
            })
            .catch(e => setError(e.message))
            .finally(() => setTesting(false));
    };

    const handleRemove = (name: string) => {
        fetch(`/api/settings/indexer/${name}`, { method: 'DELETE' })
            .then(() => fetchIndexers())
            .catch(() => setError('Failed to remove indexer'));
    };

    return (
        <div className="w-full max-w-6xl mx-auto p-6 space-y-8">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
                    <p className="text-neutral-400 mt-1">Manage your indexers and download preferences</p>
                </div>

                {/* Global Status/Feedback Area - Fixed height to prevent layout shift */}
                <div className="h-10 flex items-center justify-end">
                    {error && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 rounded-full text-sm font-medium border border-red-500/20 animate-in fade-in slide-in-from-top-2">
                            <span className="w-2 h-2 rounded-full bg-red-400" />
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-full text-sm font-medium border border-emerald-500/20 animate-in fade-in slide-in-from-top-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            {success}
                        </div>
                    )}
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Forms */}
                <div className="lg:col-span-1 space-y-8">
                    {/* Add/Edit Indexer Card */}
                    <section className="bg-neutral-900 rounded-2xl border border-neutral-800 shadow-xl overflow-hidden relative group">
                        <div className="absolute inset-0 bg-gradient-to-b from-neutral-800/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                        <div className="p-6 relative">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <span className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                        {editingOriginalName ? <Edit size={16} /> : <Plus size={16} />}
                                    </span>
                                    {editingOriginalName ? 'Edit Indexer' : 'Add Indexer'}
                                </h2>
                                {editingOriginalName && (
                                    <button
                                        onClick={resetForm}
                                        className="text-xs text-neutral-400 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-neutral-800"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-neutral-400 mb-1.5 ml-1">Indexer Name</label>
                                    <input
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all outline-none placeholder-neutral-600 text-white"
                                        value={indexerForm.name}
                                        onChange={e => setIndexerForm({ ...indexerForm, name: e.target.value })}
                                        placeholder="e.g. YTS"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-neutral-400 mb-1.5 ml-1">Torznab URL</label>
                                    <input
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all outline-none placeholder-neutral-600 text-white font-mono"
                                        value={indexerForm.url}
                                        onChange={e => setIndexerForm({ ...indexerForm, url: e.target.value })}
                                        placeholder="http://..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-neutral-400 mb-1.5 ml-1">API Key <span className="opacity-50">(Optional)</span></label>
                                    <input
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all outline-none placeholder-neutral-600 text-white font-mono"
                                        value={indexerForm.apikey}
                                        onChange={e => setIndexerForm({ ...indexerForm, apikey: e.target.value })}
                                        type="password"
                                        placeholder="••••••••••••"
                                    />
                                </div>

                                <div className="pt-2 flex gap-3">
                                    <button
                                        onClick={handleTest}
                                        disabled={testing || !indexerForm.url}
                                        className="flex-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-200 text-sm font-medium py-2.5 rounded-xl transition-all border border-neutral-700"
                                    >
                                        {testing ? 'Testing...' : 'Test'}
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        className="flex-[2] bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-900/20 active:scale-95"
                                    >
                                        {editingOriginalName ? 'Save Changes' : 'Add Indexer'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Download Settings Card */}
                    <section className="bg-neutral-900 rounded-2xl border border-neutral-800 shadow-xl overflow-hidden">
                        <div className="p-6">
                            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                                <span className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                                </span>
                                Server Download
                            </h2>

                            <div>
                                <label className="block text-xs font-medium text-neutral-400 mb-1.5 ml-1">Download Path</label>
                                <div className="flex gap-2">
                                    <input
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all outline-none placeholder-neutral-600 text-white font-mono"
                                        value={downloadPath}
                                        onChange={e => setDownloadPath(e.target.value)}
                                        placeholder="/path/to/downloads"
                                    />
                                </div>
                                <p className="text-xs text-neutral-500 mt-2 ml-1">
                                    Enable "Download to Server" button in search results.
                                </p>
                                <button
                                    onClick={saveDownloadPath}
                                    disabled={savingPath}
                                    className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-900/20"
                                >
                                    {savingPath ? 'Saving...' : 'Save Configuration'}
                                </button>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Right Column: List */}
                <div className="lg:col-span-2">
                    <section className="bg-neutral-900 rounded-2xl border border-neutral-800 shadow-xl overflow-hidden h-full">
                        <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-white">Configured Indexers</h2>
                            <span className="bg-neutral-800 text-neutral-400 text-xs px-2 py-1 rounded-md border border-neutral-700">
                                {indexers.length} active
                            </span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-neutral-800/50 text-neutral-400 text-xs uppercase font-medium tracking-wider">
                                        <th className="p-4 border-b border-neutral-800 font-semibold">Name</th>
                                        <th className="p-4 border-b border-neutral-800 font-semibold">URL</th>
                                        <th className="p-4 border-b border-neutral-800 text-right font-semibold">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-800">
                                    {indexers.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="p-12 text-center text-neutral-500">
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-600">
                                                        <Plus size={24} />
                                                    </div>
                                                    <p>No indexers configured yet.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    {indexers.map(idx => (
                                        <tr key={idx.name} className="group hover:bg-neutral-800/50 transition-colors">
                                            <td className="p-4 font-medium text-white">{idx.name}</td>
                                            <td className="p-4">
                                                <code className="text-xs text-neutral-400 bg-neutral-950 px-2 py-1 rounded border border-neutral-800 max-w-[200px] block truncate">
                                                    {idx.url}
                                                </code>
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleEdit(idx)}
                                                        className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-lg transition-colors"
                                                        title="Edit"
                                                    >
                                                        <Edit size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleRemove(idx.name)}
                                                        className="p-2 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                        title="Remove"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
