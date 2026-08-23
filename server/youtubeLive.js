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

function validateStreamKey(raw) {
  const key = String(raw || '').trim();
  if (key.length < 10 || key.length > 64) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) return null;
  return key;
}

function startSession(socketId, streamKey) {
  if (!isFfmpegAvailable()) {
    throw new Error('Live streaming is not available on this server (ffmpeg missing). Use Record and upload manually.');
  }
  stopSession(socketId);

  const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;
  const ff = spawn(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'error',
      '-fflags', '+genpts',
      '-f', 'webm', '-i', 'pipe:0',
      '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
      '-maxrate', '2500k', '-bufsize', '5000k', '-pix_fmt', 'yuv420p', '-g', '48',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
      '-f', 'flv', rtmpUrl,
    ],
    { stdio: ['pipe', 'ignore', 'ignore'] },
  );

  const session = { ff, bytes: 0, startedAt: Date.now() };
  sessions.set(socketId, session);

  ff.on('error', () => {
    sessions.delete(socketId);
  });
  ff.on('exit', () => {
    sessions.delete(socketId);
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

function registerYoutubeLiveHandlers(socket, on, { users }) {
  on('youtube-live-start', (data) => {
    const u = users.get(socket.id);
    if (!u?.isCreator) {
      return socket.emit('error', { message: 'YouTube Live is for verified creators only.' });
    }
    const key = validateStreamKey(data?.streamKey);
    if (!key) {
      return socket.emit('error', { message: 'Invalid YouTube stream key.' });
    }
    try {
      startSession(socket.id, key);
      socket.emit('youtube-live-started');
      const roomId = String(data?.roomId || '');
      if (roomId) {
        socket.to(roomId).emit('creator-live-status', { live: true, socketId: socket.id });
      }
    } catch (err) {
      socket.emit('error', { message: err.message || 'Could not start live stream.' });
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
};
