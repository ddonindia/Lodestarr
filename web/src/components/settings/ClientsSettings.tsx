import { useState, useEffect } from 'react';
import { Trash2, Plus, Server, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface DownloadClient {
    id: string;
    name: string;
    client_type: 'TorrServer';
    url: string;
}

export default function ClientsSettings() {
    const [clients, setClients] = useState<DownloadClient[]>([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);

    // New Client State
    const [newName, setNewName] = useState('TorrServer');
    const [newType, setNewType] = useState('TorrServer');
    const [newUrl, setNewUrl] = useState('http://localhost:8090');
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');

    useEffect(() => {
        fetchClients();
    }, []);

    const fetchClients = async () => {
        try {
            const res = await fetch('/api/settings/clients');
            if (res.ok) {
                const data = await res.json();
                setClients(data);
            }
        } catch (error) {
            console.error('Failed to load clients', error);
            toast.error('Failed to load download clients');
        } finally {
            setLoading(false);
        }
    };

    const handleAddClient = async (e: React.FormEvent) => {
        e.preventDefault();
        setAdding(true);

        try {
            const res = await fetch('/api/settings/clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newName,
                    client_type: newType,
                    url: newUrl,
                    username: newUsername || null,
                    password: newPassword || null
                })
            });

            if (res.ok) {
                const client = await res.json();
                setClients([...clients, client]);
                toast.success('Client added successfully');
                // Reset defaults
                setNewName('TorrServer');
                setNewUrl('http://localhost:8090');
                setNewUsername('');
                setNewPassword('');
            } else {
                const txt = await res.text();
                toast.error(`Failed to add client: ${txt}`);
            }
        } catch (error) {
            toast.error('Failed to connect to server');
        } finally {
            setAdding(false);
        }
    };

    // Update defaults when type changes
    useEffect(() => {
        if (newType === 'TorrServer') {
            setNewName('TorrServer');
            setNewUrl('http://localhost:8090');
        } else if (newType === 'QBittorrent') {
            setNewName('qBittorrent');
            setNewUrl('http://localhost:8080');
        }
    }, [newType]);

    const handleDeleteClient = async (id: string) => {
        if (!confirm('Are you sure you want to remove this client?')) return;

        try {
            const res = await fetch(`/api/settings/clients/${id}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                setClients(clients.filter(c => c.id !== id));
                toast.success('Client removed');
            } else {
                toast.error('Failed to remove client');
            }
        } catch (error) {
            toast.error('Failed to remove client');
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-semibold text-white">Download Clients</h2>
                <p className="text-neutral-400 text-sm mt-1">Configure external download clients like TorrServer and qBittorrent.</p>
            </div>

            {/* List Clients */}
            <div className="space-y-4">
                {clients.map(client => (
                    <div
                        key={client.id}
                        className="flex items-center justify-between p-4 rounded-xl border border-neutral-800 bg-neutral-900/50"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-full bg-neutral-800 text-accent">
                                <Server size={20} />
                            </div>
                            <div>
                                <h3 className="font-medium text-white">{client.name}</h3>
                                <div className="flex items-center gap-2 text-xs text-neutral-400 mt-1">
                                    <span className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700">
                                        {client.client_type}
                                    </span>
                                    <span>{client.url}</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => handleDeleteClient(client.id)}
                            className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            title="Remove Client"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                ))}

                {clients.length === 0 && !loading && (
                    <div className="text-center py-8 text-neutral-500 bg-neutral-900/20 rounded-xl border border-dashed border-neutral-800">
                        No download clients configured.
                    </div>
                )}
            </div>

            {/* Add Client Form */}
            <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/30">
                <h3 className="font-medium text-white mb-4">Add New Client</h3>
                <form onSubmit={handleAddClient} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-neutral-400 mb-1">Name</label>
                            <input
                                type="text"
                                required
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                                placeholder="My Client"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-neutral-400 mb-1">Type</label>
                            <select
                                value={newType}
                                onChange={e => setNewType(e.target.value)}
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent appearance-none"
                            >
                                <option value="TorrServer">TorrServer</option>
                                <option value="QBittorrent">qBittorrent</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-neutral-400 mb-1">URL</label>
                            <input
                                type="url"
                                required
                                value={newUrl}
                                onChange={e => setNewUrl(e.target.value)}
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                                placeholder="http://localhost:8080"
                            />
                        </div>

                        {/* Auth Fields for qBittorrent */}
                        {newType === 'QBittorrent' && (
                            <>
                                <div>
                                    <label className="block text-xs font-medium text-neutral-400 mb-1">Username</label>
                                    <input
                                        type="text"
                                        value={newUsername}
                                        onChange={e => setNewUsername(e.target.value)}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                                        placeholder="admin"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-neutral-400 mb-1">Password</label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                                        placeholder="adminadmin"
                                    />
                                </div>
                            </>
                        )}

                        <div className="md:col-span-2 pt-2">
                            <button
                                type="submit"
                                disabled={adding}
                                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {adding ? (
                                    <>Adding...</>
                                ) : (
                                    <>
                                        <Plus size={16} />
                                        Add Client
                                    </>
                                )}
                            </button>
                            <p className="text-[10px] text-neutral-500 mt-2 flex items-center gap-1">
                                <AlertCircle size={10} />
                                Connection will be tested before adding.
                            </p>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
