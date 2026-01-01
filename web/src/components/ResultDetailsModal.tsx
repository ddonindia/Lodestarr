
import { X, Info, Check, Copy, Magnet, Download, ExternalLink, Send, Server } from 'lucide-react';
import { Button } from './ui';
import type { TorrentResult, TorrentMetadata } from '../types';
import {
    getResultTitle,
    getResultSize,
    getResultSeeders,
    getResultPeers,
    getResultIndexer,
    getResultInfoHash,
    getResultMagnet,
    getResultLink,
    getResultDetails,
    getResultIndexerId
} from '../types';
import { formatSize } from '../utils/formatters';

interface ResultDetailsModalProps {
    result: TorrentResult | null;
    onClose: () => void;
    onCopyToClipboard: (text: string, field: string) => void;
    copiedField: string | null;

    // Optional props for Metadata fetching (Search only)
    onFetchMeta?: (url: string) => void;
    loadingMeta?: boolean;
    torrentMeta?: TorrentMetadata | null;

    // Optional props for Send to Client and Download to Server
    clients?: { id: string; name: string }[];
    onSendToClient?: (clientId: string, magnet: string, title: string) => void;
    downloadConfigured?: boolean;
    onDownload?: (link: string, title: string) => void;
    downloadingId?: string | null;
}

export default function ResultDetailsModal({
    result,
    onClose,
    onCopyToClipboard,
    copiedField,
    onFetchMeta,
    loadingMeta = false,
    torrentMeta,
    clients = [],
    onSendToClient,
    downloadConfigured = false,
    onDownload,
    downloadingId = null
}: ResultDetailsModalProps) {

    if (!result) return null;

    const title = getResultTitle(result);
    const size = getResultSize(result);
    const seeders = getResultSeeders(result);
    const leechers = getResultPeers(result);
    const indexer = getResultIndexer(result);
    const infoHash = getResultInfoHash(result);
    const magnet = getResultMagnet(result);
    const link = getResultLink(result);
    const details = getResultDetails(result);
    const indexerId = getResultIndexerId(result);

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
            <div className="bg-[#1e1e1e] rounded-lg max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-neutral-700">
                <div className="flex items-center justify-between p-4 border-b border-neutral-700 bg-[#262626]">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Info className="w-5 h-5 text-blue-400" />
                        Result Details
                    </h3>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onClose}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
                <div className="overflow-auto flex-1 p-4 space-y-4">
                    {/* Title */}
                    <div>
                        <label className="block text-xs text-neutral-400 mb-1">Title</label>
                        <div className="text-white font-medium">{title}</div>
                    </div>

                    {/* Basic Info */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs text-neutral-400 mb-1">Size</label>
                            <div className="text-white">{formatSize(size)}</div>
                        </div>
                        <div>
                            <label className="block text-xs text-neutral-400 mb-1">Seeders</label>
                            <div className="text-green-500">{seeders}</div>
                        </div>
                        <div>
                            <label className="block text-xs text-neutral-400 mb-1">Leechers</label>
                            <div className="text-red-500">{leechers}</div>
                        </div>
                        <div>
                            <label className="block text-xs text-neutral-400 mb-1">Indexer</label>
                            <div className="text-white">{indexer || '-'}</div>
                        </div>
                    </div>

                    {/* Info Hash */}
                    {infoHash && (
                        <div>
                            <label className="block text-xs text-neutral-400 mb-1">Info Hash</label>
                            <div className="flex items-center gap-2">
                                <code className="text-xs bg-neutral-800 px-2 py-1 rounded text-amber-400 flex-1 truncate font-mono">
                                    {infoHash}
                                </code>
                                <button
                                    onClick={() => onCopyToClipboard(infoHash, 'hash')}
                                    className="p-1 hover:bg-neutral-700 rounded"
                                >
                                    {copiedField === 'hash' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-neutral-400" />}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Magnet Link */}
                    {magnet && (
                        <div>
                            <label className="block text-xs text-neutral-400 mb-1">Magnet Link</label>
                            <div className="flex items-center gap-2">
                                <code className="text-xs bg-neutral-800 px-2 py-1 rounded text-purple-400 flex-1 truncate">
                                    {magnet}
                                </code>
                                <button
                                    onClick={() => onCopyToClipboard(magnet, 'magnet')}
                                    className="p-1 hover:bg-neutral-700 rounded"
                                >
                                    {copiedField === 'magnet' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-neutral-400" />}
                                </button>
                                <a
                                    href={magnet}
                                    className="p-1 hover:bg-purple-600 bg-purple-700 rounded"
                                >
                                    <Magnet className="w-4 h-4" />
                                </a>
                            </div>
                        </div>
                    )}

                    {/* Download Link */}
                    {link && !link.startsWith('magnet:') && (
                        <div>
                            <label className="block text-xs text-neutral-400 mb-1">Download URL (Proxy)</label>
                            <div className="flex items-center gap-2">
                                <code className="text-xs bg-neutral-800 px-2 py-1 rounded text-blue-400 flex-1 truncate">
                                    {link}
                                </code>
                                <button
                                    onClick={() => onCopyToClipboard(link, 'link')}
                                    className="p-1 hover:bg-neutral-700 rounded"
                                >
                                    {copiedField === 'link' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-neutral-400" />}
                                </button>
                                <a
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 hover:bg-blue-600 bg-blue-700 rounded"
                                >
                                    <Download className="w-4 h-4" />
                                </a>
                            </div>
                        </div>
                    )}

                    {/* Fetch Torrent Metadata Button */}
                    {link && !link.startsWith('magnet:') && onFetchMeta && (
                        <div className="pt-2">
                            <button
                                onClick={() => onFetchMeta(`/api/v2.0/indexers/${encodeURIComponent(indexerId || indexer || '')}/dl?link=${encodeURIComponent(link)}`)}
                                disabled={loadingMeta}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                {loadingMeta ? (
                                    <>
                                        <div className="animate-spin w-4 h-4 border-2 border-white/20 border-t-white rounded-full"></div>
                                        Fetching...
                                    </>
                                ) : (
                                    <>
                                        <Info className="w-4 h-4" />
                                        Fetch Torrent Metadata
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Torrent Metadata (if fetched) */}
                    {torrentMeta && (
                        <div className="space-y-3 p-3 bg-emerald-900/30 rounded-lg border border-emerald-700/50">
                            <div className="text-xs text-emerald-400 font-semibold uppercase tracking-wide">Torrent File Metadata</div>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Name</label>
                                    <div className="text-white">{torrentMeta.name}</div>
                                </div>
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Total Size</label>
                                    <div className="text-white">{formatSize(torrentMeta.total_size)}</div>
                                </div>
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Piece Size</label>
                                    <div className="text-white">{formatSize(torrentMeta.piece_length)}</div>
                                </div>
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Info Hash</label>
                                    <code className="text-xs text-amber-400 font-mono">{torrentMeta.info_hash}</code>
                                </div>
                            </div>

                            {torrentMeta.files && torrentMeta.files.length > 0 && (
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Files ({torrentMeta.files.length})</label>
                                    <div className="max-h-32 overflow-auto text-xs space-y-1 bg-neutral-800/50 p-2 rounded">
                                        {torrentMeta.files.map((file, i) => (
                                            <div key={i} className="flex justify-between gap-4">
                                                <span className="text-white truncate">{file.path}</span>
                                                <span className="text-neutral-400 whitespace-nowrap">{formatSize(file.size)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {torrentMeta.trackers && torrentMeta.trackers.length > 0 && (
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Trackers ({torrentMeta.trackers.length})</label>
                                    <div className="max-h-20 overflow-auto text-xs space-y-1">
                                        {torrentMeta.trackers.map((tr, i) => (
                                            <div key={i} className="text-cyan-400 font-mono truncate">{tr}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Details URL */}
                    {details && (
                        <div>
                            <label className="block text-xs text-neutral-400 mb-1">Details Page</label>
                            <div className="flex items-center gap-2">
                                <code className="text-xs bg-neutral-800 px-2 py-1 rounded text-cyan-400 flex-1 truncate">
                                    {details}
                                </code>
                                <button
                                    onClick={() => onCopyToClipboard(details, 'details')}
                                    className="p-1 hover:bg-neutral-700 rounded"
                                >
                                    {copiedField === 'details' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-neutral-400" />}
                                </button>
                                <a
                                    href={details}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 hover:bg-cyan-600 bg-cyan-700 rounded"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    {(link || magnet) && (clients.length > 0 || downloadConfigured) && (
                        <div className="pt-4 border-t border-neutral-700">
                            <label className="block text-xs text-neutral-400 mb-2">Quick Actions</label>
                            <div className="flex flex-wrap gap-2">
                                {/* Download to Server */}
                                {downloadConfigured && link && onDownload && (
                                    <button
                                        onClick={() => onDownload(link, title)}
                                        disabled={downloadingId === link}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        {downloadingId === link ? (
                                            <>
                                                <div className="animate-spin w-4 h-4 border-2 border-white/20 border-t-white rounded-full"></div>
                                                Downloading...
                                            </>
                                        ) : (
                                            <>
                                                <Server className="w-4 h-4" />
                                                Download to Server
                                            </>
                                        )}
                                    </button>
                                )}

                                {/* Send to Client - Single client */}
                                {clients.length === 1 && onSendToClient && (magnet || link) && (
                                    <button
                                        onClick={() => onSendToClient(clients[0].id, magnet || link || '', title)}
                                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        <Send className="w-4 h-4" />
                                        Send to {clients[0].name}
                                    </button>
                                )}

                                {/* Send to Client - Multiple clients dropdown */}
                                {clients.length > 1 && onSendToClient && (magnet || link) && (
                                    <div className="relative">
                                        <select
                                            className="appearance-none flex items-center gap-2 px-4 py-2 pr-10 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors cursor-pointer text-white"
                                            style={{ backgroundColor: '#059669' }}
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    onSendToClient(e.target.value, magnet || link || '', title);
                                                    e.target.value = '';
                                                }
                                            }}
                                            defaultValue=""
                                        >
                                            <option value="" disabled className="bg-neutral-800 text-white">Send to Client...</option>
                                            {clients.map(c => (
                                                <option key={c.id} value={c.id} className="bg-neutral-800 text-white">{c.name}</option>
                                            ))}
                                        </select>
                                        <Send className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
