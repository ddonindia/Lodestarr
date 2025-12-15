import { useEffect, useState } from 'react';
import { Search, Filter, Grid, List, CheckCircle, XCircle, AlertCircle, Film, Tv, Music, Book, HardDrive, ToggleLeft, ToggleRight } from 'lucide-react';
import { Card, CardBody, Button, Badge, Spinner } from './ui';
import toast from 'react-hot-toast';
import { type IndexerDefinition } from '../types';

// Category mapping based on Jackett conventions
function getCategoryFromIndexer(indexer: IndexerDefinition): string {
    const name = indexer.name.toLowerCase();
    const desc = (indexer.description || '').toLowerCase();

    if (name.includes('movie') || desc.includes('movie') || name.includes('film')) return 'Movies';
    if (name.includes('tv') || name.includes('series') || desc.includes('television')) return 'TV';
    if (name.includes('music') || name.includes('audio') || name.includes('mp3')) return 'Music';
    if (name.includes('book') || name.includes('ebook')) return 'Books';

    return 'Other';
}

export default function Indexers() {
    const [indexers, setIndexers] = useState<IndexerDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

    useEffect(() => {
        loadIndexers();
    }, []);

    const loadIndexers = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v2.0/indexers');

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json();
            const indexerList = data.indexers || [];

            // Load enabled state from localStorage
            const savedState = localStorage.getItem('indexer-enabled-state');
            const enabledState: Record<string, boolean> = savedState ? JSON.parse(savedState) : {};

            // Add enabled flag from localStorage or default to false
            const indexersWithStatus = indexerList.map((idx: IndexerDefinition) => ({
                ...idx,
                enabled: (enabledState[idx.id] ?? false) as boolean, // Default to disabled
            }));

            setIndexers(indexersWithStatus);
        } catch (err) {
            console.error('Failed to load indexers:', err);
            toast.error('Failed to load indexers');
        } finally {
            setLoading(false);
        }
    };

    const toggleIndexer = (id: string) => {
        setIndexers(prev => {
            const updated = prev.map(idx =>
                idx.id === id ? { ...idx, enabled: !idx.enabled } : idx
            );

            // Save to localStorage
            const enabledState: Record<string, boolean> = {};
            updated.forEach(idx => {
                enabledState[idx.id] = idx.enabled ?? false;
            });
            localStorage.setItem('indexer-enabled-state', JSON.stringify(enabledState));

            const indexer = updated.find(i => i.id === id);
            toast.success(`${indexer?.name} ${indexer?.enabled ? 'enabled' : 'disabled'}`);

            return updated;
        });
    };

    const filteredIndexers = indexers.filter(indexer => {
        const matchesSearch = indexer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            indexer.description?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesStatus =
            statusFilter === 'all' ||
            (statusFilter === 'enabled' && indexer.enabled) ||
            (statusFilter === 'disabled' && !indexer.enabled);

        const category = getCategoryFromIndexer(indexer);
        const matchesCategory = categoryFilter === 'all' || category === categoryFilter;

        return matchesSearch && matchesStatus && matchesCategory;
    });

    // Group by category
    const groupedIndexers: Record<string, IndexerDefinition[]> = {};
    filteredIndexers.forEach(indexer => {
        const category = getCategoryFromIndexer(indexer);
        if (!groupedIndexers[category]) {
            groupedIndexers[category] = [];
        }
        groupedIndexers[category].push(indexer);
    });

    const enabledCount = indexers.filter(i => i.enabled).length;

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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Indexers</h1>
                    <p className="text-neutral-600 dark:text-neutral-400 mt-1">
                        {enabledCount} enabled • {filteredIndexers.length} of {indexers.length} showing
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant={viewMode === 'grid' ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => setViewMode('grid')}
                    >
                        <Grid className="w-4 h-4" />
                    </Button>
                    <Button
                        variant={viewMode === 'list' ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => setViewMode('list')}
                    >
                        <List className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <Card>
                <CardBody>
                    <div className="space-y-4">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search indexers..."
                                className="w-full pl-10 pr-4 py-2 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-neutral-900 dark:text-white"
                            />
                        </div>

                        {/* Category Filters */}
                        <div className="flex gap-2 flex-wrap">
                            <Button
                                variant={categoryFilter === 'all' ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => setCategoryFilter('all')}
                            >
                                All Categories
                            </Button>
                            <Button
                                variant={categoryFilter === 'Movies' ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => setCategoryFilter('Movies')}
                            >
                                <Film className="w-4 h-4 mr-1" />
                                Movies
                            </Button>
                            <Button
                                variant={categoryFilter === 'TV' ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => setCategoryFilter('TV')}
                            >
                                <Tv className="w-4 h-4 mr-1" />
                                TV
                            </Button>
                            <Button
                                variant={categoryFilter === 'Music' ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => setCategoryFilter('Music')}
                            >
                                <Music className="w-4 h-4 mr-1" />
                                Music
                            </Button>
                            <Button
                                variant={categoryFilter === 'Books' ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => setCategoryFilter('Books')}
                            >
                                <Book className="w-4 h-4 mr-1" />
                                Books
                            </Button>
                            <Button
                                variant={categoryFilter === 'Other' ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => setCategoryFilter('Other')}
                            >
                                <HardDrive className="w-4 h-4 mr-1" />
                                Other
                            </Button>
                        </div>

                        {/* Status Filters */}
                        <div className="flex gap-2">
                            <Button
                                variant={statusFilter === 'all' ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => setStatusFilter('all')}
                            >
                                <Filter className="w-4 h-4 mr-1" />
                                All
                            </Button>
                            <Button
                                variant={statusFilter === 'enabled' ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => setStatusFilter('enabled')}
                            >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Enabled
                            </Button>
                            <Button
                                variant={statusFilter === 'disabled' ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => setStatusFilter('disabled')}
                            >
                                <XCircle className="w-4 h-4 mr-1" />
                                Disabled
                            </Button>
                        </div>
                    </div>
                </CardBody>
            </Card>

            {/* Grouped Indexers */}
            {
                Object.entries(groupedIndexers).map(([category, categoryIndexers]) => (
                    <div key={category} className="space-y-3">
                        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                            {category === 'Movies' && <Film className="w-5 h-5" />}
                            {category === 'TV' && <Tv className="w-5 h-5" />}
                            {category === 'Music' && <Music className="w-5 h-5" />}
                            {category === 'Books' && <Book className="w-5 h-5" />}
                            {category === 'Other' && <HardDrive className="w-5 h-5" />}
                            {category} ({categoryIndexers.length})
                        </h2>

                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {categoryIndexers.map((indexer) => (
                                    <IndexerCard
                                        key={indexer.id}
                                        indexer={indexer}
                                        onToggle={toggleIndexer}
                                    />
                                ))}
                            </div>
                        ) : (
                            <Card>
                                <CardBody className="p-0">
                                    <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
                                        {categoryIndexers.map((indexer) => (
                                            <IndexerListItem
                                                key={indexer.id}
                                                indexer={indexer}
                                                onToggle={toggleIndexer}
                                            />
                                        ))}
                                    </div>
                                </CardBody>
                            </Card>
                        )}
                    </div>
                ))
            }

            {
                filteredIndexers.length === 0 && (
                    <div className="text-center py-12">
                        <AlertCircle className="w-12 h-12 mx-auto text-neutral-400 mb-3" />
                        <p className="text-neutral-600 dark:text-neutral-400">No indexers found</p>
                    </div>
                )
            }
        </div >
    );
}

function IndexerCard({ indexer, onToggle }: { indexer: IndexerDefinition; onToggle: (id: string) => void }) {
    return (
        <Card hover className="h-full">
            <CardBody>
                <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                        <h3 className="font-semibold text-neutral-900 dark:text-white mb-1">
                            {indexer.name}
                        </h3>
                        {indexer.description && (
                            <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2">
                                {indexer.description}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={() => onToggle(indexer.id)}
                        className="flex-shrink-0 ml-2"
                        title={indexer.enabled ? 'Click to disable' : 'Click to enable'}
                    >
                        {indexer.enabled ? (
                            <ToggleRight className="w-8 h-8 text-primary-500" />
                        ) : (
                            <ToggleLeft className="w-8 h-8 text-neutral-400" />
                        )}
                    </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <Badge variant="info" size="sm">{indexer.language}</Badge>
                    {indexer.enabled && <Badge variant="success" size="sm">Enabled</Badge>}
                </div>
            </CardBody>
        </Card>
    );
}

function IndexerListItem({ indexer, onToggle }: { indexer: IndexerDefinition; onToggle: (id: string) => void }) {
    return (
        <div className="flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
            <div className="flex-1">
                <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-neutral-900 dark:text-white">
                        {indexer.name}
                    </h3>
                    <Badge variant="info" size="sm">{indexer.language}</Badge>
                    {indexer.enabled && <Badge variant="success" size="sm">Enabled</Badge>}
                </div>
                {indexer.description && (
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                        {indexer.description}
                    </p>
                )}
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 font-mono">
                    {indexer.id}
                </p>
            </div>
            <button
                onClick={() => onToggle(indexer.id)}
                className="flex-shrink-0 ml-4"
                title={indexer.enabled ? 'Click to disable' : 'Click to enable'}
            >
                {indexer.enabled ? (
                    <ToggleRight className="w-8 h-8 text-primary-500" />
                ) : (
                    <ToggleLeft className="w-8 h-8 text-neutral-400" />
                )}
            </button>
        </div>
    );
}
