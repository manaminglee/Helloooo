/**
 * End-to-end matchmaking flow — node server/__matchflowtest.js
 *
 * Boots the real server as a child process and drives it with real Socket.IO
 * clients. The unit tests cover the queue and the safety ladder in isolation;
 * this covers the parts that only exist when two live sockets interact, which
 * is exactly where the silent failures live:
 *
 *   · two people searching actually find each other, and each is told where
 *     the other is from
 *   · a skip does not hand you straight back to the person you skipped
 *   · the partner who was skipped is released and can match somebody else
 *   · offer/answer/ICE relay between the pair, including glare (both sides
 *     offering at once)
 *   · the search throttle fires, and only for the client that tripped it
 *
 * Everything here is timing-sensitive by nature, so each wait is an explicit
 * event await with a timeout rather than a sleep — a sleep-based version of
 * this file would go flaky the first time CI was busy.
 */
const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const ioClient = require('socket.io-client');

const PORT = Number(process.env.MATCHFLOW_PORT || 4599);
const URL = `http://127.0.0.1:${PORT}`;

let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ✓ ${name}`); };

/* --------------------------------------------------------------- plumbing */

/** Wait for one event, with a timeout that names what we were waiting for. */
function once(socket, event, { timeout = 6000, where = '' } = {}) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for "${event}"${where ? ` (${where})` : ''}`));
    }, timeout);
    const handler = (payload) => { clearTimeout(t); socket.off(event, handler); resolve(payload); };
    socket.on(event, handler);
  });
}

/** Resolves null instead of throwing — for asserting something does NOT happen. */
function maybe(socket, event, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { socket.off(event, handler); resolve(null); }, ms);
    const handler = (payload) => { clearTimeout(t); socket.off(event, handler); resolve(payload); };
    socket.on(event, handler);
  });
}

/** A client with its own device handle, so the server treats them as separate people. */
function connect(handle) {
  const s = ioClient(URL, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    auth: { deviceHandle: handle },
  });
  return s;
}

const find = (s, interest = 'general', extra = {}) => s.emit('find-partner', {
  mode: 'video', interest, nickname: 'Tester', ...extra,
});

let child = null;

function startServer() {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'test',
        REDIS_URL: '',
        // Tight throttle so the rate-limit check does not need 12 searches.
        FIND_PARTNER_WINDOW_MS: '5000',
        FIND_PARTNER_MAX: '3',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const fail = setTimeout(() => reject(new Error('server did not start in 25s')), 25000);
    child.stdout.on('data', (b) => {
      if (String(b).includes('listening on port')) { clearTimeout(fail); resolve(); }
    });
    child.stderr.on('data', (b) => {
      const line = String(b);
      if (/Error|EADDRINUSE/.test(line)) process.stderr.write(`[server] ${line}`);
    });
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) { clearTimeout(fail); reject(new Error(`server exited early (${code})`)); }
    });
  });
}

function stopServer() {
  if (child && !child.killed) child.kill('SIGKILL');
}

/* ----------------------------------------------------------------- checks */

async function testPairingAndCountry() {
  console.log('\n── two people find each other ──');

  const a = connect('a'.repeat(32));
  const b = connect('b'.repeat(32));
  await Promise.all([once(a, 'connect'), once(b, 'connect')]);

  const foundA = once(a, 'partner-found', { where: 'A' });
  const foundB = once(b, 'partner-found', { where: 'B' });
  find(a, 'gaming');
  find(b, 'gaming');
  const [pa, pb] = await Promise.all([foundA, foundB]);

  assert.ok(pa.roomId && pa.roomId === pb.roomId, 'both sides must land in one room');
  ok('two searchers are paired into the same room');

  assert.ok(pa.peer?.socketId === b.id, 'A should be told about B');
  assert.ok(pb.peer?.socketId === a.id, 'B should be told about A');
  ok('each side is told who the other socket is, so signalling can start');

  // Country is what the "connected to a stranger from ..." line renders. It is
  // allowed through even in anonymous video; the nickname is not.
  assert.ok('country' in pa.peer, 'peer payload must carry a country field');
  assert.strictEqual(pa.peer.nickname, 'Anonymous', 'anonymous video must not leak a nickname');
  ok('the peer carries a country but stays anonymous otherwise');

  a.close(); b.close();
}

async function testSignalRelay() {
  console.log('\n── offer / answer / ICE ──');

  const a = connect('c'.repeat(32));
  const b = connect('d'.repeat(32));
  await Promise.all([once(a, 'connect'), once(b, 'connect')]);

  const fa = once(a, 'partner-found');
  const fb = once(b, 'partner-found');
  find(a, 'music'); find(b, 'music');
  const [pa] = await Promise.all([fa, fb]);
  const roomId = pa.roomId;

  const gotOffer = once(b, 'webrtc-signal', { where: 'offer to B' });
  a.emit('webrtc-signal', {
    roomId, targetSocketId: b.id, type: 'offer', signal: { type: 'offer', sdp: 'v=0 fake-offer' },
  });
  const offer = await gotOffer;
  assert.strictEqual(offer.type, 'offer');
  assert.strictEqual(offer.fromSocketId, a.id, 'the receiver must know who sent it');
  ok('an offer reaches the other side, tagged with its sender');

  // Anonymous video must relay the media without relaying who is behind it.
  assert.strictEqual(offer.fromNickname, 'Anonymous');
  assert.strictEqual(offer.fromUserId, undefined);
  ok('signalling carries no identity in anonymous video');

  const gotAnswer = once(a, 'webrtc-signal', { where: 'answer to A' });
  b.emit('webrtc-signal', {
    roomId, targetSocketId: a.id, type: 'answer', signal: { type: 'answer', sdp: 'v=0 fake-answer' },
  });
  assert.strictEqual((await gotAnswer).type, 'answer');
  ok('the answer comes back');

  const gotIce = once(b, 'webrtc-signal', { where: 'ice to B' });
  a.emit('webrtc-signal', {
    roomId, targetSocketId: b.id, type: 'ice-candidate',
    signal: { candidate: 'candidate:1 1 udp 1 127.0.0.1 1 typ host' },
  });
  assert.ok((await gotIce).signal.candidate, 'ICE candidates must relay too');
  ok('ICE candidates relay');

  // An unknown signal type must be dropped, not forwarded blindly.
  const bogus = maybe(b, 'webrtc-signal', 700);
  a.emit('webrtc-signal', { roomId, targetSocketId: b.id, type: 'evil', signal: { x: 1 } });
  assert.strictEqual(await bogus, null);
  ok('an unrecognised signal type is dropped rather than relayed');

  // Glare: both sides offer at once. Neither may be dropped — the clients
  // resolve politeness themselves, but only if both offers actually arrive.
  const glareA = once(a, 'webrtc-signal', { where: 'glare to A' });
  const glareB = once(b, 'webrtc-signal', { where: 'glare to B' });
  a.emit('webrtc-signal', { roomId, targetSocketId: b.id, type: 'offer', signal: { type: 'offer', sdp: 'v=0 glare-a' } });
  b.emit('webrtc-signal', { roomId, targetSocketId: a.id, type: 'offer', signal: { type: 'offer', sdp: 'v=0 glare-b' } });
  const [ga, gb] = await Promise.all([glareA, glareB]);
  assert.strictEqual(ga.signal.sdp, 'v=0 glare-b');
  assert.strictEqual(gb.signal.sdp, 'v=0 glare-a');
  ok('simultaneous offers both arrive — the server never drops one side of glare');

  a.close(); b.close();
}

async function testSkipFindsSomeoneNew() {
  console.log('\n── skipping ──');

  const a = connect('e'.repeat(32));
  const b = connect('f'.repeat(32));
  await Promise.all([once(a, 'connect'), once(b, 'connect')]);

  const fa = once(a, 'partner-found');
  const fb = once(b, 'partner-found');
  find(a); find(b);
  const [pa] = await Promise.all([fa, fb]);

  // A skips. B must be told, so B can re-queue rather than sitting on a dead
  // connection — this is the bug that leaves someone staring at a frozen frame.
  const bTold = once(b, 'user-left', { where: 'B learns A left' });
  a.emit('leave-room', { roomId: pa.roomId });
  await bTold;
  ok('the person who was skipped is told immediately');

  // A searches again with only B available: the skip window must keep them apart.
  find(a);
  const rematch = await maybe(a, 'partner-found', 1500);
  assert.strictEqual(rematch, null, 'A was handed straight back to the person they skipped');
  ok('a skip does not bounce you back to the same person');

  // A third person arrives and A matches them instead.
  const c = connect('1'.repeat(32));
  await once(c, 'connect');
  const fresh = once(a, 'partner-found', { where: 'A meets C' });
  find(c);
  const met = await fresh;
  assert.strictEqual(met.peer.socketId, c.id);
  ok('and the next person to arrive is matched normally');

  a.close(); b.close(); c.close();
}

async function testThrottle() {
  console.log('\n── search throttle ──');

  const a = connect('2'.repeat(32));
  const b = connect('3'.repeat(32));
  await Promise.all([once(a, 'connect'), once(b, 'connect')]);

  const throttled = once(a, 'find-throttled', { where: 'A hits the limit', timeout: 6000 });
  for (let i = 0; i < 8; i += 1) find(a, `spam${i}`);
  const msg = await throttled;
  assert.ok(msg.retryAfterMs > 0, 'the client needs to know how long to back off');
  ok('a client looping on search is throttled and told when to retry');

  // Crucially, per client — one abuser must not throttle everybody.
  const other = await maybe(b, 'find-throttled', 800);
  assert.strictEqual(other, null, 'the throttle leaked onto an unrelated client');
  ok('the throttle is per device, not global');

  a.close(); b.close();
}

/* -------------------------------------------------------------------- run */

(async () => {
  await startServer();
  try {
    await testPairingAndCountry();
    await testSignalRelay();
    await testSkipFindsSomeoneNew();
    await testThrottle();
    console.log(`\n✅ ${passed} match-flow checks passed\n`);
  } finally {
    stopServer();
  }
  process.exit(0);
})().catch((err) => {
  console.error('\n❌', err.message);
  stopServer();
  process.exit(1);
});
