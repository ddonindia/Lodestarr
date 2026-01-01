import { useEffect, useState } from 'react';
import { Search, Download, RefreshCw, Globe, X, Plus, HardDrive } from 'lucide-react';
import { Button, Spinner } from './ui';
import EditIndexerModal from './EditIndexerModal';
import toast from 'react-hot-toast';
import type { GithubIndexer, LocalIndexer, ProxiedIndexer, UnifiedIndexer } from '../types/indexer';
import { AddIndexerForm, BrowseIndexersGrid, InstalledIndexersTable } from './indexers';

export default function NativeIndexers() {
    const [githubIndexers, setGithubIndexers] = useState<GithubIndexer[]>([]);
    const [localIndexers, setLocalIndexers] = useState<LocalIndexer[]>([]);
    const [proxiedIndexers, setProxiedIndexers] = useState<ProxiedIndexer[]>([]);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [downloading, setDownloading] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'browse' | 'installed' | 'add'>('installed');

    const [editingIndexer, setEditingIndexer] = useState<UnifiedIndexer | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);

    // Filters
    const [filterType, setFilterType] = useState<string>('all');
    const [filterLanguage, setFilterLanguage] = useState<string>('all');
    const [filterPrivacy, setFilterPrivacy] = useState<string>('all');

    const uniqueLanguages = Array.from(new Set(localIndexers.map(i => i.language))).sort();

    const loadData = async () => {
        setLoading(true);
        try {
            const [githubRes, localRes, proxiedRes] = await Promise.all([
                fetch('/api/native/list'),
                fetch('/api/native/local'),
                fetch('/api/v2.0/indexers')
            ]);

            if (githubRes.ok) {
                const data = await githubRes.json();
                setGithubIndexers(data.indexers || []);
            }

            if (localRes.ok) {
                const data = await localRes.json();
                setLocalIndexers((data.indexers || []).map((i: any) => ({ ...i, isNative: true })));
            }

            if (proxiedRes.ok) {
                const data = await proxiedRes.json();
                const list = (data.indexers || []).map((i: any) => ({
                    id: String(i.id),
                    name: i.name,
                    description: i.description || 'Torznab Proxy',
                    language: 'en',
                    isNative: false,
                    enabled: i.enabled,
                    url: i.url
                }));
                setProxiedIndexers(list);
            }
        } catch (err) {
            console.error('Failed to load indexers:', err);
            toast.error('Failed to load indexers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const refreshFromGithub = async () => {
        setRefreshing(true);
        try {
            const res = await fetch('/api/native/refresh', { method: 'POST' });
            if (res.ok) {
                toast.success('Refreshed indexers list from GitHub');
                await loadData();
            } else {
                const text = await res.text();
                toast.error(text || 'Failed to refresh from GitHub');
            }
        } catch {
            toast.error('Failed to refresh from GitHub');
        } finally {
            setRefreshing(false);
        }
    };

    const toggleIndexer = async (idx: UnifiedIndexer) => {
        const newState = !idx.enabled;
        try {
            const res = await fetch(`/api/settings/indexer/${idx.id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: newState })
            });
            if (res.ok) {
                toast.success(`${idx.name} ${newState ? 'enabled' : 'disabled'}`);
                loadData();
            } else {
                throw new Error();
            }
        } catch {
            toast.error(`Failed to ${newState ? 'enable' : 'disable'} ${idx.name}`);
        }
    };

    const downloadIndexer = async (name: string) => {
        setDownloading(prev => new Set(prev).add(name));
        try {
            const res = await fetch('/api/native/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ names: [name] })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success?.includes(name)) {
                    toast.success(`Downloaded ${name}`);
                    await loadData();
                } else if (data.failed?.length > 0) {
                    toast.error(`Failed: ${data.failed[0][1]}`);
                }
            } else {
                toast.error('Download failed');
            }
        } catch {
            toast.error('Download failed');
        } finally {
            setDownloading(prev => {
                const next = new Set(prev);
                next.delete(name);
                return next;
            });
        }
    };

    const downloadMultiple = async (indexers: string[]) => {
        if (indexers.length === 0) return;
        const toastId = toast.loading(`Downloading ${indexers.length} indexers...`);
        try {
            const res = await fetch('/api/native/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ names: indexers })
            });
            if (res.ok) {
                const data = await res.json();
                toast.dismiss(toastId);
                if (data.success?.length > 0) toast.success(`Downloaded ${data.success.length} indexers`);
                if (data.failed?.length > 0) toast.error(`${data.failed.length} failed`);
                await loadData();
            }
        } catch {
            toast.dismiss(toastId);
            toast.error('Download failed');
        }
    };

    const deleteIndexer = async (indexer: UnifiedIndexer) => {
        if (!confirm(`Are you sure you want to delete ${indexer.name}?`)) return;
        try {
            const res = indexer.isNative
                ? await fetch('/api/native/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: indexer.id }) })
                : await fetch(`/api/settings/indexer/${indexer.id}`, { method: 'DELETE' });

            if (res.ok) {
                toast.success(`Deleted ${indexer.isNative ? 'native' : 'proxied'} indexer: ${indexer.name}`);
                loadData();
            } else {
                throw new Error(await res.text() || 'Delete failed');
            }
        } catch (e) {
            toast.error(`Failed to delete indexer: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
    };

    const quickTestIndexer = async (indexer: UnifiedIndexer) => {
        if (!indexer.isNative) return;
        setTestingId(indexer.id);
        try {
            const res = await fetch(`/api/native/${indexer.id}/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
            const data = await res.json();
            data.success ? toast.success(data.message) : toast.error(data.message);
        } catch (e: any) {
            toast.error(e.message || 'Test failed');
        } finally {
            setTestingId(null);
        }
    };

    // Filtering
    const filteredGithubIndexers = githubIndexers.filter(idx => idx.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const allInstalled: UnifiedIndexer[] = [...localIndexers, ...proxiedIndexers];
    const filteredInstalledIndexers = allInstalled.filter(indexer => {
        const matchesSearch = indexer.name.toLowerCase().includes(searchQuery.toLowerCase()) || indexer.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = filterType === 'all' || (filterType === 'tv' && indexer.description.toLowerCase().includes('tv')) || (filterType === 'movie' && indexer.description.toLowerCase().includes('movie')) || (filterType === 'anime' && (indexer.description.toLowerCase().includes('anime') || indexer.id.includes('nyaa')));
        const matchesPrivacy = filterPrivacy === 'all' || (indexer.isNative ? (indexer as LocalIndexer).indexer_type : 'public') === filterPrivacy;
        const matchesLanguage = filterLanguage === 'all' || indexer.language === filterLanguage;
        return matchesSearch && matchesType && matchesPrivacy && matchesLanguage;
    });
    const notInstalledIndexers = filteredGithubIndexers.filter(i => !i.installed);

    if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Spinner size="lg" /></div>;

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Indexers</h1>
                    <p className="text-neutral-400 mt-1">Manage, browse, and configure your indexers</p>
                </div>
                <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800">
                    <button onClick={() => setActiveTab('installed')} className={`px-4 py-2 font-medium transition-colors ${activeTab === 'installed' ? 'text-primary-600 border-b-2 border-primary-500' : 'text-neutral-400 hover:text-white'}`}>
                        <HardDrive className="w-4 h-4 inline mr-2" />Installed ({localIndexers.length + proxiedIndexers.length})
                    </button>
                    <button onClick={() => setActiveTab('add')} className={`px-4 py-2 font-medium transition-colors ${activeTab === 'add' ? 'text-primary-600 border-b-2 border-primary-500' : 'text-neutral-400 hover:text-white'}`}>
                        <Plus className="w-4 h-4 inline mr-2" />Add Indexer
                    </button>
                    <button onClick={() => setActiveTab('browse')} className={`px-4 py-2 font-medium transition-colors ${activeTab === 'browse' ? 'text-primary-600 border-b-2 border-primary-500' : 'text-neutral-400 hover:text-white'}`}>
                        <Globe className="w-4 h-4 inline mr-2" />Browse Available ({githubIndexers.length})
                    </button>
                </div>
                <Button onClick={loadData} variant="secondary" size="sm"><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
            </header>

            {/* Toolbar */}
            {activeTab !== 'add' && (
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                        <input type="text" placeholder={activeTab === 'browse' ? "Search 500+ available indexers..." : "Filter installed indexers..."} className="w-full pl-10 pr-4 py-2 bg-neutral-700 border border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    {activeTab === 'installed' && (
                        <div className="flex flex-wrap gap-2">
                            <select className="px-3 py-2 text-sm bg-neutral-700 border border-neutral-600 rounded-lg text-white" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                                <option value="all">Any Type</option><option value="tv">TV</option><option value="movie">Movie</option><option value="anime">Anime</option>
                            </select>
                            <select className="px-3 py-2 text-sm bg-neutral-700 border border-neutral-600 rounded-lg text-white" value={filterPrivacy} onChange={(e) => setFilterPrivacy(e.target.value)}>
                                <option value="all">Any Privacy</option><option value="public">Public</option><option value="private">Private</option><option value="semi-private">Semi-Private</option>
                            </select>
                            <select className="px-3 py-2 text-sm bg-neutral-700 border border-neutral-600 rounded-lg text-white" value={filterLanguage} onChange={(e) => setFilterLanguage(e.target.value)}>
                                <option value="all">Any Language</option>
                                {uniqueLanguages.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                            </select>
                            {(filterPrivacy !== 'all' || filterLanguage !== 'all' || filterType !== 'all') && (
                                <Button variant="ghost" size="sm" onClick={() => { setFilterType('all'); setFilterPrivacy('all'); setFilterLanguage('all'); setSearchQuery(''); }} title="Clear Filters"><X className="w-4 h-4 mr-1" />Clear</Button>
                            )}
                        </div>
                    )}
                    {activeTab === 'browse' && (
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={refreshFromGithub} disabled={refreshing}>{refreshing ? <Spinner size="sm" /> : <RefreshCw className="w-4 h-4 mr-2" />}Refresh from GitHub</Button>
                            {notInstalledIndexers.length > 0 && <Button variant="primary" onClick={() => downloadMultiple(notInstalledIndexers.slice(0, 10).map(i => i.name))}><Download className="w-4 h-4 mr-2" />Download Top 10</Button>}
                        </div>
                    )}
                </div>
            )}

            {/* Content */}
            {activeTab === 'browse' && <BrowseIndexersGrid indexers={filteredGithubIndexers} downloading={downloading} onDownload={downloadIndexer} />}
            {activeTab === 'installed' && <InstalledIndexersTable indexers={filteredInstalledIndexers} testingId={testingId} onToggle={toggleIndexer} onEdit={setEditingIndexer} onDelete={deleteIndexer} onQuickTest={quickTestIndexer} />}
            {activeTab === 'add' && <AddIndexerForm onSuccess={() => { loadData(); setActiveTab('installed'); }} />}

            {/* Empty state */}
            {((activeTab === 'browse' && filteredGithubIndexers.length === 0) || (activeTab === 'installed' && filteredInstalledIndexers.length === 0 && searchQuery)) && (
                <div className="text-center py-12"><Search className="w-12 h-12 mx-auto text-neutral-400 mb-3" /><p className="text-neutral-400">No indexers found matching "{searchQuery}"</p></div>
            )}

            {/* Edit Modal */}
            <EditIndexerModal isOpen={!!editingIndexer} indexer={editingIndexer} onClose={() => setEditingIndexer(null)} onSave={loadData} />
        </div>
    );
}
