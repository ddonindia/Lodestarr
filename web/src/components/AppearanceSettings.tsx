import { Palette, Sun, Moon, Monitor, Check } from 'lucide-react';
import {
    useTheme,
    THEME_PRESETS,
    ACCENT_COLORS,
    FONT_FAMILIES,
    type ThemePreset,
    type AccentColor,
    type FontFamily,
    type ColorMode,
} from '../contexts/ThemeContext';

export default function AppearanceSettings() {
    const {
        settings,
        resolvedMode,
        setColorMode,
        setPreset,
        setAccentColor,
        setFontFamily,
    } = useTheme();

    const colorModes: { id: ColorMode; label: string; icon: React.ReactNode }[] = [
        { id: 'light', label: 'Light', icon: <Sun size={18} /> },
        { id: 'dark', label: 'Dark', icon: <Moon size={18} /> },
        { id: 'auto', label: 'Auto', icon: <Monitor size={18} /> },
    ];

    return (
        <section className="bg-theme-card rounded-2xl border border-theme shadow-xl overflow-hidden">
            <div className="p-6 space-y-8">
                <div>
                    <h2 className="text-lg font-semibold text-white dark:text-white light:text-neutral-900 mb-2 flex items-center gap-2">
                        <span className="w-8 h-8 rounded-lg bg-accent-muted flex items-center justify-center text-accent">
                            <Palette size={16} />
                        </span>
                        Appearance
                    </h2>
                    <p className="text-sm text-neutral-400 dark:text-neutral-400 light:text-neutral-600">
                        Customize how Lodestarr looks and feels
                    </p>
                </div>

                <div className="space-y-8 divide-y divide-neutral-800">
                    {/* Color Mode */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 first:pt-0 first:border-0 border-t border-neutral-800">
                        <div className="space-y-1">
                            <label className="block text-sm font-semibold text-white dark:text-white light:text-neutral-900">Color Mode</label>
                            <p className="text-sm text-neutral-400 dark:text-neutral-400 light:text-neutral-500">
                                Switch between light and dark themes.
                            </p>
                        </div>
                        <div className="md:col-span-2">
                            <div className="flex gap-2 max-w-md">
                                {colorModes.map(mode => (
                                    <button
                                        key={mode.id}
                                        onClick={() => setColorMode(mode.id)}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${settings.colorMode === mode.id
                                            ? 'bg-accent text-white shadow-lg'
                                            : 'bg-neutral-800 dark:bg-neutral-800 light:bg-neutral-200 text-neutral-400 dark:text-neutral-400 light:text-neutral-600 hover:bg-neutral-700 dark:hover:bg-neutral-700 light:hover:bg-neutral-300'
                                            }`}
                                    >
                                        {mode.icon}
                                        {mode.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Theme Preset */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-neutral-800">
                        <div className="space-y-1">
                            <label className="block text-sm font-semibold text-white dark:text-white light:text-neutral-900">Theme Preset</label>
                            <p className="text-sm text-neutral-400 dark:text-neutral-400 light:text-neutral-500">
                                Select a pre-defined color scheme.
                            </p>
                        </div>
                        <div className="md:col-span-2">
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                {(Object.entries(THEME_PRESETS) as [ThemePreset, typeof THEME_PRESETS[ThemePreset]][]).map(
                                    ([id, preset]) => {
                                        const isSelected = settings.preset === id;
                                        const colors = preset[resolvedMode];
                                        return (
                                            <button
                                                key={id}
                                                onClick={() => setPreset(id)}
                                                className={`relative p-3 rounded-lg border-2 transition-all text-left ${isSelected
                                                    ? 'border-accent shadow-lg shadow-accent/20'
                                                    : 'border-neutral-700 dark:border-neutral-700 light:border-neutral-300 hover:border-neutral-600 dark:hover:border-neutral-600 light:hover:border-neutral-400'
                                                    }`}
                                                style={{ backgroundColor: colors.card }}
                                            >
                                                {isSelected && (
                                                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                                                        <Check size={10} className="text-white" />
                                                    </div>
                                                )}
                                                <div className="flex gap-1 mb-2">
                                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.bg }} />
                                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.border }} />
                                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ACCENT_COLORS[preset.defaultAccent] }} />
                                                </div>
                                                <p className="font-medium text-sm text-white dark:text-white light:text-neutral-900">{preset.name}</p>
                                            </button>
                                        );
                                    }
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Accent Color */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-neutral-800">
                        <div className="space-y-1">
                            <label className="block text-sm font-semibold text-white dark:text-white light:text-neutral-900">Accent Color</label>
                            <p className="text-sm text-neutral-400 dark:text-neutral-400 light:text-neutral-500">
                                Choose your primary highlight color.
                            </p>
                        </div>
                        <div className="md:col-span-2">
                            <div className="flex flex-wrap gap-2">
                                {(Object.entries(ACCENT_COLORS) as [AccentColor, string][]).map(([id, color]) => {
                                    const isSelected = settings.accentColor === id;
                                    return (
                                        <button
                                            key={id}
                                            onClick={() => setAccentColor(id)}
                                            className={`w-8 h-8 rounded-lg transition-all flex items-center justify-center ${isSelected
                                                ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-900 dark:ring-offset-neutral-900 light:ring-offset-neutral-100 scale-110'
                                                : 'hover:scale-105'
                                                }`}
                                            style={{ backgroundColor: color }}
                                            title={id.charAt(0).toUpperCase() + id.slice(1)}
                                        >
                                            {isSelected && <Check size={14} className="text-white drop-shadow" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Font Family */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-neutral-800">
                        <div className="space-y-1">
                            <label className="block text-sm font-semibold text-white dark:text-white light:text-neutral-900">Font Family</label>
                            <p className="text-sm text-neutral-400 dark:text-neutral-400 light:text-neutral-500">
                                Select the font style for the interface.
                            </p>
                        </div>
                        <div className="md:col-span-2">
                            <div className="flex gap-2 flex-wrap">
                                {(Object.entries(FONT_FAMILIES) as [FontFamily, { name: string; value: string }][]).map(
                                    ([id, font]) => {
                                        const isSelected = settings.fontFamily === id;
                                        return (
                                            <button
                                                key={id}
                                                onClick={() => setFontFamily(id)}
                                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${isSelected
                                                    ? 'bg-accent text-white shadow-lg'
                                                    : 'bg-neutral-800 dark:bg-neutral-800 light:bg-neutral-200 text-neutral-400 dark:text-neutral-400 light:text-neutral-600 hover:bg-neutral-700 dark:hover:bg-neutral-700 light:hover:bg-neutral-300'
                                                    }`}
                                                style={{ fontFamily: font.value }}
                                            >
                                                {font.name}
                                            </button>
                                        );
                                    }
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
