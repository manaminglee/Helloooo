import { useState, useEffect } from 'react';
import { API_BASE } from '../config/apiBase';

export function CreatorProfilePopup({ handle, onClose }) {
  const [creator, setCreator] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function getProfile() {
      try {
        const res = await fetch(`${API_BASE}/api/creator/profile/${handle}`);
        if (!res.ok) throw new Error('Profile not found');
        const data = await res.json();
        setCreator(data);
        if (data.is_following) setIsFollowing(true);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    getProfile();
  }, [handle]);

  const handleFollow = async (e) => {
    e.stopPropagation();
    if (isFollowing) return;
    try {
      const res = await fetch(`${API_BASE}/api/creators/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle })
      });
      const data = await res.json();
      if (data.success) {
        setIsFollowing(true);
        if (!data.already_following) {
          setCreator(prev => ({ ...prev, followers_count: data.count }));
        }
      }
    } catch (e) {}
  };

  if (loading) return (
    <div className="p-10 text-center bg-black/80 backdrop-blur-3xl rounded-[40px] border border-white/10 animate-fade-in">
       <div className="w-12 h-12 border-t-2 border-violet-400 rounded-full animate-spin mx-auto mb-4" />
       <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Syncing Identity...</p>
    </div>
  );

  if (error || !creator) return (
    <div className="p-10 text-center bg-black/80 backdrop-blur-3xl rounded-[40px] border border-rose-500/20 animate-fade-in relative">
       <button onClick={onClose} className="absolute top-6 right-6 text-white/20 hover:text-white">✕</button>
       <div className="text-4xl mb-4">🌑</div>
       <p className="text-[10px] font-black uppercase tracking-widest text-rose-400">Signal Lost: Profile Unavailable</p>
    </div>
  );

  return (
    <div className="p-8 w-full max-w-sm bg-black/90 backdrop-blur-3xl rounded-[45px] border border-white/10 shadow-2xl animate-in-zoom relative overflow-hidden group select-none">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent opacity-50" />
      <button onClick={onClose} className="absolute top-6 right-8 z-50 text-white/20 hover:text-white transition-all text-xl">✕</button>
      
      <div className="relative z-10 flex flex-col items-center">
        {/* Avatar */}
        <div className="relative mb-6">
           <div className={`w-24 h-24 rounded-[35px] overflow-hidden border-2 border-white/10 ${creator.avatar_url ? '' : 'bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center'}`}>
             {creator.avatar_url ? (
               <img src={creator.avatar_url} alt={creator.handle_name} className="w-full h-full object-cover" />
             ) : (
               <span className="text-4xl font-black italic text-white/40">{creator.handle_name[0].toUpperCase()}</span>
             )}
           </div>
           <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-2xl bg-violet-500 border-4 border-black flex items-center justify-center shadow-lg">
             <span className="text-[10px]">⭐</span>
           </div>
        </div>

        <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white mb-1 group-hover:text-violet-400 transition-colors">@{creator.handle_name}</h3>
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-6 italic">{creator.platform}</p>

        <div className="grid grid-cols-2 gap-4 w-full mb-8">
           <div className="p-4 rounded-3xl bg-white/5 border border-white/5 text-center">
              <div className="text-[8px] font-black uppercase text-white/20 mb-1">Followers</div>
              <div className="text-xl font-black italic text-white tabular-nums">{(creator.followers_count || 0).toLocaleString()}</div>
           </div>
           <div className="p-4 rounded-3xl bg-white/5 border border-white/5 text-center">
              <div className="text-[8px] font-black uppercase text-white/20 mb-1">Status</div>
              <div className="text-xs font-black italic text-emerald-400 uppercase tracking-widest">{creator.status}</div>
           </div>
        </div>

        {creator.bio && <p className="text-[11px] font-medium text-white/50 text-center mb-8 px-4 leading-relaxed border-l-2 border-violet-500/20 italic">{creator.bio}</p>}

        <div className="flex flex-col gap-3 w-full">
           <button 
             onClick={handleFollow}
             className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-xl active:scale-95 ${
               isFollowing ? 'bg-white/10 text-white/20 border border-white/5' : 'bg-violet-500 text-black hover:bg-white'
             }`}
           >
             {isFollowing ? '✓ Following Signal' : '🔥 Follow Creator'}
           </button>
           
           {creator.profile_link && (
             <a 
               href={creator.profile_link} 
               target="_blank" 
               rel="noopener noreferrer"
               className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest text-[10px] text-center hover:bg-white/[0.08] transition-all"
             >
               Visit Social Profile →
             </a>
           )}
        </div>
      </div>
    </div>
  );
}
