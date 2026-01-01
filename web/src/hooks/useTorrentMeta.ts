import { useState, useCallback } from 'react';
import type { TorrentMetadata } from '../types';

interface UseTorrentMetaReturn {
    torrentMeta: TorrentMetadata | null;
    loadingMeta: boolean;
    fetchTorrentMeta: (url: string) => Promise<void>;
    clearMeta: () => void;
}

/**
 * Custom hook for fetching torrent metadata
 */
export function useTorrentMeta(): UseTorrentMetaReturn {
    const [torrentMeta, setTorrentMeta] = useState<TorrentMetadata | null>(null);
    const [loadingMeta, setLoadingMeta] = useState(false);

    const fetchTorrentMeta = useCallback(async (url: string) => {
        setLoadingMeta(true);
        setTorrentMeta(null);
        try {
            const res = await fetch('/api/torrent/meta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            if (res.ok) {
                const data = await res.json();
                setTorrentMeta(data);
            }
        } catch (err) {
            console.error('Failed to fetch torrent metadata', err);
        } finally {
            setLoadingMeta(false);
        }
    }, []);

    const clearMeta = useCallback(() => {
        setTorrentMeta(null);
    }, []);

    return { torrentMeta, loadingMeta, fetchTorrentMeta, clearMeta };
}
