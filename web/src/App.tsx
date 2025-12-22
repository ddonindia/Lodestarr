import { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from './contexts/ThemeContext';

import Search from './components/Search';
import Dashboard from './components/Dashboard';
import Indexers from './components/NativeIndexers'; // Using NativeIndexers as main Indexers view
import Settings from './components/Settings';
import RecentActivity from './components/RecentActivity';
import Sidebar from './components/Sidebar';

function App() {
  const [view, setView] = useState<'dashboard' | 'search' | 'indexers' | 'settings' | 'activity'>('dashboard');
  const { settings, setColorMode, resolvedMode } = useTheme();

  const toggleTheme = () => {
    const nextMode = settings.colorMode === 'dark' ? 'light' : settings.colorMode === 'light' ? 'auto' : 'dark';
    setColorMode(nextMode);
  };

  const getThemeIcon = () => {
    if (settings.colorMode === 'auto') return <Monitor size={20} />;
    return resolvedMode === 'dark' ? <Moon size={20} /> : <Sun size={20} />;
  };

  return (
    <div
      className="min-h-screen font-sans transition-colors"
      style={{
        backgroundColor: 'var(--theme-bg)',
        color: 'var(--theme-text)',
      }}
    >
      <Sidebar currentView={view} setView={setView} />

      {/* Main Content Area - Shifted right by 64 (16rem) to account for sidebar */}
      <main className="lg:pl-64 min-h-screen">
        {/* Top Bar for Mobile / Global Actions (Search, etc - can be added later) */}
        <header
          className="h-16 border-b flex items-center justify-between px-8 sticky top-0 z-40 backdrop-blur"
          style={{
            backgroundColor: 'var(--theme-card)',
            borderColor: 'var(--theme-border)',
            color: 'var(--theme-text)'
          }}
        >
          <h2 className="text-lg font-semibold capitalize opacity-90">
            {view}
          </h2>
          {/* Top Right Actions */}
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-white/10 transition-colors text-neutral-400 hover:text-white"
              title={`Toggle theme mode (current: ${settings.colorMode})`}
            >
              {getThemeIcon()}
            </button>
          </div>
        </header>

        <div className="p-8 max-w-[1600px] mx-auto">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            {view === 'dashboard' && <Dashboard />}
            {view === 'search' && <Search />}
            {view === 'indexers' && <Indexers />}
            {view === 'settings' && <Settings />}
            {view === 'activity' && <RecentActivity />}
          </div>
        </div>
      </main>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            backgroundColor: '#262626',
            color: '#fafafa',
            borderColor: '#404040',
            border: '1px solid #404040',
          },
          duration: 3000,
        }}
      />
    </div>
  );
}

export default App;
