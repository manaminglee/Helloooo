import { useEffect, useState } from 'react';

import { API_BASE } from '../config/apiBase';

const API = API_BASE;

export function RoomBrowser({ onJoinRoom, connected }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API}/api/rooms/public`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setRooms(data.rooms || []);
        }
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (loading) {
    return <p className="text-sm text-white/50 text-center py-4">Loading active rooms...</p>;
  }

  if (!rooms.length) {
    return <p className="text-sm text-white/50 text-center py-4">No public rooms yet. Start a group chat to create one.</p>;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rooms.map((room) => (
        <button
          key={room.id}
          type="button"
          disabled={!connected}
          onClick={() => onJoinRoom(room)}
          className="text-left rounded-xl border border-white/10 bg-[#161a22] p-4 hover:border-white/25 disabled:opacity-50 min-h-[72px]"
        >
          <div className="text-sm font-medium text-white capitalize">{room.interest || 'general'}</div>
          <div className="text-xs text-white/50 mt-1">
            {room.mode === 'group_video' ? 'Group Video' : 'Group Text'} · {room.participantCount}/{room.maxSize} people
          </div>
        </button>
      ))}
    </div>
  );
}
