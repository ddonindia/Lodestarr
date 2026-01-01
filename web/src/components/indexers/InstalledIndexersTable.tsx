import { Copy, Settings2, ToggleLeft, ToggleRight, Trash2, FlaskConical } from 'lucide-react';
import { Button, Badge, Spinner } from '../ui';
import type { UnifiedIndexer, LocalIndexer } from '../../types/indexer';
import toast from 'react-hot-toast';

interface InstalledIndexersTableProps {
    indexers: UnifiedIndexer[];
    testingId: string | null;
    onToggle: (indexer: UnifiedIndexer) => void;
    onEdit: (indexer: UnifiedIndexer) => void;
    onDelete: (indexer: UnifiedIndexer) => void;
    onQuickTest: (indexer: UnifiedIndexer) => void;
}

export default function InstalledIndexersTable({
    indexers,
    testingId,
    onToggle,
    onEdit,
    onDelete,
    onQuickTest
}: InstalledIndexersTableProps) {

    const copyTorznabUrl = async (indexerId: string) => {
        const baseUrl = window.location.origin;
        const torznabUrl = `${baseUrl}/api/v2.0/indexers/${indexerId}/results/torznab/api`;
        try {
            await navigator.clipboard.writeText(torznabUrl);
            toast.success('Torznab URL copied to clipboard!');
        } catch {
            toast.error('Failed to copy URL');
        }
    };

    if (indexers.length === 0) {
        return (
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
                    <tbody className="bg-[#1a1a1a]">
                        <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                                No indexers found matching filters.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    }

    return (
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
                    {indexers.map((indexer) => (
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
                                        <span className="capitalize">{(indexer as LocalIndexer).indexer_type || 'public'}</span>
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
                                            onClick={() => onQuickTest(indexer)}
                                            disabled={testingId === indexer.id}
                                            title="Test Indexer"
                                            className="hover:bg-blue-500/10 text-neutral-400 hover:text-blue-500"
                                        >
                                            {testingId === indexer.id ? <Spinner size="sm" /> : <FlaskConical size={16} />}
                                        </Button>
                                    )}
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
                                        onClick={() => onEdit(indexer)}
                                        title="Edit Settings"
                                        className="bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                                    >
                                        <Settings2 size={16} />
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => onToggle(indexer)}
                                        title={indexer.enabled ? "Disable Indexer" : "Enable Indexer"}
                                        className={indexer.enabled ? "bg-green-500/10 text-green-500 hover:bg-green-500/20" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"}
                                    >
                                        {indexer.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onDelete(indexer)}
                                        className="hover:bg-red-500/10 text-neutral-500 hover:text-red-500"
                                        title="Delete Indexer"
                                    >
                                        <Trash2 size={16} />
                                    </Button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
