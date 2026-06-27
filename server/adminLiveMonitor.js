/**
 * In-memory live video frame store for admin moderation (JPEG snapshots from clients).
 */

const adminLivePanels = new Map(); // socketId -> { frame, roomId, panelKey, updatedAt }
const frameRateLimit = new Map(); // socketId -> lastEmitMs
const FRAME_MIN_INTERVAL_MS = 2500;
const FRAME_MAX_BYTES = 120000;
const FRAME_STALE_MS = 15000;

function isVideoRoomMode(mode) {
  return mode === 'video' || mode === 'group_video';
}

function ingestMonitorFrame(socketId, payload, users, rooms) {
  const { roomId, frame, panelKey } = payload || {};
  if (!roomId || typeof frame !== 'string') return { ok: false, reason: 'invalid_payload' };
  if (!frame.startsWith('data:image/jpeg') || frame.length > FRAME_MAX_BYTES) {
    return { ok: false, reason: 'invalid_frame' };
  }

  const user = users.get(socketId);
  if (!user?.rooms?.has(roomId)) return { ok: false, reason: 'not_in_room' };

  const room = rooms.get(roomId);
  if (!room || !isVideoRoomMode(room.mode)) return { ok: false, reason: 'not_video_room' };

  const now = Date.now();
  const last = frameRateLimit.get(socketId) || 0;
  if (now - last < FRAME_MIN_INTERVAL_MS) return { ok: false, reason: 'rate_limited' };
  frameRateLimit.set(socketId, now);

  adminLivePanels.set(socketId, {
    frame,
    roomId,
    panelKey: panelKey || 'local',
    updatedAt: now,
  });

  return { ok: true };
}

function clearMonitorPanel(socketId) {
  adminLivePanels.delete(socketId);
  frameRateLimit.delete(socketId);
}

function buildLivePanelsSnapshot(users, rooms) {
  const now = Date.now();
  const videoRooms = Array.from(rooms.values()).filter((r) => isVideoRoomMode(r.mode) && r.users.size > 0);

  const roomsOut = videoRooms.map((room) => {
    const panels = (room.participants || []).map((p) => {
      const u = users.get(p.socketId);
      const stored = adminLivePanels.get(p.socketId);
      const updatedAt = stored?.updatedAt || 0;
      const inRoom = stored?.roomId === room.id;
      return {
        socketId: p.socketId,
        nickname: p.nickname,
        country: p.country,
        isCreator: !!p.isCreator,
        ip: u?.ip || null,
        frame: inRoom && now - updatedAt < FRAME_STALE_MS ? stored.frame : null,
        updatedAt: inRoom ? updatedAt : 0,
        stale: !inRoom || now - updatedAt >= FRAME_STALE_MS,
        panelKey: stored?.panelKey || 'local',
      };
    });

    return {
      id: room.id,
      interest: room.interest,
      mode: room.mode,
      sessionType: room.maxSize <= 2 && (room.mode === 'video' || room.mode === 'text') ? '1:1' : 'group',
      participantCount: room.users.size,
      maxSize: room.maxSize,
      createdAt: room.createdAt,
      panels,
      messages: room.messages?.slice(-8) || [],
      participants: panels,
    };
  });

  return { rooms: roomsOut, updatedAt: now };
}

module.exports = {
  ingestMonitorFrame,
  clearMonitorPanel,
  buildLivePanelsSnapshot,
  isVideoRoomMode,
};
