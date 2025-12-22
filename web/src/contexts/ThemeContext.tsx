import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// Theme preset names
export type ThemePreset = 'classic' | 'ocean' | 'forest' | 'sunset' | 'midnight' | 'sonarr';
export type ColorMode = 'dark' | 'light' | 'auto';
export type FontFamily = 'inter' | 'roboto' | 'system';

// Accent colors available for customization
export const ACCENT_COLORS = {
    emerald: '#10b981',
    sky: '#0ea5e9',
    violet: '#8b5cf6',
    amber: '#f59e0b',
    rose: '#f43f5e',
    cyan: '#06b6d4',
    indigo: '#6366f1',
    lime: '#84cc16',
} as const;

export type AccentColor = keyof typeof ACCENT_COLORS;

// Theme preset definitions with colors for both light and dark modes
export const THEME_PRESETS: Record<ThemePreset, {
    name: string;
    description: string;
    dark: { bg: string; card: string; border: string; text: string; textMuted: string; };
    light: { bg: string; card: string; border: string; text: string; textMuted: string; };
    defaultAccent: AccentColor;
}> = {
    classic: {
        name: 'Classic',
        description: 'Clean neutral grays',
        dark: { bg: '#0a0a0a', card: '#171717', border: '#404040', text: '#ffffff', textMuted: '#a3a3a3' },
        light: { bg: '#fafafa', card: '#ffffff', border: '#e5e5e5', text: '#171717', textMuted: '#737373' },
        defaultAccent: 'emerald',
    },
    ocean: {
        name: 'Ocean',
        description: 'Deep sea blues',
        dark: { bg: '#0c1929', card: '#0f2942', border: '#1e4976', text: '#e0f2fe', textMuted: '#94a3b8' },
        light: { bg: '#f0f9ff', card: '#ffffff', border: '#bae6fd', text: '#0c4a6e', textMuted: '#64748b' },
        defaultAccent: 'sky',
    },
    forest: {
        name: 'Forest',
        description: 'Earthy greens',
        dark: { bg: '#0a1510', card: '#0f1f18', border: '#1a3528', text: '#ecfccb', textMuted: '#a3b894' },
        light: { bg: '#f0fdf4', card: '#ffffff', border: '#bbf7d0', text: '#14532d', textMuted: '#65a30d' },
        defaultAccent: 'emerald',
    },
    sunset: {
        name: 'Sunset',
        description: 'Warm oranges & reds',
        dark: { bg: '#1a0f0a', card: '#2a1810', border: '#4a2c1a', text: '#fff7ed', textMuted: '#fdba74' },
        light: { bg: '#fffbeb', card: '#ffffff', border: '#fed7aa', text: '#431407', textMuted: '#9a3412' },
        defaultAccent: 'amber',
    },
    midnight: {
        name: 'Midnight',
        description: 'Deep purple vibes',
        dark: { bg: '#0f0a1a', card: '#1a1025', border: '#2d1b4e', text: '#f3e8ff', textMuted: '#a855f7' },
        light: { bg: '#faf5ff', card: '#ffffff', border: '#e9d5ff', text: '#581c87', textMuted: '#9333ea' },
        defaultAccent: 'violet',
    },
    sonarr: {
        name: 'Sonarr',
        description: 'Serious business',
        dark: { bg: '#1a1a1a', card: '#262626', border: '#404040', text: '#ffffff', textMuted: '#a3a3a3' },
        light: { bg: '#f5f5f5', card: '#ffffff', border: '#e5e5e5', text: '#171717', textMuted: '#737373' },
        defaultAccent: 'sky',
    },
};

export const FONT_FAMILIES: Record<FontFamily, { name: string; value: string }> = {
    inter: { name: 'Inter', value: "'Inter', system-ui, sans-serif" },
    roboto: { name: 'Roboto', value: "'Roboto', system-ui, sans-serif" },
    system: { name: 'System UI', value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
};

interface ThemeSettings {
    colorMode: ColorMode;
    preset: ThemePreset;
    accentColor: AccentColor;
    fontFamily: FontFamily;
}

interface ThemeContextType {
    // Settings
    settings: ThemeSettings;
    resolvedMode: 'dark' | 'light';

    // Setters
    setColorMode: (mode: ColorMode) => void;
    setPreset: (preset: ThemePreset) => void;
    setAccentColor: (color: AccentColor) => void;
    setFontFamily: (font: FontFamily) => void;

    // Legacy compatibility
    theme: ColorMode;
    setTheme: (theme: ColorMode) => void;
}

const DEFAULT_SETTINGS: ThemeSettings = {
    colorMode: 'dark',
    preset: 'sonarr',
    accentColor: 'sky',
    fontFamily: 'inter',
};

const STORAGE_KEY = 'lodestarr-theme';

function loadSettings(): ThemeSettings {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return { ...DEFAULT_SETTINGS, ...parsed };
        }
        // Migrate from old 'theme' key
        const oldTheme = localStorage.getItem('theme');
        if (oldTheme) {
            return { ...DEFAULT_SETTINGS, colorMode: oldTheme as ColorMode };
        }
    } catch {
        // Ignore parse errors
    }
    return DEFAULT_SETTINGS;
}

function saveSettings(settings: ThemeSettings): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function applyTheme(settings: ThemeSettings, resolvedMode: 'dark' | 'light'): void {
    const root = document.documentElement;
    const preset = THEME_PRESETS[settings.preset];
    const colors = preset[resolvedMode];
    const accent = ACCENT_COLORS[settings.accentColor];
    const font = FONT_FAMILIES[settings.fontFamily];

    // Apply color mode class
    root.classList.remove('dark', 'light');
    root.classList.add(resolvedMode);

    // Apply data attributes for CSS
    root.dataset.theme = settings.preset;
    root.dataset.accent = settings.accentColor;

    // Set CSS custom properties
    root.style.setProperty('--theme-bg', colors.bg);
    root.style.setProperty('--theme-card', colors.card);
    root.style.setProperty('--theme-border', colors.border);
    root.style.setProperty('--theme-text', colors.text);
    root.style.setProperty('--theme-text-muted', colors.textMuted);
    root.style.setProperty('--theme-accent', accent);
    root.style.setProperty('--theme-font', font.value);

    // Set font family on body
    document.body.style.fontFamily = font.value;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<ThemeSettings>(loadSettings);
    const [resolvedMode, setResolvedMode] = useState<'dark' | 'light'>('dark');

    // Resolve actual color mode (for 'auto' mode)
    useEffect(() => {
        let mode: 'dark' | 'light';
        if (settings.colorMode === 'auto') {
            mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        } else {
            mode = settings.colorMode;
        }
        setResolvedMode(mode);
        applyTheme(settings, mode);
    }, [settings]);

    // Listen for system theme changes when in auto mode
    useEffect(() => {
        if (settings.colorMode !== 'auto') return;

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e: MediaQueryListEvent) => {
            const mode = e.matches ? 'dark' : 'light';
            setResolvedMode(mode);
            applyTheme(settings, mode);
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [settings]);

    const updateSettings = (partial: Partial<ThemeSettings>) => {
        setSettings(prev => {
            const next = { ...prev, ...partial };
            saveSettings(next);
            return next;
        });
    };

    const setColorMode = (colorMode: ColorMode) => updateSettings({ colorMode });
    const setPreset = (preset: ThemePreset) => {
        // When changing preset, optionally set default accent
        const newAccent = THEME_PRESETS[preset].defaultAccent;
        updateSettings({ preset, accentColor: newAccent });
    };
    const setAccentColor = (accentColor: AccentColor) => updateSettings({ accentColor });
    const setFontFamily = (fontFamily: FontFamily) => updateSettings({ fontFamily });

    return (
        <ThemeContext.Provider value={{
            settings,
            resolvedMode,
            setColorMode,
            setPreset,
            setAccentColor,
            setFontFamily,
            // Legacy compatibility
            theme: settings.colorMode,
            setTheme: setColorMode,
        }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
