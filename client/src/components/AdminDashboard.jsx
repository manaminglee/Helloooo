import { useState, useEffect, useMemo, useRef } from 'react';

const API_BASE = import.meta.env.VITE_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : '');

/**
 * Mana Mingle Admin Dashboard v2.5
 * Features: Live stats, Visualizations, Economy control, Security, Moderation, Monitoring, Ads
 */
export function AdminDashboard({ onJoinRoom }) {
  const [key, setKey] = useState(sessionStorage.getItem('mm_admin_key') || '');
  const [isLogged, setIsLogged] = useState(!!sessionStorage.getItem('mm_admin_key'));
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [ipInput, setIpInput] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [isKillswitchConfirm, setIsKillswitchConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('overview'); // overview, users, creators, room-monitoring, economy, security, ads, logic, admin-ai
  const [creators, setCreators] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [history, setHistory] = useState([]);
  const [economyLogs, setEconomyLogs] = useState([]);
  const [toast, setToast] = useState(null);
  const [adForm, setAdForm] = useState({
    hero: '',
    sidebar: '',
    footer: '',
    chat_banner: '',
    chat_sidebar: '',
  });
  const [manualGrantIp, setManualGrantIp] = useState('');
  const socketRef = useRef(null);

  const fetchStats = async (adminKey) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/overview`, {
        headers: { 'x-admin-key': adminKey },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        if (data.adScripts) setAdForm((prev) => ({ ...prev, ...data.adScripts }));
        setError('');
        setIsLogged(true);
        sessionStorage.setItem('mm_admin_key', adminKey);
      } else {
        const err = await res.json();
        setError(err.error || 'Unauthorized');
        setIsLogged(false);
      }
    } catch (e) {
      setError('Connection failed');
    }
  };

  const fetchCreators = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/creators`, {
        headers: { 'x-admin-key': key },
      });
      if (res.ok) {
        const data = await res.json();
        setCreators(data.creators || []);
        setWithdrawals(data.withdrawals || []);
      }
    } catch (e) { }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/history`, {
        headers: { 'x-admin-key': key },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (e) { }
  };

  const fetchEconomyLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/economy/logs`, {
        headers: { 'x-admin-key': key },
      });
      if (res.ok) {
        const data = await res.json();
        setEconomyLogs(data.logs || []);
      }
    } catch (e) { }
  };

  const handleCreatorApprove = async (creatorId, status) => {
    const creator = creators.find(c => c.id === creatorId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/creators/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify({ creatorId, status }),
      });
      if (res.ok) {
        const data = await res.json();
        fetchCreators();
        fetchHistory();
        setToast(`${status === 'approved' ? '✅' : '❌'} @${creator?.handle_name} ${status}${ data.password ? ` · Password: ${data.password}` : ''}`);
      } else {
        setToast('⚠️ Action failed — check server logs');
      }
    } catch (e) { setToast('⚠️ Network error'); }
  };

  const handleWithdrawalStatus = async (withdrawalId, status) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/withdrawals/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify({ withdrawalId, status }),
      });
      if (res.ok) {
        fetchCreators();
        fetchHistory();
        setToast(status === 'paid' ? '✅ Withdrawal marked paid' : '❌ Withdrawal rejected — coins restored');
      } else {
        const err = await res.json().catch(() => ({}));
        setToast(err.error || 'Withdrawal update failed');
      }
    } catch (e) {
      setToast('⚠️ Network error');
    }
  };

  const handleFeaturedToggle = async (creatorId, featured) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/creators/featured`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify({ creatorId, featured }),
      });
      if (res.ok) {
        fetchCreators();
        setToast(featured ? '⭐ Creator featured' : 'Creator unfeatured');
      } else {
        const err = await res.json().catch(() => ({}));
        setToast(err.error || 'Featured update failed');
      }
    } catch (e) {
      setToast('⚠️ Network error');
    }
  };

  const handleAdminResetPassword = async (creatorId) => {
    const creator = creators.find((c) => c.id === creatorId);
    if (!window.confirm(`Reset password for @${creator?.handle_name}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/creators/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify({ creatorId }),
      });
      if (res.ok) {
        const data = await res.json();
        setToast(`🔑 Password reset${data.password ? `: ${data.password}` : ''}${creator?.email ? ' (emailed to creator)' : ''}`);
        fetchHistory();
      } else {
        const err = await res.json().catch(() => ({}));
        setToast(err.error || 'Reset failed');
      }
    } catch (e) {
      setToast('⚠️ Network error');
    }
  };


  const handleLogin = (e) => {
    e.preventDefault();
    fetchStats(key);
  };

  const updateSetting = async (field, value) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const data = await res.json();
        setStats(prev => ({ ...prev, ...data }));
        setToast(`✅ Setting updated: ${field}`);
      }
    } catch (e) { }
  };

  const handleAdSave = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/admin/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify({ adScripts: adForm }),
      });
      if (res.ok) {
        const data = await res.json();
        setStats((prev) => (prev ? { ...prev, ...data } : data));
        if (data.adScripts) setAdForm((prev) => ({ ...prev, ...data.adScripts }));
        fetchStats(key);
        setToast('✅ Ad Settings Updated!');
      } else setToast('⚠️ Ad save failed');
    } catch (e) {
      setToast('⚠️ Network error');
    }
  };

  const handleEndRoom = async (roomId) => {
    if (!window.confirm(`⚠️ Terminate user session ${roomId}?`)) return;
    try {
      // We use the socket event directly via the server listener I added
      // But we can also use an API endpoint. For simplicity, we can just emit if we had socket here.
      // However, AdminDashboard is an API-first component. I'll add an API endpoint in server soon if needed.
      // For now, let's assume we use an endpoint I'll add.
      const res = await fetch(`${API_BASE}/api/admin/end-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify({ roomId }),
      });
      if (res.ok) {
        setToast(`💥 Room ${roomId} terminated.`);
        fetchStats(key);
      }
    } catch (e) { }
  };

  const handleBlockIp = async (e, ipArg) => {
    if (e) e.preventDefault();
    const target = ipArg || ipInput.trim();
    if (!target) return;
    try {
      await fetch(`${API_BASE}/api/admin/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify({ ip: target }),
      });
      setIpInput('');
      fetchStats(key);
      setToast(`🚫 IP Blocked: ${target}`);
    } catch (e) { }
  };

  const handleUnblockIp = async (ip) => {
    try {
      await fetch(`${API_BASE}/api/admin/unblock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify({ ip }),
      });
      fetchStats(key);
      setToast(`🔓 IP Unblocked: ${ip}`);
    } catch (e) { }
  };

  const handleWarnIp = async (ip) => {
    try {
      await fetch(`${API_BASE}/api/admin/warn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify({ ip, message: '⚠️ WARNING: Your behavior flag has been raised. Platform de-authorization imminent.' }),
      });
      fetchStats(key);
      setToast(`⚠️ Warning broadcast to user ${ip}`);
    } catch (e) { }
  };

  const handleUpdateCoins = async (ip, amount, set = false) => {
    try {
      await fetch(`${API_BASE}/api/admin/coins/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify({ ip, amount, set }),
      });
      fetchStats(key);
      setToast(`💰 Coin logic modified for ${ip}`);
    } catch (e) { }
  };

  const handleResolveReport = async (reportId) => {
    try {
      await fetch(`${API_BASE}/api/admin/resolve-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify({ reportId }),
      });
      fetchStats(key);
      setToast('✅ Metadata resolved');
    } catch (e) { }
  };

  const handleSendAnnouncement = async (e) => {
    e.preventDefault();
    if (!announcement.trim()) return;
    try {
      await fetch(`${API_BASE}/api/admin/announcement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify({ message: announcement }),
      });
      setAnnouncement('');
      setToast('📣 Global Broadcast initialized.');
    } catch (e) { }
  };

  const handleKillswitch = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/killswitch`, {
        method: 'POST',
        headers: { 'x-admin-key': key }
      });
      if (res.ok) {
        const data = await res.json();
        setToast(`💥 System Restart: ${data.kicked} users disconnected.`);
        setIsKillswitchConfirm(false);
        fetchStats(key);
      }
    } catch (e) { }
  };

  const lookupIp = async (ip) => {
    if (!ip) return;
    try {
      const res = await fetch(`https://ipapi.co/${ip}/json/`);
      const data = await res.json();
      if (data.error) return alert('IP lookup failed');
      alert(`User Detail: ${data.city}, ${data.region_code}, ${data.country_name} · ISP: ${data.org}`);
    } catch (e) { alert('Lookup service failed'); }
  };

  const handleExportCSV = (data, filename) => {
    if (!data || !data.length) return setToast('⚠️ No data structure found for export');

    // Safely extract all unique headers from JSON objects
    const headers = Array.from(new Set(data.flatMap(Object.keys)));

    // Escape standard CSV strings
    const csvRows = [
      headers.join(','),
      ...data.map(row => headers.map(fieldName => {
        let val = row[fieldName];
        if (typeof val === 'object') val = JSON.stringify(val);
        val = String(val || '');
        // Escape quotes and commas
        return `"${val.replace(/"/g, '""')}"`;
      }).join(','))
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${Date.now()}.csv`;
    a.click();
    setToast(`📥 Exported ${filename}.csv`);
  };

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // On login: immediately load all data in parallel
  useEffect(() => {
    if (isLogged) {
      Promise.all([fetchStats(key), fetchCreators(), fetchHistory(), fetchEconomyLogs()]);
    }
  }, [isLogged]);

  // Auto-refresh: stats every 5s, creators every 8s when on creators tab
  useEffect(() => {
    if (!isLogged) return;
    const statsInterval = setInterval(() => fetchStats(key), 5000);
    return () => clearInterval(statsInterval);
  }, [isLogged, key]);

  // Real-time socket connection for live admin notifications
  useEffect(() => {
    if (!isLogged) return;

    let mounted = true;
    (async () => {
      const { io } = await import('socket.io-client');
      if (!mounted) return;
      const s = io(API_BASE || window.location.origin, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        withCredentials: true,
        reconnection: true,
      });
      socketRef.current = s;

      // New creator application submitted — update list and show toast
      s.on('creator-new-application', (creator) => {
        setCreators(prev => {
          if (prev.find(c => c.id === creator.id)) return prev;
          return [creator, ...prev];
        });
        setToast(`🔔 New creator application: @${creator.handle_name} (${creator.platform})`);
      });

      // Creator status was changed (approve/reject from another admin session)
      s.on('creator-status-changed', () => {
        fetchCreators();
      });
    })();

    return () => {
      mounted = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [isLogged]);
  useEffect(() => {
    if (isLogged && activeTab === 'creators') {
      fetchCreators();
    }
    if (isLogged && activeTab === 'history') {
      fetchHistory();
    }
    if (isLogged && activeTab === 'economy') {
      fetchEconomyLogs();
    }
  }, [activeTab, isLogged]);

  // Auto-refresh creators every 8s when on creators tab
  useEffect(() => {
    if (!isLogged || activeTab !== 'creators') return;
    const interval = setInterval(fetchCreators, 8000);
    return () => clearInterval(interval);
  }, [isLogged, activeTab]);

  const filteredUsers = useMemo(() => {
    if (!stats?.userList) return [];
    if (!searchQuery) return stats.userList;
    const q = searchQuery.toLowerCase();
    return stats.userList.filter(u =>
      u.nickname.toLowerCase().includes(q) ||
      u.ip.includes(q) ||
      (u.country || '').toLowerCase().includes(q)
    );
  }, [stats?.userList, searchQuery]);

  if (!isLogged) {
    return (
      <div className="min-h-screen bg-realm-void flex items-center justify-center p-6 text-white font-sans">
        <div className="max-w-md w-full p-10 rounded-[40px] bg-black border border-white/10 backdrop-blur-3xl shadow-[0_0_100px_rgba(99,102,241,0.2)] animate-in-zoom">
          <div className="flex flex-col items-center mb-8">
            <img src="/apple-touch-icon.png" alt="MM" className="w-20 h-20 mb-6 drop-shadow-[0_0_20px_rgba(6,182,212,0.4)]" />
            <h1 className="text-2xl font-black uppercase tracking-[0.2em] italic">Admin <span className="text-cyan-400">Dashboard</span></h1>
            <p className="text-[10px] text-white/20 mt-2 font-black uppercase tracking-[0.3em]">Authorized Access Required</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Enter Admin Key..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-cyan-500/50 transition-all text-center tracking-widest font-black uppercase text-xs"
              />
            </div>
            <button className="w-full py-4 bg-cyan-500 text-black rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-xl shadow-cyan-600/20 hover:scale-[1.02] active:scale-95 transition-all">
              Login to Dashboard
            </button>
            <button
              type="button"
              onClick={() => window.location.href = '/'}
              className="w-full text-[10px] text-white/20 hover:text-white/40 transition-colors uppercase tracking-[0.4em] font-black mt-6"
            >
              ← Back to Site
            </button>
            {error && <p className="text-rose-400 text-[10px] text-center font-black uppercase mt-4 animate-shake">Invalid Admin Key</p>}
          </form>
        </div>
      </div>
    );
  }

  const UsageChart = ({ data }) => {
    if (!data || data.length < 2) return <div className="h-40 flex items-center justify-center text-white/10 text-xs italic">Waiting for data...</div>;
    const maxUsers = Math.max(...data.map(d => d.users), 10);
    return (
      <div className="h-40 flex items-end gap-1 px-2 border-b border-l border-white/5 bg-black/20 rounded-lg">
        {data.map((d, i) => (
          <div
            key={i}
            className="flex-1 bg-cyan-500/30 rounded-t-sm hover:bg-cyan-500 transition-all relative group"
            style={{ height: `${(d.users / maxUsers) * 100}%` }}
          >
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-black rounded text-[8px] opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap">
              {d.users} Active
            </div>
          </div>
        ))}
      </div>
    );
  };

  const ResourceBar = ({ label, value, max, color }) => (
    <div className="space-y-1">
      <div className="flex justify-between text-[8px] uppercase tracking-widest font-black text-white/20 px-1">
        <span>{label}</span>
        <span>{Math.round((value / max) * 100)}%</span>
      </div>
      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-1000`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
    </div>
  );

  const tabList = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'users', label: 'Users', icon: '👤' },
    { id: 'creators', label: 'Creators', icon: '⭐', badge: creators.filter(c => c.status === 'pending').length },
    { id: 'room-monitoring', label: 'Rooms', icon: '👁️' },
    { id: 'economy', label: 'Economy', icon: '🪙' },
    { id: 'security', label: 'Security', icon: '🛡️' },
    { id: 'ads', label: 'Ads', icon: '💰' },
    { id: 'logic', label: 'Settings', icon: '⚙️' },
    { id: 'history', label: 'History', icon: '📜' },
    { id: 'admin-ai', label: 'AI', icon: '🧠' },
  ];

  return (
    <div className="min-h-screen bg-black text-[#f8fafc] font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      <div className="flex flex-col lg:flex-row min-h-screen">
        {/* Mobile / tablet tab strip */}
        <nav className="lg:hidden flex gap-1 overflow-x-auto p-2 border-b border-white/10 bg-zinc-950/95 sticky top-0 z-[100] shrink-0" aria-label="Admin sections">
          {tabList.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-tight whitespace-nowrap border transition-all ${
                activeTab === tab.id ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-white/5 text-white/40 border-white/10'
              }`}
            >
              <span className="mr-1 opacity-70">{tab.icon}</span>
              {tab.label}
              {tab.badge > 0 && <span className="ml-1 text-amber-400">({tab.badge})</span>}
            </button>
          ))}
        </nav>

        {/* Sidebar Nav */}
        <aside className="w-72 border-r border-white/5 bg-black/40 backdrop-blur-3xl p-8 hidden lg:flex flex-col gap-10 shrink-0">
          <div className="flex items-center gap-4 px-2">
            <img src="/apple-touch-icon.png" alt="M" className="w-10 h-10 object-contain drop-shadow-[0_0_10px_#06b6d4]" />
            <div className="flex flex-col">
              <span className="font-black text-sm tracking-[0.2em] italic uppercase leading-none">Mana <span className="text-cyan-400">Admin</span></span>
              <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mt-1">System Online</span>
            </div>
          </div>

          <nav className="flex flex-col gap-1.5">
            {tabList.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-4 px-5 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-xl' : 'text-white/30 hover:text-white/60 hover:bg-white/5'}`}
              >
                <span className="text-lg opacity-60">{tab.icon}</span>
                <span className="flex-1 text-left">{tab.label}</span>
                {tab.badge > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500 text-black text-[8px] font-black min-w-[18px] text-center animate-pulse">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="mt-auto space-y-4">
            <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 shadow-inner">
              <div className="text-[8px] font-black uppercase text-white/10 mb-4 tracking-widest px-1 italic">Diagnostics</div>
              <div className="space-y-4">
                <ResourceBar label="Server Memory" value={stats?.memory?.heapUsed || 0} max={stats?.memory?.heapTotal || 1} color="bg-cyan-500" />
                <ResourceBar label="CPU Load" value={35} max={100} color="bg-indigo-500" />
              </div>
            </div>
            <button
              onClick={() => { sessionStorage.removeItem('mm_admin_key'); setIsLogged(false); window.location.reload(); }}
              className="w-full py-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all shadow-xl shadow-rose-900/10"
            >
              Terminate Auth
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-12 lg:p-14 custom-scrollbar lg:bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,0.03),transparent_40%)] min-w-0">
          <header className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-8 animate-fade-in-down">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-black tracking-tight italic uppercase m-0">{activeTab.replace('-', ' ')}</h1>
                <div className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[9px] font-black text-cyan-400 uppercase tracking-widest shadow-xl">v2.5</div>
              </div>
              <p className="text-white/20 text-[11px] font-black uppercase tracking-widest">Administrative Management Dashboard · Tracking {stats?.users || 0} Connected Users</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.3em] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#10b981]" />
                  Administrative Access Secure
                </span>
                <span className="text-[10px] text-white/10 font-black uppercase italic mt-1">Uptime: {Math.floor((stats?.stats?.uptimeSeconds || 0) / 3600)}H {Math.floor(((stats?.stats?.uptimeSeconds || 0) % 3600) / 60)}M</span>
              </div>
            </div>
          </header>

          {activeTab === 'overview' && (
            <div className="space-y-10 animate-fade-in">
              {/* Massive Counters */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Active Users', value: stats?.users || 0, color: 'text-cyan-400', icon: '👤', shadow: 'shadow-cyan-900/10' },
                  { label: 'Active Rooms', value: stats?.rooms || 0, color: 'text-indigo-400', icon: '🏠', shadow: 'shadow-indigo-900/10' },
                  { label: 'Total Connections', value: stats?.stats?.totalConnections || 0, color: 'text-purple-400', icon: '🔄', shadow: 'shadow-purple-900/10' },
                  { label: 'System Wealth', value: stats?.coinStats?.totalCoinsInSystem || 0, color: 'text-amber-400', icon: '🪙', shadow: 'shadow-amber-900/10' },
                ].map(s => (
                  <div key={s.label} className={`p-8 rounded-[40px] bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all group relative overflow-hidden ${s.shadow}`}>
                    <div className="absolute top-4 right-4 text-4xl opacity-5 group-hover:opacity-10 group-hover:scale-125 transition-all grayscale">{s.icon}</div>
                    <div className="text-[9px] font-black uppercase text-white/20 mb-2 tracking-[0.2em] italic">{s.label}</div>
                    <div className={`text-4xl font-black tracking-tighter italic ${s.color}`}>{s.value.toLocaleString()}</div>
                  </div>
                ))}
              </div>

              {stats?.infrastructure && (
                <div className="p-8 rounded-[40px] bg-white/[0.02] border border-white/5 space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.35em] text-emerald-400">WebRTC / signaling</h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-[11px] text-white/60">
                    <div>
                      <span className="text-white/30 font-black uppercase text-[9px] block mb-1">TURN</span>
                      {stats.infrastructure.turnConfigured ? (
                        <span className="text-emerald-400 font-black">Configured</span>
                      ) : (
                        <span className="text-amber-400 font-black">STUN only</span>
                      )}
                      {stats.infrastructure.turnUrlHint && (
                        <p className="text-[9px] text-white/25 mt-1 font-mono truncate" title={stats.infrastructure.turnUrlHint}>{stats.infrastructure.turnUrlHint}</p>
                      )}
                    </div>
                    <div>
                      <span className="text-white/30 font-black uppercase text-[9px] block mb-1">Signal rate limit</span>
                      <span className="text-cyan-400 font-black">{stats.infrastructure.signalMaxPerMinute ?? '—'} / min / socket</span>
                    </div>
                    <div>
                      <span className="text-white/30 font-black uppercase text-[9px] block mb-1">STUN</span>
                      <span className="text-white/50">{Array.isArray(stats.infrastructure.stunEndpoints) ? stats.infrastructure.stunEndpoints.length : 0} endpoint(s)</span>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3 text-[10px] text-white/40">
                      {stats.infrastructure.relayFallback
                        ? <span className="text-amber-400/90">NAT relay: STUN-only — add TURN for strict corporate / mobile NAT.</span>
                        : <span className="text-emerald-400/80">NAT relay: TURN credentials present for restrictive networks.</span>}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 p-10 rounded-[50px] bg-white/[0.02] border border-white/5 shadow-2xl">
                  <div className="flex justify-between items-center mb-10">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400">User Activity Graph</h3>
                    <span className="text-[9px] font-black text-white/10 uppercase tracking-widest italic">Last 60m Activity</span>
                  </div>
                  <UsageChart data={stats?.statsHistory} />
                </div>
                <div className="p-10 rounded-[50px] bg-white/[0.02] border border-white/5 flex flex-col shadow-2xl relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-40 pointer-events-none" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-8 relative z-10">Interface Distribution</h3>
                  <div className="flex-1 space-y-8 relative z-10">
                    <div className="space-y-3">
                      <div className="flex justify-between text-[11px] font-black uppercase italic"><span className="text-white/40 tracking-widest">Video Streams</span> <span className="text-cyan-400">72%</span></div>
                      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden shadow-inner"><div className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400" style={{ width: '72%' }} /></div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between text-[11px] font-black uppercase italic"><span className="text-white/40 tracking-widest">Text Messages</span> <span className="text-indigo-400">28%</span></div>
                      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden shadow-inner"><div className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400" style={{ width: '28%' }} /></div>
                    </div>
                    <div className="mt-12 pt-8 border-t border-white/5">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="text-center p-5 rounded-[24px] bg-white/5 border border-white/5">
                          <div className="text-[8px] font-black uppercase text-white/20 mb-2 tracking-widest">Queue (V)</div>
                          <div className="text-2xl font-black text-white tracking-widest italic">{stats?.queues?.video || 0}</div>
                        </div>
                        <div className="text-center p-5 rounded-[24px] bg-white/5 border border-white/5">
                          <div className="text-[8px] font-black uppercase text-white/20 mb-2 tracking-widest">Queue (T)</div>
                          <div className="text-2xl font-black text-white tracking-widest italic">{stats?.queues?.text || 0}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-10">
                <div className="p-10 rounded-[50px] bg-[#050505] border border-white/10 shadow-2xl">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400 mb-8 italic">📢 Global Announcement</h3>
                  <form onSubmit={handleSendAnnouncement} className="space-y-6">
                    <textarea
                      value={announcement}
                      onChange={(e) => setAnnouncement(e.target.value)}
                      placeholder="Message for all users..."
                      className="w-full bg-white/5 border border-white/10 rounded-3xl px-6 py-6 text-sm min-h-[120px] outline-none focus:border-cyan-500/50 transition-all font-bold tracking-tight shadow-inner"
                    />
                    <button className="w-full py-5 bg-cyan-500 text-black rounded-3xl text-[11px] font-black uppercase tracking-[0.3em] shadow-xl shadow-cyan-600/30 hover:bg-white transition-all active:scale-95">Send Global Announcement</button>
                  </form>
                </div>
                <div className="p-10 rounded-[50px] bg-rose-500/[0.02] border border-rose-500/10 shadow-2xl overflow-hidden relative">
                  <div className="absolute -top-10 -right-10 w-40 h-40 bg-rose-500/5 rounded-full blur-3xl" />
                  <div className="flex justify-between items-center mb-8 relative z-10">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-500 italic">🚩 Reported Content</h3>
                    <span className="text-[9px] font-black bg-rose-500 text-white px-3 py-1 rounded-full shadow-lg">{stats?.openReportsCount || 0} NEW DATA</span>
                  </div>
                  <div className="space-y-4 max-h-[180px] overflow-y-auto pr-4 custom-scrollbar relative z-10">
                    {stats?.reports?.map(r => (
                      <div key={r.id} className="p-4 rounded-[20px] bg-black/40 border border-white/5 flex items-center justify-between group hover:border-rose-500/30 transition-all">
                        <div>
                          <div className="text-[10px] font-black text-rose-400 uppercase tracking-widest">{r.reason}</div>
                          <div className="text-[9px] text-white/20 font-black mt-1 uppercase">USER: {r.targetIp}</div>
                        </div>
                        <button onClick={() => handleResolveReport(r.id)} className="text-[9px] font-black uppercase text-white/20 hover:text-rose-400 transition-all">Resolve Report →</button>
                      </div>
                    ))}
                    {(!stats?.reports || stats.reports.length === 0) && (
                      <div className="flex flex-col items-center justify-center py-10 opacity-10 grayscale">
                        <div className="text-4xl mb-4">🛡️</div>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em]">System Status: Nominal</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-10 animate-fade-in">
              <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
                <div className="relative flex-1 w-full group">
                  <span className="absolute left-6 top-1/2 -translate-y-1/2 text-white/10 text-xl group-focus-within:text-cyan-400 transition-colors">🔍</span>
                  <input
                    type="text"
                    placeholder="Search Users (IP, Nick, Country)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-[30px] pl-16 pr-8 py-5 text-sm focus:outline-none focus:border-cyan-500/50 transition-all font-bold tracking-tight shadow-inner"
                  />
                </div>
                <div className="flex gap-4">
                  <button onClick={() => handleExportCSV(filteredUsers, 'platform_users')} className="px-8 py-5 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-cyan-500/20 hover:text-cyan-400 hover:border-cyan-500/30 transition-all shadow-xl">Export CSV</button>
                  <button onClick={() => fetchStats(key)} className="px-8 py-5 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white/10 transition-all shadow-xl">Refresh Data</button>
                </div>
              </div>

              <div className="rounded-[40px] bg-white/[0.02] border border-white/5 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-white/[0.02] border-b border-white/5 text-[10px] uppercase font-black tracking-[0.3em] text-white/20 italic">
                        <th className="px-10 py-6">User Info</th>
                        <th className="px-10 py-6">Connection Details</th>
                        <th className="px-10 py-6">Wallet Balance</th>
                        <th className="px-10 py-6 text-right">Moderation Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {filteredUsers.map(u => (
                        <tr key={u.socketId} className="hover:bg-white/[0.01] transition-all group border-b border-white/[0.01]">
                          <td className="px-10 py-8">
                            <div className="flex items-center gap-5">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl bg-white/5 border border-white/10 text-cyan-400 font-black italic transition-all group-hover:scale-110 group-hover:border-cyan-500/40 ${u.mode !== 'idle' ? 'ring-2 ring-emerald-500 ring-offset-8 ring-offset-black' : ''}`}>
                                {u.nickname?.[0] || 'A'}
                              </div>
                              <div>
                                <div className="font-black text-white group-hover:text-cyan-400 transition-colors uppercase tracking-tight">{u.nickname}</div>
                                <div className="text-[10px] text-white/20 uppercase font-black tracking-widest mt-0.5">{u.country || 'Unknown Relay'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-10 py-8">
                            <div className="font-mono text-xs text-white/30 mb-1.5 font-bold tracking-tight uppercase">IP: {u.ip}</div>
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${u.mode === 'idle' ? 'bg-white/20' : 'bg-emerald-500 animate-pulse'}`} />
                              <span className="text-[10px] font-black uppercase text-white/20 tracking-tighter italic">{u.mode} mode active</span>
                            </div>
                          </td>
                          <td className="px-10 py-8">
                            <div className="text-amber-500 font-black flex items-center gap-2 text-sm italic">🪙 {u.coins || 0}</div>
                            {u.coins > 200 && <span className="text-[10px] uppercase font-black text-amber-500/20 tracking-widest mt-1 block">Elite User</span>}
                          </td>
                          <td className="px-10 py-8 text-right">
                            <div className="flex gap-3 justify-end opacity-20 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                              <button onClick={() => handleWarnIp(u.ip)} className="p-3 rounded-[15px] bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500 hover:text-black transition-all">⚠️</button>
                              <button onClick={(e) => handleBlockIp(e, u.ip)} className="p-3 rounded-[15px] bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all">🚫</button>
                              <button onClick={() => lookupIp(u.ip)} className="p-3 rounded-[15px] bg-white/5 text-white/40 border border-white/5 hover:bg-white hover:text-black transition-all">📍</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredUsers.length === 0 && (
                        <tr><td colSpan="4" className="py-24 text-center text-white/10 italic text-sm font-black uppercase tracking-[0.5em]">No matching user data found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'room-monitoring' && (
            <div className="space-y-10 animate-fade-in select-none">
              <div className="flex flex-wrap items-center justify-between gap-4 px-2">
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30">
                  Live sessions · {(stats?.roomsWithActivity || stats?.roomList || []).length} active
                </p>
                <button type="button" onClick={() => fetchStats(key)} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white">
                  Refresh
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {(stats?.roomsWithActivity || stats?.roomList || []).map((r) => {
                  const typeLabel = r.sessionType === '1:1' ? '1:1' : 'Group';
                  const modeLabel = r.mode === 'group_video' ? 'Group Video' : r.mode === 'video' ? 'Video Chat' : r.mode === 'group_text' ? 'Group Text' : r.mode === 'text' ? 'Text Chat' : r.mode;
                  return (
                  <div key={r.id} className="group p-8 rounded-[40px] bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 transition-all relative overflow-hidden flex flex-col min-h-[400px] shadow-2xl">
                    <div className="absolute top-0 right-0 p-6 flex items-center gap-2">
                       <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
                       <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">{typeLabel} · {modeLabel}</span>
                    </div>
                    
                    <div className="mb-6">
                      <div className="text-xl font-black italic uppercase tracking-tighter mb-1 text-white group-hover:text-indigo-400 transition-colors">#{r.interest}</div>
                      <div className="text-[9px] text-white/20 font-black uppercase tracking-widest leading-relaxed">ID: {r.id}</div>
                      <div className="text-[9px] text-white/25 font-bold mt-1">
                        {r.participantCount ?? r.participants?.length ?? 0}/{r.maxSize || '?'} participants
                      </div>
                    </div>

                    <div className="flex-1 space-y-4">
                       <div className="text-[10px] font-black text-indigo-400/60 uppercase tracking-widest italic mb-2">Live Participants</div>
                       <div className="space-y-2">
                          {(r.participants || []).map((p) => (
                            <div key={p.socketId || p.nickname} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 text-[9px] font-bold text-white/50">
                              <span>{p.isCreator ? `@${p.nickname}` : (p.nickname || 'Anonymous')}</span>
                              {p.country && <span className="text-white/30 uppercase">{p.country}</span>}
                              {p.isCreator && <span className="text-violet-400">★</span>}
                            </div>
                          ))}
                          {(!r.participants || r.participants.length === 0) && (r.users || []).map((nick, i) => (
                            <span key={i} className="inline-block px-3 py-1 rounded-full bg-white/5 border border-white/5 text-[9px] font-bold text-white/40">{nick}</span>
                          ))}
                       </div>

                       <div className="mt-6 pt-6 border-t border-white/5">
                          <div className="text-[10px] font-black text-rose-400/60 uppercase tracking-widest italic mb-3">Live Signal Log</div>
                          <div className="space-y-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                             {(r.messages || []).map((m, i) => (
                               <div key={i} className="p-2.5 rounded-xl bg-black/40 border border-white/5 text-[10px] leading-relaxed">
                                  <span className="font-black text-white/20 uppercase mr-2">{m.nickname}:</span>
                                  <span className="text-white/60 italic">&ldquo;{m.text}&rdquo;</span>
                               </div>
                             ))}
                             {(!r.messages || r.messages.length === 0) && <div className="text-[9px] text-white/10 uppercase font-black italic">No activity detected...</div>}
                          </div>
                       </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-white/5 flex flex-col gap-3">
                       {onJoinRoom && r.mode?.includes('video') && (
                       <button 
                         onClick={() => onJoinRoom(r.id, r.mode, r.interest)}
                         className="w-full py-3.5 bg-white/5 hover:bg-white text-white hover:text-black transition-all rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/10"
                       >
                         Spectate View →
                       </button>
                       )}
                       <button 
                         onClick={() => handleEndRoom(r.id)}
                         className="w-full py-3.5 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all font-black text-[10px] uppercase tracking-widest"
                       >
                         Terminate {typeLabel} Session
                       </button>
                    </div>
                  </div>
                );})}
                {(!stats?.roomsWithActivity || stats.roomsWithActivity.length === 0) && (!stats?.roomList || stats.roomList.length === 0) && (
                  <div className="lg:col-span-3 py-48 text-center bg-white/[0.01] border border-white/5 rounded-[60px] shadow-inner">
                    <div className="text-5xl mb-6 opacity-20">🍃</div>
                    <p className="text-[11px] font-black uppercase tracking-[0.4em] text-white/20">No active signal rooms found</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'creators' && (
            <div className="space-y-10 animate-fade-in">

              {/* Pending count summary */}
              <div className="flex gap-6">
                {[{ label: 'Pending Approval', val: creators.filter(c => c.status === 'pending').length, color: 'text-amber-400 border-amber-500/20 bg-amber-500/5' },
                  { label: 'Approved', val: creators.filter(c => c.status === 'approved').length, color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' },
                  { label: 'Rejected', val: creators.filter(c => c.status === 'rejected').length, color: 'text-rose-400 border-rose-500/20 bg-rose-500/5' },
                  { label: 'Total Applied', val: creators.length, color: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/5' },
                ].map(s => (
                  <div key={s.label} className={`flex-1 p-5 rounded-[28px] border ${s.color} text-center`}>
                    <div className="text-2xl font-black italic">{s.val}</div>
                    <div className="text-[9px] font-black uppercase tracking-widest opacity-60 mt-1">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="p-10 rounded-[50px] bg-gradient-to-br from-cyan-500/5 to-transparent border border-cyan-500/10 shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400 italic">⭐ Creator Applications</h3>
                    <p className="text-[9px] text-white/20 font-black uppercase mt-1">{creators.filter(c => c.status === 'pending').length} pending review</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={fetchCreators} className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">Refresh 🔄</button>
                    <button onClick={() => handleExportCSV(creators, 'platform_creators')} className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-cyan-500/20 hover:text-cyan-400 transition-all">Export CSV</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase font-black tracking-widest text-white/20 border-b border-white/5 italic">
                        <th className="py-4 pr-4">Creator Handle</th>
                        <th className="py-4 pr-4">Email</th>
                        <th className="py-4 pr-4">Platform</th>
                        <th className="py-4 pr-4">Profile Link</th>
                        <th className="py-4 pr-4">Coins / Ref / Tips</th>
                        <th className="py-4 pr-4">Featured</th>
                        <th className="py-4 pr-4">Applied</th>
                        <th className="py-4 pr-4">Status</th>
                        <th className="py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {creators.length === 0 && (
                        <tr><td colSpan="9" className="py-20 text-center text-white/10 italic text-sm font-black uppercase tracking-[0.5em]">No creator applications yet</td></tr>
                      )}
                      {creators.map(c => (
                        <tr key={c.id} className={`hover:bg-white/[0.01] transition-all group ${ c.status === 'pending' ? 'border-l-2 border-l-amber-500/40' : ''}`}>
                          <td className="py-5 pr-4">
                            <div className="font-black text-white italic group-hover:text-cyan-400 transition-colors uppercase tracking-widest">{c.handle_name}</div>
                            <div className="text-[9px] text-white/20 font-mono mt-0.5">{c.referral_code}</div>
                          </td>
                          <td className="py-5 pr-4 text-[9px] text-white/40 max-w-[140px] truncate" title={c.email || ''}>{c.email || '—'}</td>
                          <td className="py-5 pr-4 text-xs text-white/40 font-black uppercase tracking-widest">{c.platform}</td>
                          <td className="py-5 pr-4">
                            <a href={c.profile_link} target="_blank" rel="noopener noreferrer"
                              className="text-[9px] text-cyan-400/60 hover:text-cyan-400 transition-colors underline underline-offset-2 font-bold max-w-[160px] truncate block">
                              Verify Profile ↗
                            </a>
                          </td>
                          <td className="py-5 pr-4 text-xs font-black uppercase tracking-widest">
                            <span className="text-cyan-400 italic">🪙 {c.coins_earned}</span>
                            <span className="mx-2 text-white/5">/</span>
                            <span className="text-indigo-400 italic">🖱️ {c.referral_count || 0}</span>
                            <span className="mx-2 text-white/5">/</span>
                            <span className="text-amber-400 italic">💰 {c.tips_received_total || 0}</span>
                          </td>
                          <td className="py-5 pr-4">
                            {c.status === 'approved' ? (
                              <button
                                type="button"
                                onClick={() => handleFeaturedToggle(c.id, !c.featured)}
                                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                                  c.featured ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-white/5 text-white/30 border border-white/10 hover:text-amber-300'
                                }`}
                              >
                                {c.featured ? '⭐ Featured' : '☆ Pin'}
                              </button>
                            ) : (
                              <span className="text-white/15 text-[9px]">—</span>
                            )}
                          </td>
                          <td className="py-5 pr-4 text-[9px] text-white/20 font-black">
                            {new Date(c.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-5 pr-4">
                            <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                              c.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              c.status === 'rejected' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                              'bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse'
                            }`}>{c.status}</span>
                          </td>
                          <td className="py-5 text-right">
                            <div className="flex flex-wrap gap-2 justify-end">
                              {c.status === 'approved' && (
                                <>
                                  <button type="button" onClick={() => handleAdminResetPassword(c.id)}
                                    className="px-3 py-1.5 bg-violet-500/20 hover:bg-violet-500 text-violet-300 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">
                                    🔑 Reset PW
                                  </button>
                                </>
                              )}
                              {c.status !== 'approved' && (
                                <button onClick={() => handleCreatorApprove(c.id, 'approved')}
                                  className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">
                                  ✅ Approve
                                </button>
                              )}
                              {c.status !== 'rejected' && (
                                <button onClick={() => handleCreatorApprove(c.id, 'rejected')}
                                  className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">
                                  ❌ Reject
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-10 rounded-[50px] bg-gradient-to-br from-emerald-500/5 to-transparent border border-emerald-500/10 shadow-2xl">
                <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-400 mb-8 italic">💸 Withdrawal Requests</h3>
                <div className="space-y-4">
                  {withdrawals?.map(w => (
                    <div key={w.id} className="p-6 rounded-[30px] bg-white/[0.02] border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group hover:border-emerald-500/20 transition-all">
                      <div>
                        <div className="text-sm font-black text-white italic uppercase tracking-widest">{w.creators?.handle_name || w.handle_name}</div>
                        <div className="text-[10px] text-white/20 font-black uppercase tracking-widest mt-1">UPI: {w.upi}</div>
                        <div className="text-[9px] text-white/10 mt-1">{new Date(w.created_at).toLocaleString()}</div>
                        {w.admin_note && <div className="text-[9px] text-white/30 mt-2 italic">{w.admin_note}</div>}
                      </div>
                      <div className="text-right flex flex-col items-end gap-2">
                        <div className="text-xl font-black text-emerald-400 italic tracking-tighter">₹{Number(w.amount_rs ?? w.amount ?? 0).toLocaleString()}</div>
                        <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                          w.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                          w.status === 'rejected' ? 'bg-rose-500/20 text-rose-400' :
                          'bg-amber-500/20 text-amber-400'
                        }`}>{w.status}</span>
                        {w.status === 'pending' && (
                          <div className="flex gap-2 mt-1">
                            <button type="button" onClick={() => handleWithdrawalStatus(w.id, 'paid')} className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 text-[8px] font-black uppercase hover:bg-emerald-500 hover:text-black transition-all">Mark paid</button>
                            <button type="button" onClick={() => handleWithdrawalStatus(w.id, 'rejected')} className="px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-400 text-[8px] font-black uppercase hover:bg-rose-500 hover:text-white transition-all">Reject</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {(!withdrawals || withdrawals.length === 0) && (
                    <div className="py-10 text-center opacity-10 text-xs font-black uppercase tracking-[0.5em]">No withdrawal requests</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ads' && (
            <div className="space-y-10 animate-fade-in">
              <div className="p-10 rounded-[50px] bg-gradient-to-br from-amber-500/5 to-transparent border border-amber-500/10 shadow-2xl">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
                  <div>
                    <h2 className="text-2xl font-black italic uppercase tracking-tight">Ads <span className="text-amber-500">Management</span></h2>
                    <p className="text-[10px] text-white/30 font-black uppercase tracking-widest mt-1">Manage platform advertisement settings</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Global State:</span>
                    <button
                      onClick={() => updateSetting('adsEnabled', !stats?.adsEnabled)}
                      className={`relative w-12 h-6 rounded-full transition-all ${stats?.adsEnabled ? 'bg-amber-500' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-all transform ${stats?.adsEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>

                <form onSubmit={handleAdSave} className="space-y-8">
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-8">
                    {[
                      { id: 'hero', label: 'Primary Hero Slot', desc: 'Landing top' },
                      { id: 'sidebar', label: 'Mid-page rail', desc: 'Landing middle' },
                      { id: 'footer', label: 'Pre-footer', desc: 'Landing bottom' },
                      { id: 'chat_banner', label: 'Chat banner', desc: 'All chat/video UIs' },
                      { id: 'chat_sidebar', label: 'Chat sidebar', desc: 'Group rooms (desktop)' },
                    ].map(slot => (
                      <div key={slot.id} className="space-y-4">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-[10px] font-black uppercase tracking-widest text-white/40">{slot.label}</label>
                          <span className="text-[8px] font-black text-white/10 uppercase italic">{slot.desc}</span>
                        </div>
                        <textarea
                          value={adForm[slot.id]}
                          onChange={(e) => setAdForm(prev => ({ ...prev, [slot.id]: e.target.value }))}
                          placeholder="Paste Ad Script code here..."
                          className="w-full bg-black/40 border border-white/10 rounded-[28px] p-6 text-xs h-[240px] focus:border-amber-500/40 transition-all font-mono shadow-inner outline-none text-amber-500/60"
                        />
                      </div>
                    ))}
                  </div>
                  <button className="w-full py-5 bg-amber-500 text-black rounded-3xl text-[11px] font-black uppercase tracking-[0.4em] shadow-xl shadow-amber-900/40 hover:bg-white transition-all active:scale-95">Save Ads Configuration</button>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'economy' && (
            <div className="space-y-10 animate-fade-in">
              <div className="p-12 rounded-[50px] bg-[#050505] border border-amber-500/10 flex flex-col lg:flex-row gap-12 items-center shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-[100px] -mr-32 -mt-32" />
                <div className="flex-1 relative z-10">
                  <h2 className="text-3xl font-black italic uppercase tracking-tight mb-4">Economy <span className="text-amber-500">Hub</span></h2>
                  <p className="text-sm text-white/30 mb-10 leading-relaxed font-bold italic uppercase tracking-wide">Managing real-time coin distribution and Verifying IP Persistence.</p>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="p-8 rounded-[32px] bg-white/[0.02] border border-white/5 shadow-inner">
                      <div className="text-[10px] font-black text-amber-500/60 uppercase mb-3 tracking-[0.2em] italic">Total Wallets</div>
                      <div className="text-4xl font-black text-white italic tracking-tighter">{stats?.coinStats?.uniqueWallets || 0}</div>
                    </div>
                    <div className="p-8 rounded-[32px] bg-white/[0.02] border border-white/5 shadow-inner">
                      <div className="text-[10px] font-black text-amber-500/60 uppercase mb-3 tracking-[0.2em] italic">Circulating Supply</div>
                      <div className="text-4xl font-black text-white italic tracking-tighter">{stats?.coinStats?.totalCoinsInSystem || 0}</div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-4 relative z-10">
                  <div className="p-6 rounded-3xl bg-white/5 border border-white/10 text-center">
                    <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Manual IP Grant</div>
                    <div className="flex gap-2">
                       <input
                         type="text"
                         value={manualGrantIp}
                         onChange={(e) => setManualGrantIp(e.target.value)}
                         placeholder="IP Address..."
                         className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black uppercase text-amber-500 outline-none focus:border-amber-500/40"
                         onKeyDown={(e) => {
                           if (e.key === 'Enter' && manualGrantIp.trim()) handleUpdateCoins(manualGrantIp.trim(), 100);
                         }}
                       />
                       <button
                         type="button"
                         onClick={() => manualGrantIp.trim() && handleUpdateCoins(manualGrantIp.trim(), 100)}
                         className="px-4 py-2 bg-amber-500 text-black rounded-xl font-black text-[10px] uppercase hover:bg-amber-400"
                       >
                         Grant +100
                       </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-10">
                <div className="rounded-[40px] bg-white/[0.02] border border-white/5 overflow-hidden shadow-2xl">
                  <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
                     <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500 italic">IP-Based Wallet Registry</h3>
                  </div>
                  <div className="overflow-x-auto max-h-[500px] custom-scrollbar">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-white/[0.02] border-b border-white/5 text-[9px] uppercase font-black tracking-[0.3em] text-white/20 italic font-mono">
                          <th className="px-8 py-4">IP ADDRESS</th>
                          <th className="px-8 py-4">BALANCE</th>
                          <th className="px-8 py-4 text-right">ACTION</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.03]">
                        {(stats?.economyList || []).filter(e => !searchQuery || e.ip.includes(searchQuery)).slice(0, 50).map(u => (
                          <tr key={u.ip} className="hover:bg-white/[0.01] transition-all group">
                            <td className="px-8 py-4 font-mono text-xs text-white/60 font-black">{u.ip}</td>
                            <td className="px-8 py-4 font-black italic text-amber-500">🪙 {u.coins}</td>
                            <td className="px-8 py-4 text-right">
                               <button onClick={() => handleUpdateCoins(u.ip, 100)} className="text-[9px] font-black text-white/20 hover:text-emerald-400">GRANT →</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-[40px] bg-white/[0.02] border border-white/5 overflow-hidden shadow-2xl">
                   <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
                     <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400 italic">Live Economy Audit</h3>
                     <button onClick={fetchEconomyLogs} className="text-[8px] font-bold text-white/20 hover:text-white uppercase">Refresh Logs 🔄</button>
                  </div>
                  <div className="overflow-x-auto max-h-[500px] custom-scrollbar p-6 space-y-4">
                    {economyLogs.map((log, i) => (
                      <div key={log.id || i} className="p-4 rounded-2xl bg-black border border-white/5 flex items-center justify-between group hover:border-indigo-500/30 transition-all">
                        <div>
                          <div className="text-[10px] font-black text-white tracking-widest">{log.ip}</div>
                          <div className="text-[8px] text-white/20 font-bold uppercase mt-1">{log.action || 'Claimed Bonus'}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-indigo-400 italic">+🪙 {log.amount}</div>
                          <div className="text-[8px] text-white/10 mt-1">{new Date(log.created_at).toLocaleTimeString()}</div>
                        </div>
                      </div>
                    ))}
                    {economyLogs.length === 0 && (
                      <div className="py-20 text-center opacity-10 text-[9px] font-black uppercase tracking-[0.4em]">No activity logs in buffer</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-10 animate-fade-in">
              <div className="grid lg:grid-cols-2 gap-10">
                <div className="p-10 rounded-[50px] bg-rose-500/[0.02] border border-rose-500/10 shadow-2xl">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-500 mb-8 italic flex items-center gap-3">🚫 Banned IP List</h3>
                  <div className="space-y-4 max-h-[360px] overflow-y-auto pr-4 custom-scrollbar">
                    {stats?.blockedIps?.map(ip => (
                      <div key={ip} className="flex justify-between items-center p-5 rounded-3xl bg-black border border-rose-500/20 group hover:border-rose-500/50 transition-all shadow-inner">
                        <div className="font-mono text-xs text-rose-500 font-bold uppercase tracking-tight">IP: {ip}</div>
                        <button onClick={() => handleUnblockIp(ip)} className="text-[9px] font-black uppercase text-white/20 hover:text-emerald-400 transition-colors">Remove ban →</button>
                      </div>
                    ))}
                    {(!stats?.blockedIps || stats.blockedIps.length === 0) && (
                      <div className="py-24 text-center opacity-10 flex flex-col items-center">
                        <div className="text-4xl mb-6">🛰️</div>
                        <p className="text-[10px] font-black uppercase tracking-[0.4em]">No blocked IPs</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-10 rounded-[50px] bg-amber-500/[0.02] border border-amber-500/10 shadow-2xl">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500 mb-8 italic flex items-center gap-3">⚠️ User Watchlist (Warned)</h3>
                  <div className="space-y-4 max-h-[360px] overflow-y-auto pr-4 custom-scrollbar">
                    {stats?.warnedIps?.map(ip => (
                      <div key={ip} className="flex justify-between items-center p-5 rounded-3xl bg-black border border-amber-500/20 group hover:border-amber-500/50 transition-all shadow-inner">
                        <div className="font-mono text-xs text-amber-500 font-bold uppercase tracking-tight">IP: {ip}</div>
                        <button onClick={async () => {
                          try {
                            await fetch(`${API_BASE}/api/admin/unwarn`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': key }, body: JSON.stringify({ ip }) });
                            fetchStats(key);
                            setToast('Warning cleared.');
                          } catch (e) { }
                        }} className="text-[9px] font-black uppercase text-white/20 hover:text-white transition-colors">Clear Warning →</button>
                      </div>
                    ))}
                    {(!stats?.warnedIps || stats.warnedIps.length === 0) && (
                      <div className="py-24 text-center opacity-10 flex flex-col items-center">
                        <div className="text-4xl mb-6">👁️</div>
                        <p className="text-[10px] font-black uppercase tracking-[0.4em]">No users flagged</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-12 rounded-[60px] bg-rose-500/[0.02] border border-rose-500/20 text-center shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-t from-rose-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="text-3xl font-black italic tracking-tighter text-rose-600 mb-4 uppercase">Emergency System Reset</h3>
                <p className="text-[11px] text-rose-500/40 max-w-lg mx-auto mb-10 font-bold italic uppercase tracking-widest leading-relaxed">Absolute emergency termination of all active sessions and clearing of temporary system data.</p>

                {!isKillswitchConfirm ? (
                  <button onClick={() => setIsKillswitchConfirm(true)} className="px-20 py-6 rounded-[30px] bg-rose-600 text-white font-black uppercase tracking-[0.4em] shadow-[0_20px_50px_rgba(225,29,72,0.3)] hover:scale-[1.02] hover:bg-rose-500 transition-all active:scale-95 text-xs">
                    Execute Emergency Reset
                  </button>
                ) : (
                  <div className="flex gap-4 justify-center animate-in-zoom">
                    <button onClick={handleKillswitch} className="px-10 py-6 rounded-[30px] bg-white text-rose-600 shadow-[0_0_50px_rgba(159,18,57,1)] font-black text-[11px] uppercase tracking-widest animate-pulse">Confirm System Reset</button>
                    <button onClick={() => setIsKillswitchConfirm(false)} className="px-10 py-6 rounded-[30px] bg-white/5 text-white font-black text-[11px] uppercase tracking-widest border border-white/10">Cancel Reset</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'logic' && (
            <div className="space-y-10 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[
                  { field: 'adsEnabled', label: 'Ads Manager', desc: 'Manage advertisement visibility', active: stats?.adsEnabled },
                  { field: 'allowDevTools', label: 'Developer Tools', desc: 'Allow browser console access', active: stats?.allowDevTools },
                  { field: 'maintenanceMode', label: 'Maintenance Mode', desc: 'Disable platform access for maintenance', active: stats?.maintenanceMode, color: 'bg-rose-500' },
                  { field: 'safetyAiEnabled', label: 'Safety System Monitor', desc: 'Behavioural filtering systems', active: stats?.safetyAiEnabled, color: 'bg-cyan-500' },
                  { field: 'coinsEnabled', label: 'Coin Management', desc: 'Authorize coin circulation', active: stats?.coinsEnabled !== false },
                  { field: 'guestRegistration', label: 'Guest Access', desc: 'Allow anonymous user mapping', active: stats?.guestRegistration !== false },
                ].map(f => (
                  <div key={f.field} className="p-10 rounded-[40px] bg-white/[0.02] border border-white/5 flex flex-col justify-between group hover:border-cyan-500/30 transition-all min-h-[180px] shadow-2xl relative overflow-hidden">
                    <div className="absolute -inset-2 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none group-hover:from-white/[0.05]" />
                    <div className="relative z-10">
                      <div className="text-[13px] font-black mb-2 uppercase italic tracking-tight">{f.label}</div>
                      <p className="text-[10px] text-white/20 font-black uppercase tracking-widest leading-relaxed">{f.desc}</p>
                    </div>
                    <div className="flex justify-between items-center mt-8 pt-6 border-t border-white/5 relative z-10">
                      <span className={`text-[9px] font-black uppercase tracking-[0.3em] ${f.active ? 'text-emerald-400 pulse' : 'text-white/10'}`}>{f.active ? 'Operational' : 'De-Activated'}</span>
                      <button
                        onClick={() => updateSetting(f.field, !f.active)}
                        className={`relative w-14 h-7 rounded-full transition-all border border-white/5 ${f.active ? (f.color || 'bg-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.4)]') : 'bg-black shadow-inner'}`}
                      >
                        <div className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-all transform ${f.active ? 'translate-x-7 shadow-xl' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-10 animate-fade-in px-4">
              <div className="p-10 rounded-[50px] bg-white/[0.02] border border-white/5 shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400">Admin Action History</h3>
                  <button onClick={fetchHistory} className="text-[10px] font-black text-white/30 hover:text-white uppercase tracking-widest transition-colors">Refresh Records 🔄</button>
                </div>
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-4 custom-scrollbar">
                  {history.map((h, i) => (
                    <div key={h.id || i} className="p-6 rounded-3xl bg-black border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-cyan-500/20 transition-all shadow-inner relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                           <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${h.action_type === 'CREATOR_APPROVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-white/40'}`}>
                             {h.action_type}
                           </span>
                           <span className="text-[9px] text-white/20 font-black uppercase tracking-tighter">
                             {new Date(h.created_at).toLocaleString()}
                           </span>
                        </div>
                        <div className="text-[13px] font-black uppercase italic tracking-tighter text-white/90">
                           {String(h?.target_name || '')} <span className="text-white/20 not-italic font-medium mx-2">·</span> {String(h?.details || '')}
                        </div>
                      </div>
                      <div className="text-[9px] font-black text-white/10 uppercase tracking-widest text-right">
                        ID: {h.target_id || 'SYSTEM'}
                      </div>
                    </div>
                  ))}
                  {history.length === 0 && (
                    <div className="py-24 text-center opacity-10 flex flex-col items-center select-none">
                      <div className="text-5xl mb-6">📜</div>
                      <p className="text-[10px] font-black uppercase tracking-[0.4em]">No activity records found</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'admin-ai' && <AdminAI keyProp={key} />}
        </main>
      </div>

      {/* Admin Quick Notification Bar */}
      {toast && (
        <div className="fixed bottom-12 right-12 z-[500] px-10 py-5 rounded-[24px] bg-white text-black font-black text-[11px] shadow-2xl animate-fade-in-up flex items-center gap-5 uppercase tracking-[0.4em] italic border-4 border-black">
          <div className="w-3 h-3 rounded-full bg-cyan-500 animate-ping" />
          {toast}
        </div>
      )}

      {/* Mobile: non-blocking hint — full UI remains usable */}
      <div className="lg:hidden sticky bottom-0 z-[200] px-4 py-3 bg-amber-500/90 text-black text-[9px] font-black uppercase tracking-widest text-center border-t border-amber-400/50">
        Mobile view: rotate to landscape or use desktop for wide tables
      </div>
    </div>
  );
}

function AdminAI({ keyProp }) {
  const [aiSummary, setAiSummary] = useState('Checking system health...');
  const [rawLogs, setRawLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAI = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/ai/summary`, {
        headers: { 'x-admin-key': keyProp }
      });
      const data = await res.json();
      setAiSummary(data.summary || 'All systems normal.');
      setRawLogs(data.rawLogs || []);
    } catch (e) {
      setAiSummary('Failed to connect to the smart assistant.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAI(); }, [keyProp]);

  return (
    <div className="space-y-10 animate-fade-in">
      <div className="p-10 rounded-[50px] bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 shadow-[0_0_50px_rgba(245,158,11,0.1)] relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8">
           <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">AI Monitoring Active</span>
           </div>
        </div>
        <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500 mb-8 italic">🧠 AI System Analysis</h3>
        <div className="bg-black/40 backdrop-blur-3xl p-8 rounded-[40px] border border-white/5 relative group">
          <div className="absolute inset-0 bg-amber-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <p className="text-lg font-bold text-white/90 leading-relaxed italic relative z-10">
            {loading ? <span className="animate-pulse">Analyzing system health...</span> : `"${aiSummary}"`}
          </p>
        </div>
        <button onClick={fetchAI} className="mt-8 px-8 py-3.5 bg-amber-500 text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-amber-900/40 hover:scale-[1.02] active:scale-95 transition-all">Refresh System Status</button>
      </div>

      <div className="grid lg:grid-cols-2 gap-10">
         <div className="p-10 rounded-[50px] bg-white/[0.02] border border-white/5 flex flex-col shadow-2xl relative overflow-hidden">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 mb-8 italic">Error History</h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
              {rawLogs.map(log => (
                <div key={log.id} className="p-5 rounded-3xl bg-black/40 border border-white/5 hover:border-rose-500/20 transition-all border-l-4 border-l-rose-500/40">
                   <div className="flex justify-between items-center mb-2">
                      <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest">{log.module}</span>
                      <span className="text-[8px] font-black text-white/10 uppercase">{new Date(log.timestamp).toLocaleTimeString()}</span>
                   </div>
                   <div className="text-xs text-white/70 font-mono break-all">{log.message}</div>
                </div>
              ))}
              {rawLogs.length === 0 && <div className="py-20 text-center text-white/10 italic text-xs uppercase font-black tracking-widest">No problems found.</div>}
            </div>
         </div>
         <div className="p-10 rounded-[50px] bg-white/[0.02] border border-white/5 flex flex-col shadow-2xl">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 mb-8 italic">AI Settings</h3>
            <div className="space-y-6">
               <div className="p-6 rounded-[30px] bg-black/40 border border-white/5">
                  <div className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-4 italic">AI Parameters</div>
                  <div className="space-y-4">
                     <div className="flex justify-between items-center">
                        <span className="text-[10px] text-white/40 uppercase font-black">AI Type</span>
                        <span className="text-[10px] text-indigo-400 font-black">Smart-70B-Chat</span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-[10px] text-white/40 uppercase font-black">Sharpness</span>
                        <span className="text-[10px] text-white/80 font-black">High (0.2)</span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-[10px] text-white/40 uppercase font-black">Processing Speed</span>
                        <span className="text-[10px] text-emerald-400 font-black">480ms</span>
                     </div>
                  </div>
               </div>
               <div className="p-6 rounded-[30px] bg-indigo-500/5 border border-indigo-500/10">
                  <p className="text-[10px] text-indigo-400/60 font-medium leading-relaxed italic">
                    The Smart Assistant is currently monitoring chat safety, connections, and coin transactions. Any unusual behavior will be shown in the error history.
                  </p>
               </div>
            </div>
         </div>
      </div>
   </div>
  );
}

export default AdminDashboard;
