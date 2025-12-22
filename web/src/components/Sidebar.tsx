import { LayoutDashboard, Search, Database, Settings, Activity, Heart } from 'lucide-react';

interface SidebarProps {
    currentView: string;
    setView: (view: any) => void;
}

export default function Sidebar({ currentView, setView }: SidebarProps) {
    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
        { id: 'search', label: 'Search', icon: <Search size={20} /> },
        { id: 'indexers', label: 'Indexers', icon: <Database size={20} /> },
        { id: 'activity', label: 'Activity', icon: <Activity size={20} /> },
        { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
    ];

    return (
        <aside
            className="hidden lg:flex flex-col w-64 h-screen fixed left-0 top-0 border-r transition-colors"
            style={{
                backgroundColor: 'var(--theme-bg)',
                borderColor: 'var(--theme-border)'
            }}
        >
            {/* Logo Area */}
            <div className="h-16 flex items-center px-6 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                <div className="flex items-center gap-3">
                    <img src="/icon.png" alt="Logo" className="w-8 h-8 rounded-lg" />
                    <span className="text-lg font-bold tracking-wide" style={{ color: 'var(--theme-text)' }}>
                        Lodestarr
                    </span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-6 space-y-1">
                {navItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setView(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-all`}
                        style={{
                            backgroundColor: currentView === item.id ? 'var(--theme-accent)' : 'transparent',
                            color: currentView === item.id ? '#ffffff' : 'var(--theme-text-muted)',
                        }}
                    >
                        {item.icon}
                        {item.label}
                    </button>
                ))}
            </nav>

            {/* Footer / System Status */}
            <div className="p-4 border-t" style={{ borderColor: 'var(--theme-border)' }}>
                <div
                    className="flex items-center gap-3 px-4 py-3 rounded-md border"
                    style={{
                        backgroundColor: 'var(--theme-card)',
                        borderColor: 'var(--theme-border)'
                    }}
                >
                    <Heart size={16} className="text-red-500 fill-red-500/20" />
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium" style={{ color: 'var(--theme-text)' }}>System Healthy</p>
                        <p className="text-[10px] truncate" style={{ color: 'var(--theme-text-muted)' }}>v0.4.2-0</p>
                    </div>
                </div>
            </div>
        </aside>
    );
}
