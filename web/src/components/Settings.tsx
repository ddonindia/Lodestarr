import { useState } from 'react';
import { Globe, Palette, Sliders } from 'lucide-react';
import AppearanceSettings from './AppearanceSettings';
import DownloadSettings from './settings/DownloadSettings';
import ProxySettings from './settings/ProxySettings';

type TabId = 'general' | 'proxy' | 'appearance';

interface SettingTab {
    id: TabId;
    label: string;
    icon: React.ReactNode;
    component: React.ReactNode;
}

export default function Settings() {
    const [activeTab, setActiveTab] = useState<TabId>('appearance');

    const tabs: SettingTab[] = [
        {
            id: 'appearance',
            label: 'Appearance',
            icon: <Palette size={18} />,
            component: <AppearanceSettings />
        },
        {
            id: 'general',
            label: 'General',
            icon: <Sliders size={18} />,
            component: <DownloadSettings />
        },
        {
            id: 'proxy',
            label: 'Network',
            icon: <Globe size={18} />,
            component: <ProxySettings />
        }
    ];

    return (
        <div className="w-full max-w-6xl mx-auto p-6 h-[calc(100vh-6rem)]">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
                <p className="text-neutral-400 mt-1">Manage your application preferences</p>
            </header>

            <div className="flex flex-col lg:flex-row gap-8 h-full">
                {/* Sidebar Navigation */}
                <aside className="w-full lg:w-64 flex-shrink-0">
                    <nav className="space-y-2 sticky top-6">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === tab.id
                                    ? 'bg-accent text-white shadow-lg'
                                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </aside>

                {/* Content Area */}
                <main className="flex-1 min-w-0 h-full overflow-y-auto pb-20 pr-2">
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        {tabs.find(t => t.id === activeTab)?.component}
                    </div>
                </main>
            </div>
        </div>
    );
}
