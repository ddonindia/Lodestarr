import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

interface DownloadClient {
    id: string;
    name: string;
}

interface UseDownloadClientsReturn {
    clients: DownloadClient[];
    handleSendToClient: (clientId: string, magnet: string, title: string) => Promise<void>;
    downloadConfigured: boolean;
    downloading: string | null;
    handleServerDownload: (link: string, title: string) => Promise<void>;
}

/**
 * Custom hook for managing download clients and download functionality.
 * Reduces code duplication between Search and RecentActivity components.
 */
export function useDownloadClients(): UseDownloadClientsReturn {
    const [clients, setClients] = useState<DownloadClient[]>([]);
    const [downloadConfigured, setDownloadConfigured] = useState(false);
    const [downloading, setDownloading] = useState<string | null>(null);

    // Fetch clients and download config on mount
    useEffect(() => {
        // Check if download path is configured
        fetch('/api/settings/download')
            .then(res => res.json())
            .then(data => setDownloadConfigured(!!data.path))
            .catch(() => { });

        // Load download clients
        fetch('/api/settings/clients')
            .then(res => res.json())
            .then(data => setClients(data))
            .catch(err => console.error('Failed to load clients', err));
    }, []);

    // Send torrent to a download client
    const handleSendToClient = useCallback(async (clientId: string, magnet: string, title: string) => {
        if (!magnet) return;
        const toastId = toast.loading(`Sending "${title}"...`);
        try {
            const res = await fetch(`/api/clients/${clientId}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ magnet })
            });

            if (res.ok) {
                toast.success('Sent to client', { id: toastId });
            } else {
                throw new Error('Failed to send');
            }
        } catch {
            toast.error('Failed to send torrent', { id: toastId });
        }
    }, []);

    // Download torrent to server
    const handleServerDownload = useCallback(async (link: string, title: string) => {
        if (!link) return;
        setDownloading(link);
        try {
            const res = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: link,
                    title: title
                })
            });

            if (!res.ok) {
                console.error('Download failed');
                toast.error('Download failed');
            } else {
                toast.success('Download started');
            }
        } catch (err) {
            console.error('Download error', err);
            toast.error('Download error');
        } finally {
            setDownloading(null);
        }
    }, []);

    return {
        clients,
        handleSendToClient,
        downloadConfigured,
        downloading,
        handleServerDownload
    };
}
