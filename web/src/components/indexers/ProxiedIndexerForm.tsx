

interface ProxiedIndexerFormProps {
    url: string;
    apikey: string;
    onChange: (form: { url: string; apikey: string }) => void;
}

export default function ProxiedIndexerForm({ url, apikey, onChange }: ProxiedIndexerFormProps) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">URL</label>
                <input
                    type="text"
                    value={url}
                    onChange={(e) => onChange({ url: e.target.value, apikey })}
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
                    onChange={(e) => onChange({ url, apikey: e.target.value })}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white font-mono"
                />
            </div>
        </div>
    );
}
