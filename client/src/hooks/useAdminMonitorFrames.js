import { useEffect } from 'react';

/**
 * Periodically captures local camera frames and sends them to the server for admin live monitoring.
 */
export function useAdminMonitorFrames(socket, { active, roomId, getRoomId, mode, localVideoRef }) {
  useEffect(() => {
    if (!active || !socket?.connected) return;
    if (mode !== 'video' && mode !== 'group_video') return;

    const resolveRoomId = () => {
      if (typeof getRoomId === 'function') return getRoomId();
      return roomId;
    };

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    let lastSent = 0;

    const tick = () => {
      const rid = resolveRoomId();
      if (!rid) return;

      const video = localVideoRef?.current;
      if (!video?.videoWidth || !video?.videoHeight) return;

      const now = Date.now();
      if (now - lastSent < 2500) return;

      try {
        const w = Math.min(320, video.videoWidth);
        const h = Math.min(240, video.videoHeight);
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const frame = canvas.toDataURL('image/jpeg', 0.45);
        if (frame.length > 120000) return;
        socket.emit('admin-monitor-frame', { roomId: rid, frame, panelKey: 'local' });
        lastSent = now;
      } catch {
        /* ignore canvas/security errors */
      }
    };

    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [socket, active, roomId, getRoomId, mode, localVideoRef]);
}
