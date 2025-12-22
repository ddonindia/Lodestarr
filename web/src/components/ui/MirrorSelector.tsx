import { type ChangeEvent } from 'react';
import { Link2 } from 'lucide-react';

interface MirrorSelectorProps {
    indexerId: string;
    links?: string[];
    legacylinks?: string[];
    selectedMirrorIndex: number;
    onMirrorChange: (indexerId: string, mirrorIndex: number) => void;
}

export function MirrorSelector({
    indexerId,
    links = [],
    legacylinks = [],
    selectedMirrorIndex,
    onMirrorChange,
}: MirrorSelectorProps) {
    // Combine all available mirrors
    const allMirrors = [
        ...links.map((url, idx) => ({ url, idx, isLegacy: false })),
        ...legacylinks.map((url, idx) => ({ url, idx: idx + links.length, isLegacy: true })),
    ];

    // Don't show selector if there's only one mirror or no mirrors
    if (allMirrors.length <= 1) {
        return null;
    }

    const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
        const newIndex = parseInt(e.target.value, 10);
        onMirrorChange(indexerId, newIndex);
    };

    const formatMirrorUrl = (url: string) => {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch {
            return url;
        }
    };

    return (
        <div className="flex items-center gap-2 mt-2">
            <Link2 className="w-4 h-4 text-neutral-500 dark:text-neutral-400 flex-shrink-0" />
            <select
                value={selectedMirrorIndex}
                onChange={handleChange}
                className="flex-1 text-xs px-2 py-1 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-neutral-900 dark:text-white"
                onClick={(e) => e.stopPropagation()} // Prevent card click when clicking select
            >
                {allMirrors.map((mirror) => (
                    <option key={mirror.idx} value={mirror.idx}>
                        {formatMirrorUrl(mirror.url)}
                        {mirror.isLegacy ? ' (Legacy)' : ''}
                        {mirror.idx === 0 ? ' (Default)' : ''}
                    </option>
                ))}
            </select>
        </div>
    );
}
