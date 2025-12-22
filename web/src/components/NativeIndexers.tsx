import { useEffect, useState } from 'react';
import { Search, Download, Check, RefreshCw, Globe, ToggleLeft, ToggleRight, Copy, X, Plus, Save, Trash2, HardDrive, Settings2 } from 'lucide-react';
import { Card, CardBody, Button, Badge, Spinner } from './ui';
import EditIndexerModal from './EditIndexerModal';
import toast from 'react-hot-toast';

interface GithubIndexer {
    name: string;
    installed: boolean;
}

interface LocalIndexer {
    id: string;
    name: string;
    description: string;
    language: string;
    indexer_type: string;
    links: string[];
    legacylinks: string[];
    isNative: true;
    enabled: boolean;
}

interface ProxiedIndexer {
    id: string; // usually number as string
    name: string;
    description: string;
    language: string;
    isNative: false;
    enabled: boolean;
}

interface UnifiedIndexer {
    id: string;
    name: string;
    description: string;
    language: string;
    indexer_type?: string;
    isNative: boolean;
    links?: string[];
    legacylinks?: string[];
    url?: string;
    enabled: boolean;
}

// LocalStorage helpers removed since state is now server-side

export default function NativeIndexers() {
    const [githubIndexers, setGithubIndexers] = useState<GithubIndexer[]>([]);
    const [localIndexers, setLocalIndexers] = useState<LocalIndexer[]>([]);
    const [proxiedIndexers, setProxiedIndexers] = useState<ProxiedIndexer[]>([]);



    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [downloading, setDownloading] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'browse' | 'installed' | 'add'>('installed');

    // Add Indexer Form State
    const [indexerForm, setIndexerForm] = useState({ name: '', url: '', apikey: '' });
    const [testingIndexer, setTestingIndexer] = useState(false);
    const [editingIndexer, setEditingIndexer] = useState<UnifiedIndexer | null>(null);

    // Config State


    // Filters
    const [filterType, setFilterType] = useState<string>('all');
    const [filterLanguage, setFilterLanguage] = useState<string>('all');
    const [filterPrivacy, setFilterPrivacy] = useState<string>('all');

    // Derived lists
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
                // Map proxied indexers to Unified format
                const list = (data.indexers || []).map((i: any) => ({
                    id: String(i.id),
                    name: i.name,
                    description: i.description || 'Torznab Proxy',
                    language: 'en', // Default or fetch if available
                    isNative: false,
                    enabled: i.enabled,
                    url: i.url // Pass URL for editing
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

    useEffect(() => {
        loadData();

    }, []);

    // Refresh GitHub indexers list from GitHub (explicit user action)
    const refreshFromGithub = async () => {
        setRefreshing(true);
        try {
            const res = await fetch('/api/native/refresh', { method: 'POST' });
            if (res.ok) {
                toast.success('Refreshed indexers list from GitHub');
                // Now reload data to get updated list
                await loadData();
            } else {
                const text = await res.text();
                toast.error(text || 'Failed to refresh from GitHub');
            }
        } catch (err) {
            console.error('Failed to refresh from GitHub:', err);
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
                // Refresh list to update state
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
                    // Refresh data
                    await loadData();
                } else if (data.failed?.length > 0) {
                    toast.error(`Failed: ${data.failed[0][1]}`);
                }
            } else {
                toast.error('Download failed');
            }
        } catch (err) {
            console.error('Download error:', err);
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
                const successCount = data.success?.length || 0;
                const failedCount = data.failed?.length || 0;

                toast.dismiss(toastId);
                if (successCount > 0) {
                    toast.success(`Downloaded ${successCount} indexers`);
                }
                if (failedCount > 0) {
                    toast.error(`${failedCount} failed`);
                }
                await loadData();
            }
        } catch (err) {
            toast.dismiss(toastId);
            toast.error('Download failed');
        }
    };



    // Feature: Copy Torznab URL
    const copyTorznabUrl = async (indexerId: string) => {
        const baseUrl = window.location.origin;
        const torznabUrl = `${baseUrl}/api/v2.0/indexers/${indexerId}/results/torznab/api`;

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(torznabUrl);
                toast.success('Torznab URL copied to clipboard!');
            } else {
                // Fallback for non-secure contexts
                const textArea = document.createElement("textarea");
                textArea.value = torznabUrl;
                textArea.style.position = "fixed";
                textArea.style.left = "-9999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                    toast.success('Torznab URL copied to clipboard!');
                } catch (err) {
                    toast.error('Failed to copy URL manually. Please copy strictly: ' + torznabUrl);
                }
                document.body.removeChild(textArea);
            }
        } catch (err) {
            console.error('Clipboard error:', err);
            toast.error('Failed to copy URL');
        }
    };

    // Feature: Add Indexer Logic
    const handleTestIndexer = async () => {
        if (!indexerForm.url) {
            toast.error('URL is required for testing');
            return;
        }
        setTestingIndexer(true);
        try {
            const res = await fetch('/api/settings/indexer/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(indexerForm)
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || 'Test failed');
            }
            toast.success('Connection successful! ✅');
        } catch (e: any) {
            toast.error(e.message || 'Connection failed');
        } finally {
            setTestingIndexer(false);
        }
    };

    const handleAddIndexer = async () => {
        if (!indexerForm.name || !indexerForm.url) {
            toast.error('Name and URL are required');
            return;
        }

        try {
            const res = await fetch('/api/settings/indexer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(indexerForm)
            });

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || 'Failed to add indexer');
            }

            toast.success('Indexer added successfully');
            setIndexerForm({ name: '', url: '', apikey: '' });
            loadData(); // Refresh list
            setActiveTab('installed'); // Switch to installed to show it
        } catch (e: any) {
            toast.error(e.message || 'Failed to add indexer');
        }
    };



    const deleteIndexer = async (indexer: UnifiedIndexer) => {
        if (!confirm(`Are you sure you want to delete ${indexer.name}?`)) return;
        try {
            let res;
            if (indexer.isNative) {
                // Delete native indexer via /api/native/delete (expects Name/ID)
                res = await fetch('/api/native/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: indexer.id }),
                });
            } else {
                // Delete proxied indexer via settings API (expects ID)
                res = await fetch(`/api/settings/indexer/${indexer.id}`, { method: 'DELETE' });
            }

            if (res.ok) {
                toast.success(`Deleted ${indexer.isNative ? 'native' : 'proxied'} indexer: ${indexer.name}`);

                // Optimistic UI update
                if (indexer.isNative) {
                    setLocalIndexers(prev => prev.filter(i => i.name !== indexer.name));
                } else {
                    setProxiedIndexers(prev => prev.filter(i => i.id !== indexer.id));
                }

                // Then reload for consistency
                loadData();
            } else {
                const text = await res.text();
                throw new Error(text || 'Delete failed');
            }
        } catch (e) {
            toast.error(`Failed to delete indexer: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
    };

    const filteredGithubIndexers = githubIndexers.filter(idx =>
        idx.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Combine local and proxied for "Installed" tab sorting/filtering
    const allInstalled: UnifiedIndexer[] = [...localIndexers, ...proxiedIndexers];

    const filteredInstalledIndexers = allInstalled.filter(indexer => {
        const matchesSearch = indexer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            indexer.description.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesType = filterType === 'all' ||
            (filterType === 'tv' && indexer.description.toLowerCase().includes('tv')) ||
            (filterType === 'movie' && indexer.description.toLowerCase().includes('movie')) ||
            (filterType === 'anime' && (indexer.description.toLowerCase().includes('anime') || indexer.id.includes('nyaa')));

        const matchesPrivacy = filterPrivacy === 'all' || (indexer.isNative ? (indexer as LocalIndexer).indexer_type : 'public') === filterPrivacy;

        const matchesLanguage = filterLanguage === 'all' || indexer.language === filterLanguage;

        return matchesSearch && matchesType && matchesPrivacy && matchesLanguage;
    });


    const notInstalledIndexers = filteredGithubIndexers.filter(i => !i.installed);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Indexers</h1>
                    <p className="text-neutral-400 mt-1">Manage, browse, and configure your indexers</p>
                </div>

                <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800">
                    {/* Tabs */}
                    <button
                        onClick={() => setActiveTab('installed')}
                        className={`px-4 py-2 font-medium transition-colors ${activeTab === 'installed'
                            ? 'text-primary-600 border-b-2 border-primary-500'
                            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                            }`}
                    >
                        <HardDrive className="w-4 h-4 inline mr-2" />
                        Installed ({localIndexers.length + proxiedIndexers.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('add')}
                        className={`px-4 py-2 font-medium transition-colors ${activeTab === 'add'
                            ? 'text-primary-600 border-b-2 border-primary-500'
                            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                            }`}
                    >
                        <Plus className="w-4 h-4 inline mr-2" />
                        Add Indexer
                    </button>
                    <button
                        onClick={() => setActiveTab('browse')}
                        className={`px-4 py-2 font-medium transition-colors ${activeTab === 'browse'
                            ? 'text-primary-600 border-b-2 border-primary-500'
                            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                            }`}
                    >
                        <Globe className="w-4 h-4 inline mr-2" />
                        Browse Available ({githubIndexers.length})
                    </button>
                </div>
                <Button onClick={loadData} variant="secondary" size="sm">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </header>
            {/* Toolbar */}
            {activeTab !== 'add' && (
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                        <input
                            type="text"
                            placeholder={activeTab === 'browse' ? "Search 500+ available indexers..." : "Filter installed indexers..."}
                            className="w-full pl-10 pr-4 py-2 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-neutral-900 dark:text-white"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {activeTab === 'installed' && (
                        <div className="flex flex-wrap gap-2">
                            {/* Type Filter */}
                            <select
                                className="w-full sm:w-auto px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-neutral-900 dark:text-white"
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}
                            >
                                <option value="all">Any Type</option>
                                <option value="tv">TV</option>
                                <option value="movie">Movie</option>
                                <option value="anime">Anime</option>
                            </select>

                            {/* Privacy Filter */}
                            <select
                                className="w-full sm:w-auto px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-neutral-900 dark:text-white"
                                value={filterPrivacy}
                                onChange={(e) => setFilterPrivacy(e.target.value)}
                            >
                                <option value="all">Any Privacy</option>
                                <option value="public">Public</option>
                                <option value="private">Private</option>
                                <option value="semi-private">Semi-Private</option>
                            </select>

                            {/* Language Filter */}
                            <select
                                className="w-full sm:w-auto px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-neutral-900 dark:text-white"
                                value={filterLanguage}
                                onChange={(e) => setFilterLanguage(e.target.value)}
                            >
                                <option value="all">Any Language</option>
                                {uniqueLanguages.map(lang => (
                                    <option key={lang} value={lang}>{lang}</option>
                                ))}
                            </select>

                            {(filterPrivacy !== 'all' || filterLanguage !== 'all' || filterType !== 'all') && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setFilterType('all');
                                        setFilterPrivacy('all');
                                        setFilterLanguage('all');
                                        setSearchQuery('');
                                    }}
                                    title="Clear Filters"
                                >
                                    <X className="w-4 h-4 mr-1" />
                                    Clear
                                </Button>
                            )}
                        </div>
                    )}
                    {activeTab === 'browse' && (
                        <div className="flex gap-2">
                            <Button
                                variant="secondary"
                                onClick={refreshFromGithub}
                                disabled={refreshing}
                            >
                                {refreshing ? <Spinner size="sm" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                                Refresh from GitHub
                            </Button>
                            {notInstalledIndexers.length > 0 && (
                                <Button
                                    variant="primary"
                                    onClick={() => downloadMultiple(notInstalledIndexers.slice(0, 10).map(i => i.name))}
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    Download Top 10
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Content */}
            {activeTab === 'browse' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {filteredGithubIndexers.map((indexer) => (
                        <Card key={indexer.name} hover className="h-full">
                            <CardBody className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-medium text-neutral-900 dark:text-white truncate">
                                        {indexer.name}
                                    </h3>
                                </div>
                                <div className="flex-shrink-0 ml-2">
                                    {indexer.installed ? (
                                        <Badge variant="success" size="sm">
                                            <Check className="w-3 h-3 mr-1" />
                                            Installed
                                        </Badge>
                                    ) : (
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={() => downloadIndexer(indexer.name)}
                                            disabled={downloading.has(indexer.name)}
                                        >
                                            {downloading.has(indexer.name) ? (
                                                <Spinner size="sm" />
                                            ) : (
                                                <Download className="w-4 h-4" />
                                            )}
                                        </Button>
                                    )}
                                </div>
                            </CardBody>
                        </Card>
                    ))}
                </div>
            )}

            {activeTab === 'installed' && (
                <div className="rounded-md border border-neutral-800 overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-[#262626] text-neutral-400 font-medium border-b border-neutral-800">
                            <tr>
                                <th className="px-4 py-3">Name</th>
                                <th className="px-4 py-3 w-32">Config</th>
                                <th className="px-4 py-3 w-32">Priority</th>
                                <th className="px-4 py-3 w-48 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800 bg-[#1a1a1a]">
                            {filteredInstalledIndexers.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                                        No indexers found matching filters.
                                    </td>
                                </tr>
                            ) : (
                                filteredInstalledIndexers.map((indexer) => (
                                    <tr key={`${indexer.isNative ? 'n' : 'p'}:${indexer.id}`} className="hover:bg-white/5 transition-colors group">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-2 h-2 rounded-full ${indexer.enabled ? 'bg-green-500' : 'bg-red-500'}`} />
                                                <div>
                                                    <div className="font-medium text-white flex items-center gap-2">
                                                        {indexer.name}
                                                        {indexer.language === 'en-US' || indexer.language === 'en' ? (
                                                            <span title="English" className="opacity-50 text-xs">EN</span>
                                                        ) : (
                                                            <Badge variant="neutral" size="sm">{indexer.language}</Badge>
                                                        )}
                                                        {!indexer.isNative && (
                                                            <Badge variant="warning" size="sm">Proxy</Badge>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-neutral-500 line-clamp-1 max-w-md">
                                                        {indexer.description}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {indexer.isNative ? (
                                                <div className="flex items-center text-xs text-neutral-400">
                                                    <span className="capitalize">{indexer.indexer_type || 'public'}</span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-neutral-500">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-neutral-400 font-mono text-xs">
                                            25
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {indexer.isNative && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => copyTorznabUrl(indexer.id)}
                                                        title="Copy Torznab URL"
                                                        className="hover:bg-neutral-800 text-neutral-400 hover:text-white"
                                                    >
                                                        <Copy size={16} />
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => setEditingIndexer(indexer)}
                                                    title="Edit Settings"
                                                    className="bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                                                >
                                                    <Settings2 size={16} />
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => toggleIndexer(indexer)}
                                                    title={indexer.enabled ? "Disable Indexer" : "Enable Indexer"}
                                                    className={indexer.enabled ? "bg-green-500/10 text-green-500 hover:bg-green-500/20" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"}
                                                >
                                                    {indexer.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => deleteIndexer(indexer)}
                                                    className="hover:bg-red-500/10 text-neutral-500 hover:text-red-500"
                                                    title="Delete Indexer"
                                                >
                                                    <Trash2 size={16} />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )
            }

            {/* Empty state for search */}
            {
                ((activeTab === 'browse' && filteredGithubIndexers.length === 0) ||
                    (activeTab === 'installed' && filteredInstalledIndexers.length === 0 && searchQuery)) && (
                    <div className="text-center py-12">
                        <Search className="w-12 h-12 mx-auto text-neutral-400 mb-3" />
                        <p className="text-neutral-600 dark:text-neutral-400">
                            No indexers found matching "{searchQuery}"
                        </p>
                    </div>
                )
            }

            {/* Add Indexer Tab */}
            {
                activeTab === 'add' && (
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
                                                value={indexerForm.name}
                                                onChange={e => setIndexerForm({ ...indexerForm, name: e.target.value })}
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
                                                value={indexerForm.url}
                                                onChange={e => setIndexerForm({ ...indexerForm, url: e.target.value })}
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
                                                value={indexerForm.apikey}
                                                onChange={e => setIndexerForm({ ...indexerForm, apikey: e.target.value })}
                                            />
                                        </div>

                                        <div className="flex gap-3 pt-2">
                                            <Button
                                                variant="secondary"
                                                className="flex-1"
                                                onClick={handleTestIndexer}
                                                disabled={testingIndexer || !indexerForm.url}
                                            >
                                                {testingIndexer ? <Spinner size="sm" /> : 'Test Connection'}
                                            </Button>
                                            <Button
                                                variant="primary"
                                                className="flex-[2]"
                                                onClick={handleAddIndexer}
                                                disabled={!indexerForm.name || !indexerForm.url}
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
                )
            }
            {/* Modal */}
            <EditIndexerModal
                isOpen={!!editingIndexer}
                onClose={() => setEditingIndexer(null)}
                indexer={editingIndexer}
                onSave={loadData}
            />
        </div >
    );
}
