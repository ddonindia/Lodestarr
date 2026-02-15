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
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                // Fallback for non-secure contexts
                const textArea = document.createElement("textarea");
                textArea.value = text;
                textArea.style.position = "fixed";
                textArea.style.left = "-9999px";
                textArea.style.top = "0";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                if (!successful) throw new Error('Fallback copy failed');
            }
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 2000);
            toast.success('Copied to clipboard');
        } catch {
            toast.error('Failed to copy');
        }
    }, []);

    return { copiedField, copyToClipboard };
}
