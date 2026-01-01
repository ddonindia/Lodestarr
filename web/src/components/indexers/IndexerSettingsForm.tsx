
import { AlertCircle } from 'lucide-react';
import { type IndexerSetting } from '../../types/api';

interface IndexerSettingsFormProps {
    definitions: IndexerSetting[];
    settings: Record<string, string>;
    links?: string[];
    onSettingsChange: (settings: Record<string, string>) => void;
}

export default function IndexerSettingsForm({ definitions, settings, links, onSettingsChange }: IndexerSettingsFormProps) {
    const handleChange = (key: string, value: string) => {
        onSettingsChange({ ...settings, [key]: value });
    };

    return (
        <div className="space-y-4">
            {/* Mirror Selector - Show if indexer has multiple links */}
            {links && links.length > 1 && (
                <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1">
                        Mirror / Domain
                    </label>
                    <select
                        value={settings['_mirror'] || '0'}
                        onChange={(e) => handleChange('_mirror', e.target.value)}
                        className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white"
                    >
                        {links.map((url: string, idx: number) => (
                            <option key={idx} value={String(idx)}>
                                {(() => { try { return new URL(url).hostname; } catch { return url; } })()}
                                {idx === 0 ? ' (Default)' : ''}
                            </option>
                        ))}
                    </select>
                    <p className="text-xs text-neutral-500 mt-1">
                        Select an alternative domain if the default is blocked or slow.
                    </p>
                </div>
            )}

            {definitions.length === 0 && !(links && links.length > 1) && (
                <div className="p-4 bg-blue-500/10 text-blue-400 rounded-lg flex items-center gap-2">
                    <AlertCircle size={18} />
                    No configuration options available for this indexer.
                </div>
            )}

            {definitions.map((def) => (
                <div key={def.name}>
                    <label className="block text-sm font-medium text-neutral-300 mb-1">
                        {def.label || def.name}
                    </label>
                    {def.type === 'password' || def.name.includes('password') || def.name.includes('key') ? (
                        <input
                            type="password"
                            value={settings[def.name] || ''}
                            onChange={(e) => handleChange(def.name, e.target.value)}
                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white"
                        />
                    ) : def.type === 'select' && def.options ? (
                        <select
                            value={settings[def.name] || ''}
                            onChange={(e) => handleChange(def.name, e.target.value)}
                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white"
                        >
                            {def.options.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.name}</option>
                            ))}
                        </select>
                    ) : (
                        <input
                            type="text"
                            value={settings[def.name] || ''}
                            onChange={(e) => handleChange(def.name, e.target.value)}
                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white"
                        />
                    )}
                </div>
            ))}

            {/* Advanced Settings Section */}
            <div className="pt-4 border-t border-neutral-800">
                <h3 className="text-sm font-semibold text-white mb-4">Advanced Settings</h3>

                <div className="grid grid-cols-2 gap-4">
                    {/* Priority */}
                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-1">
                            Priority
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="100"
                            value={settings['_priority'] || '50'}
                            onChange={(e) => handleChange('_priority', e.target.value)}
                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white"
                        />
                        <p className="text-xs text-neutral-500 mt-1">Lower = searched first</p>
                    </div>

                    {/* Timeout */}
                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-1">
                            Timeout (seconds)
                        </label>
                        <input
                            type="number"
                            min="5"
                            max="120"
                            value={settings['_timeout'] || '30'}
                            onChange={(e) => handleChange('_timeout', e.target.value)}
                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white"
                        />
                        <p className="text-xs text-neutral-500 mt-1">Connection timeout</p>
                    </div>

                    {/* Result Limit */}
                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-1">
                            Result Limit
                        </label>
                        <input
                            type="number"
                            min="10"
                            max="500"
                            value={settings['_resultLimit'] || '100'}
                            onChange={(e) => handleChange('_resultLimit', e.target.value)}
                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white"
                        />
                        <p className="text-xs text-neutral-500 mt-1">Max results per search</p>
                    </div>
                </div>

                {/* Enable Toggle */}
                <div className="mt-4 flex items-center justify-between p-3 bg-neutral-900 rounded-lg">
                    <div>
                        <span className="text-sm font-medium text-neutral-300">Enabled</span>
                        <p className="text-xs text-neutral-500">Include in searches</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => handleChange('_enabled', settings['_enabled'] === 'false' ? 'true' : 'false')}
                        className={`relative w-12 h-6 rounded-full transition-colors ${settings['_enabled'] !== 'false' ? 'bg-emerald-500' : 'bg-neutral-700'
                            }`}
                    >
                        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${settings['_enabled'] !== 'false' ? 'left-7' : 'left-1'
                            }`} />
                    </button>
                </div>

                {/* Cookie/User-Agent (for private trackers) */}
                <div className="mt-4 pt-4 border-t border-neutral-800">
                    <h4 className="text-xs font-semibold text-neutral-400 mb-3 uppercase tracking-wider">Authentication</h4>

                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-neutral-300 mb-1">
                                Cookie Header
                            </label>
                            <input
                                type="password"
                                data-testid="cookie-input"
                                placeholder="PHPSESSID=abc123; cf_clearance=xyz..."
                                value={settings['_cookie'] || ''}
                                onChange={(e) => handleChange('_cookie', e.target.value)}
                                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white font-mono text-sm"
                            />
                            <p className="text-xs text-neutral-500 mt-1">
                                For private trackers. Copy from browser DevTools → Network → Request Headers.
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-neutral-300 mb-1">
                                User-Agent Override
                            </label>
                            <input
                                type="text"
                                data-testid="user-agent-input"
                                placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
                                value={settings['_userAgent'] || ''}
                                onChange={(e) => handleChange('_userAgent', e.target.value)}
                                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-white font-mono text-sm"
                            />
                            <p className="text-xs text-neutral-500 mt-1">
                                Optional. Use if site requires a specific browser signature.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
