/**
 * Creator-only YouTube RTMP relay — pipes WebM chunks from the browser to YouTube Live.
 * Requires ffmpeg on the server (Render/Nixpacks: install ffmpeg package).
 */
const { spawn, execFileSync } = require('child_process');

const sessions = new Map();
let ffmpegOk = null;

function isFfmpegAvailable() {
  if (ffmpegOk !== null) return ffmpegOk;
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    ffmpegOk = true;
  } catch {
    ffmpegOk = false;
  }
  return ffmpegOk;
}

/** Accept raw key or a full rtmp(s)://…/live2/KEY paste from YouTube Studio. */
function normalizeStreamKey(raw) {
  let s = String(raw || '').trim().replace(/^["']+|["']+$/g, '');
  if (!s) return '';

  const urlMatch = s.match(/rtmps?:\/\/[^\s/]+\/(?:live2?|live)\/([a-zA-Z0-9_-]+)/i);
  if (urlMatch) return urlMatch[1];

  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const keyLine = lines.find((l) => !/^rtmps?:\/\//i.test(l) && /^[a-zA-Z0-9_-]{8,}$/.test(l));
    if (keyLine) return keyLine;
  }

  // Strip accidental "live2/" prefix without host
  s = s.replace(/^(?:live2?|live)\//i, '');
  // If they pasted URL without capturing above, take last path segment
  if (/^rtmps?:\/\//i.test(s)) {
    const parts = s.split('/');
    s = parts[parts.length - 1] || '';
  }
  return s.trim();
}

function validateStreamKey(raw) {
  const key = normalizeStreamKey(raw);
  // Classic YT keys are ~24 chars (xxxx-xxxx-xxxx-xxxx-xxxx); allow longer custom keys.
  if (key.length < 8 || key.length > 128) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) return null;
  return key;
}

function startSession(socketId, streamKey) {
  if (!isFfmpegAvailable()) {
    throw new Error('Live streaming is not available on this server (ffmpeg missing). Redeploy after enabling ffmpeg, or use Record and upload manually.');
  }
  stopSession(socketId);

  const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;
  const ff = spawn(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'warning',
      '-fflags', '+genpts',
      '-f', 'webm', '-i', 'pipe:0',
      '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
      '-maxrate', '2500k', '-bufsize', '5000k', '-pix_fmt', 'yuv420p', '-g', '48',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
      '-f', 'flv', rtmpUrl,
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  );

  const session = { ff, bytes: 0, startedAt: Date.now() };
  sessions.set(socketId, session);

  let errBuf = '';
  ff.stderr?.on('data', (chunk) => {
    errBuf += chunk.toString();
    if (errBuf.length > 2000) errBuf = errBuf.slice(-1500);
  });

  ff.on('error', () => {
    sessions.delete(socketId);
  });
  ff.on('exit', (code) => {
    sessions.delete(socketId);
    if (code && code !== 0) {
      console.warn('[youtube-live] ffmpeg exit', code, errBuf.slice(-400));
    }
  });
  ff.stdin.on('error', () => {
    /* client disconnected */
  });

  return session;
}

function writeChunk(socketId, chunk) {
  const session = sessions.get(socketId);
  if (!session?.ff?.stdin?.writable) return false;
  const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  if (!buf.length) return false;
  session.bytes += buf.length;
  session.ff.stdin.write(buf);
  return true;
}

function stopSession(socketId) {
  const session = sessions.get(socketId);
  if (!session) return;
  try {
    if (session.ff.stdin?.writable) session.ff.stdin.end();
  } catch { /* ignore */ }
  try {
    session.ff.kill('SIGTERM');
  } catch { /* ignore */ }
  sessions.delete(socketId);
}

function stopAllForSocket(socketId) {
  stopSession(socketId);
}

function emitLiveError(socket, message) {
  socket.emit('youtube-live-error', { message });
  socket.emit('error', { message });
}

function registerYoutubeLiveHandlers(socket, on, { users }) {
  on('youtube-live-start', (data) => {
    const u = users.get(socket.id);
    if (!u?.isCreator) {
      return emitLiveError(socket, 'YouTube Live is for verified creators only.');
    }
    const key = validateStreamKey(data?.streamKey);
    if (!key) {
      return emitLiveError(
        socket,
        'Invalid YouTube stream key. Paste the key only (xxxx-xxxx-…) or the full rtmp://…/live2/KEY from YouTube Studio → Go live → Stream.',
      );
    }
    try {
      startSession(socket.id, key);
      socket.emit('youtube-live-started');
      const roomId = String(data?.roomId || '');
      if (roomId) {
        socket.to(roomId).emit('creator-live-status', { live: true, socketId: socket.id });
      }
    } catch (err) {
      emitLiveError(socket, err.message || 'Could not start live stream.');
    }
  });

  on('youtube-live-chunk', (chunk) => {
    const u = users.get(socket.id);
    if (!u?.isCreator) return;
    if (!sessions.has(socket.id)) return;
    writeChunk(socket.id, chunk);
  });

  on('youtube-live-stop', (data) => {
    const u = users.get(socket.id);
    if (!u?.isCreator) return;
    stopSession(socket.id);
    socket.emit('youtube-live-stopped');
    const roomId = String(data?.roomId || '');
    if (roomId) {
      socket.to(roomId).emit('creator-live-status', { live: false, socketId: socket.id });
    }
  });
}

module.exports = {
  registerYoutubeLiveHandlers,
  stopAllForSocket,
  isFfmpegAvailable,
  normalizeStreamKey,
  validateStreamKey,
};
