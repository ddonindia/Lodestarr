

interface ProxiedIndexerFormProps {
    url: string;
    apikey: string;
    tags: string;
    onChange: (form: { url: string; apikey: string; tags: string }) => void;
}

export default function ProxiedIndexerForm({ url, apikey, tags, onChange }: ProxiedIndexerFormProps) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">URL</label>
                <input
                    type="text"
                    value={url}
                    onChange={(e) => onChange({ url: e.target.value, apikey, tags })}
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white font-mono"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">
                    API Key <span className="opacity-50 font-normal">(Leave blank to keep unchanged)</span>
                </label>
                <input
                    type="password"
                    value={apikey}
                    onChange={(e) => onChange({ url, apikey: e.target.value, tags })}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white font-mono"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">
                    Tags <span className="opacity-50 font-normal">(Optional, comma-separated)</span>
                </label>
                <input
                    type="text"
                    value={tags}
                    onChange={(e) => onChange({ url, apikey, tags: e.target.value })}
                    placeholder="e.g. movies, 4k"
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white"
                />
            </div>
        </div>
    );
}
