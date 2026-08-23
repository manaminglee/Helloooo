/**
 * LiveKit SFU gateway — Helloooo Node handles auth/rooms; LiveKit carries media.
 *
 * Env:
 *   LIVEKIT_URL          wss://xxx.livekit.cloud  (or self-hosted)
 *   LIVEKIT_API_KEY
 *   LIVEKIT_API_SECRET
 *   LIVEKIT_ROOM_PREFIX  optional (default helloooo)
 */
let AccessToken = null;
try {
  ({ AccessToken } = require('livekit-server-sdk'));
} catch {
  AccessToken = null;
}

function isConfigured() {
  return !!(
    AccessToken &&
    process.env.LIVEKIT_URL?.trim() &&
    process.env.LIVEKIT_API_KEY?.trim() &&
    process.env.LIVEKIT_API_SECRET?.trim()
  );
}

function publicUrl() {
  return (process.env.LIVEKIT_URL || '').trim();
}

function sfuRoomName(hellooooRoomId) {
  const prefix = (process.env.LIVEKIT_ROOM_PREFIX || 'helloooo').replace(/:$/, '');
  const safe = String(hellooooRoomId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 96);
  return `${prefix}_${safe || 'room'}`;
}

/**
 * Mint a short-lived LiveKit access token for a Helloooo group participant.
 * identity = socket.id so SFU participants map cleanly to Socket.IO peers.
 */
async function mintParticipantToken({
  socketId,
  roomId,
  nickname = 'Anonymous',
  country = '',
  isCreator = false,
  canPublish = true,
  canSubscribe = true,
  roomAdmin = false,
}) {
  if (!isConfigured()) {
    throw new Error('LiveKit is not configured on this server');
  }
  const identity = String(socketId);
  const room = sfuRoomName(roomId);
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY.trim(),
    process.env.LIVEKIT_API_SECRET.trim(),
    {
      identity,
      name: String(nickname || 'Anonymous').slice(0, 64),
      metadata: JSON.stringify({
        hellooooRoomId: roomId,
        nickname: String(nickname || 'Anonymous').slice(0, 64),
        country: String(country || '').slice(0, 8),
        isCreator: !!isCreator,
      }),
      ttl: '2h',
    }
  );
  at.addGrant({
    roomJoin: true,
    room,
    canPublish,
    canSubscribe,
    canPublishData: true,
    roomAdmin: !!roomAdmin,
  });
  const token = await at.toJwt();
  return {
    token,
    url: publicUrl(),
    roomName: room,
    identity,
  };
}

function statusPayload() {
  return {
    enabled: isConfigured(),
    url: isConfigured() ? publicUrl() : null,
    provider: 'livekit',
  };
}

module.exports = {
  isConfigured,
  publicUrl,
  sfuRoomName,
  mintParticipantToken,
  statusPayload,
};
