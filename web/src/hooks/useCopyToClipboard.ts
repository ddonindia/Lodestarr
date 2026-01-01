import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';

interface UseCopyToClipboardReturn {
    copiedField: string | null;
    copyToClipboard: (text: string, field: string) => Promise<void>;
}

/**
 * Custom hook for clipboard functionality with visual feedback
 */
export function useCopyToClipboard(): UseCopyToClipboardReturn {
    const [copiedField, setCopiedField] = useState<string | null>(null);

    const copyToClipboard = useCallback(async (text: string, field: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 2000);
            toast.success('Copied to clipboard');
        } catch {
            toast.error('Failed to copy');
        }
    }, []);

    return { copiedField, copyToClipboard };
}
