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
let RoomServiceClient = null;
try {
  ({ AccessToken, RoomServiceClient } = require('livekit-server-sdk'));
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
  canPublishData = true,
  roomAdmin = false,
  identitySuffix = '',
  ttl = '2h',
  anonymous = false,
  canPublishSources,
}) {
  if (!isConfigured()) {
    throw new Error('LiveKit is not configured on this server');
  }
  // A suffix keeps a second connection (e.g. watching an HP opponent's room)
  // from evicting that person's real participant session in the same room.
  const identity = `${socketId}${identitySuffix || ''}`;
  const room = sfuRoomName(roomId);
  const displayName = anonymous ? 'Anonymous' : String(nickname || 'Anonymous').slice(0, 64);
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY.trim(),
    process.env.LIVEKIT_API_SECRET.trim(),
    {
      identity,
      name: displayName,
      metadata: JSON.stringify({
        hellooooRoomId: roomId,
        nickname: displayName,
        country: anonymous ? '' : String(country || '').slice(0, 8),
        isCreator: anonymous ? false : !!isCreator,
      }),
      ttl,
    }
  );
  at.addGrant({
    roomJoin: true,
    room,
    canPublish,
    canSubscribe,
    canPublishData: !!canPublishData,
    roomAdmin: !!roomAdmin,
    ...(canPublishSources ? { canPublishSources } : {}),
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

function serviceClient() {
  return new RoomServiceClient(publicUrl().replace(/^ws/, 'http'), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
}
async function removeParticipant(roomId, identity) {
  if (!isConfigured()) return;
  return serviceClient().removeParticipant(sfuRoomName(roomId), identity);
}
async function setAudioPermission(roomId, identity, canPublish) {
  if (!isConfigured()) return;
  return serviceClient().updateParticipant(sfuRoomName(roomId), identity, {
    permission: { canSubscribe: true, canPublish, canPublishData: true, canPublishSources: [2] },
  });
}
function canPublishAudio(member) {
  return !!member && ['speaker', 'moderator', 'host'].includes(member.role) && !member.forceMuted;
}

module.exports = {
  isConfigured,
  publicUrl,
  sfuRoomName,
  mintParticipantToken,
  statusPayload,
  removeParticipant,
  setAudioPermission,
  canPublishAudio,
};
