import { useEffect, useState } from 'react';

import { API_BASE } from '../config/apiBase';

const API = API_BASE;

export function RoomBrowser({ onJoinRoom, connected }) {
  const [videoRooms, setVideoRooms] = useState([]);
  const [voiceRooms, setVoiceRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [roomsRes, voiceRes] = await Promise.all([
          fetch(`${API}/api/rooms/public`),
          fetch(`${API}/api/audio/channels`),
        ]);
        if (!cancelled) {
          if (roomsRes.ok) {
            const data = await roomsRes.json();
            setVideoRooms((data.rooms || []).filter((r) => r.mode === 'group_video'));
          }
          if (voiceRes.ok) {
            const data = await voiceRes.json();
            setVoiceRooms((data.channels || []).filter((c) => !c.isPrivate && !c.locked));
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 12000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-white/50 text-center py-4">Loading active rooms...</p>;
  }

  if (!videoRooms.length && !voiceRooms.length) {
    return (
      <p className="text-sm text-white/50 text-center py-4">
        No live rooms yet. Start a voice or group video room to appear here.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {voiceRooms.length > 0 && (
        <div>
          <div className="mm-voice-lobby__list-head !mb-3">
            <h3>Voice rooms</h3>
            <span>{voiceRooms.length} live</span>
          </div>
          <div className="mm-voice-room-grid">
            {voiceRooms.map((room) => (
              <button
                key={room.id}
                type="button"
                disabled={!connected}
                onClick={() =>
                  onJoinRoom({
                    id: room.id,
                    interest: room.topic || 'Voice room',
                    mode: 'group_text',
                    isAudioChannel: true,
                  })
                }
                className="mm-voice-room-card"
              >
                <div className="mm-voice-room-card__top">
                  <span className="mm-voice-room-card__title">{room.topic || 'Voice room'}</span>
                  {room.hasActiveGame && <span className="mm-voice-room-card__race">🏁 Race</span>}
                </div>
                <div className="mm-voice-room-card__meta">
                  <span>🎙 {room.speakerCount ?? 0}/{room.maxSpeakers || 6}</span>
                  <span>👥 {room.memberCount ?? 0}</span>
                </div>
                <span className="mm-voice-room-card__cta">Join voice →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {videoRooms.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300/80 mb-2">Group video</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {videoRooms.map((room) => (
              <button
                key={room.id}
                type="button"
                disabled={!connected}
                onClick={() => onJoinRoom(room)}
                className="text-left rounded-xl border border-white/10 bg-[#161a22] p-4 hover:border-white/25 disabled:opacity-50 min-h-[72px]"
              >
                <div className="text-sm font-medium text-white capitalize">{room.interest || 'general'}</div>
                <div className="text-xs text-white/50 mt-1">
                  Group Video · {room.participantCount}/{room.maxSize} people
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
