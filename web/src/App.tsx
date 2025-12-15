import { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from './contexts/ThemeContext';
import Search from './components/Search';
import Dashboard from './components/Dashboard';
import Indexers from './components/Indexers';
import Settings from './components/Settings';

function App() {
  const [view, setView] = useState<'dashboard' | 'search' | 'indexers' | 'health' | 'settings'>('dashboard');
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-white font-sans">
      <header className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 py-4 px-6 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('dashboard')}>
            <img src="/icon.png" alt="Lodestarr" className="w-8 h-8 rounded-lg" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent">
              Lodestarr
            </h1>
          </div>

          <nav className="flex gap-1 bg-neutral-100 dark:bg-neutral-900/50 p-1 rounded-lg">
            <NavButton active={view === 'dashboard'} onClick={() => setView('dashboard')}>Dashboard</NavButton>
            <NavButton active={view === 'search'} onClick={() => setView('search')}>Search</NavButton>
            {/* <NavButton active={view === 'indexers'} onClick={() => setView('indexers')}>Indexers</NavButton> */}
            <NavButton active={view === 'settings'} onClick={() => setView('settings')}>Settings</NavButton>
          </nav>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5 text-yellow-500" />
            ) : (
              <Moon className="w-5 h-5 text-neutral-700" />
            )}
          </button>
        </div>
      </header>

      <main className="py-8">
        {view === 'dashboard' && <Dashboard />}
        {view === 'search' && <Search />}
        {view === 'indexers' && <Indexers />}
        {view === 'health' && <HealthPlaceholder />}
        {view === 'settings' && <Settings />}
      </main>

      <Toaster
        position="top-right"
        toastOptions={{
          className: 'dark:bg-neutral-800 dark:text-white',
          duration: 3000,
        }}
      />
    </div>
  );
}

function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${active
        ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800'
        }`}
    >
      {children}
    </button>
  );
}


function HealthPlaceholder() {
  return (
    <div className="max-w-6xl mx-auto px-6">
      <div className="text-center text-neutral-500 dark:text-neutral-400 mt-20">
        <h2 className="text-2xl font-bold mb-2">Health Monitoring</h2>
        <p>Coming soon - Monitor indexer health status</p>
      </div>
    </div>
  );
}

export default App;
