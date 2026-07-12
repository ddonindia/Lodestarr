import { useState, useEffect } from 'react';
import { Terminal, RefreshCw } from 'lucide-react';
import { Card, CardBody } from './ui';

interface LogEntry {
    timestamp: string;
    level: string;
    target: string;
    message: string;
}

export default function Logs() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/logs');
            if (res.ok) {
                const data = await res.json();
                setLogs(data.reverse()); // Show newest first
            }
        } catch (error) {
            console.error('Failed to fetch logs:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const getLevelColor = (level: string) => {
        switch (level) {
            case 'ERROR': return 'text-red-400';
            case 'WARN': return 'text-yellow-400';
            case 'INFO': return 'text-blue-400';
            case 'DEBUG': return 'text-neutral-400';
            case 'TRACE': return 'text-neutral-500';
            default: return 'text-white';
        }
    };

    return (
        <div className="w-full max-w-6xl mx-auto p-6 h-[calc(100vh-6rem)] flex flex-col">
            <header className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                        <Terminal className="text-accent" />
                        System Logs
                    </h1>
                    <p className="text-neutral-400 mt-1">View internal system logs</p>
                </div>
                <button
                    onClick={fetchLogs}
                    disabled={loading}
                    className="p-2 bg-neutral-800 rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
                >
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
            </header>

            <Card className="flex-1 overflow-hidden flex flex-col">
                <CardBody className="flex-1 overflow-auto bg-[#0d0d0d] font-mono text-sm p-4 space-y-1">
                    {logs.length === 0 ? (
                        <div className="text-neutral-500 text-center py-8">No logs available</div>
                    ) : (
                        logs.map((log, i) => (
                            <div key={i} className="flex gap-4 hover:bg-white/5 p-1 rounded">
                                <span className="text-neutral-500 shrink-0 w-44">
                                    {new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19)}
                                </span>
                                <span className={`shrink-0 w-16 font-bold ${getLevelColor(log.level)}`}>
                                    {log.level}
                                </span>
                                <span className="text-neutral-400 shrink-0 w-48 truncate" title={log.target}>
                                    {log.target}
                                </span>
                                <span className="text-neutral-200 break-all whitespace-pre-wrap">
                                    {log.message}
                                </span>
                            </div>
                        ))
                    )}
                </CardBody>
            </Card>
        </div>
    );
}
