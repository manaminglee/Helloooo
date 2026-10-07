const { test, expect } = require('@playwright/test');
const creatorToken = 'cs_rooms_test_creator_session_only';
test.skip(process.env.HELLOOOO_ROOM_TESTS !== '1', 'Requires disposable room fixtures and local LiveKit');

async function boot(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('wc_age', '1'); sessionStorage.setItem('wc_bot', '1'); sessionStorage.setItem('mm_community_policy_video', '1');
  });
  await page.goto('/');
}

async function socketClient(page, creator = false) {
  await boot(page);
  return page.evaluate(async ({ creator, creatorToken }) => {
    const socketModule = await import('/node_modules/.vite/deps/socket__io-client.js');
    const io = socketModule.io || socketModule.default.io;
    const socket = io('http://127.0.0.1:3000', { transports: ['websocket'], forceNew: true });
    window.roomSocket = socket;
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('socket initialization timeout')), 10000); socket.once('connected', data => { clearTimeout(timer); resolve(data); }); });
    if (creator) {
      localStorage.setItem('mm_creator_session', creatorToken);
      const result = await new Promise(resolve => socket.emit('creator:auth', { creatorToken }, resolve));
      if (!result.ok) throw new Error(JSON.stringify(result));
    }
    return socket.id;
  }, { creator, creatorToken });
}

async function mountLive(page, live, mode) {
  await page.evaluate(async ({ live, mode }) => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const dom = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { default: LiveRoom } = await import('/src/components/lives/LiveRoom.jsx');
    await import('/src/styles/live.css');
    const host = document.createElement('div'); host.id = 'room-test'; host.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000'; document.body.appendChild(host);
    window.roomRoot = (dom.createRoot || dom.default.createRoot)(host);
    window.roomRoot.render(React.createElement(LiveRoom, { socket: window.roomSocket, live, mode, onExit() {}, onEndLive() {}, identityHook: { identity: null, refresh() {} } }));
  }, { live, mode });
}

async function identify(page, username) {
  return page.evaluate(async username => {
    const action = username === 'livegiftguest' ? 'login' : 'register';
    const result = await (await fetch(`http://127.0.0.1:3000/api/audio-identity/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, pin: '7392' }) })).json();
    if (!result.ok) throw new Error(JSON.stringify(result));
    window.audioTestToken = result.token;
    window.audioTestIdentity = result.identity;
    const attached = await new Promise(resolve => window.roomSocket.emit('audio-identity:attach', { token: result.token }, resolve));
    if (!attached.ok) throw new Error(JSON.stringify(attached));
    return result.identity;
  }, username);
}

async function mountAudio(page) {
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const dom = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { useAudioChannel } = await import('/src/hooks/useAudioChannel.js');
    const host = document.createElement('div'); host.id = 'audio-probe'; document.body.appendChild(host);
    function Probe() {
      const audio = useAudioChannel(window.roomSocket, [], window.audioTestIdentity.username);
      window.audioProbe = audio;
      return React.createElement('pre', null, JSON.stringify({ channel: audio.channel?.channelId, error: audio.error, members: audio.members.length, sfu: audio.livekitConnected }));
    }
    (dom.createRoot || dom.default.createRoot)(host).render(React.createElement(Probe));
  });
  await expect.poll(() => page.evaluate(() => !!window.audioProbe)).toBe(true);
}

test('audio room carries microphone audio and enforces listener permissions', async ({ page, browser }) => {
  const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
  try {
    const listener = await context.newPage();
    await socketClient(page); await socketClient(listener);
    await identify(page, 'audiohost'); await identify(listener, 'audioguest');
    await mountAudio(page); await mountAudio(listener);
    await page.evaluate(() => window.audioProbe.create('Audio integration', false));
    await expect.poll(() => page.evaluate(() => window.audioProbe.channel?.channelId)).toBeTruthy();
    const channelId = await page.evaluate(() => window.audioProbe.channel.channelId);
    await listener.evaluate(id => window.audioProbe.join(id), channelId);
    await expect.poll(() => page.evaluate(() => window.audioProbe.members.length)).toBe(2);
    const sfu = process.env.LIVEKIT_AUDIO_THRESHOLD !== '100';
    if (sfu) {
      for (const p of [page, listener]) await expect.poll(() => p.evaluate(() => window.audioProbe.livekitConnected), { timeout: 15000 }).toBe(true);
      const grant = await listener.evaluate(id => new Promise(resolve => {
        window.roomSocket.once('livekit-token', token => resolve(JSON.parse(atob(token.token.split('.')[1]))));
        window.roomSocket.emit('livekit-token', { roomId: id, kind: 'audio' });
      }), channelId);
      expect(grant.video.canPublish).toBe(false);
      expect(grant.video.canPublishSources).toEqual(['microphone']);
    }
    await page.evaluate(() => window.audioProbe.toggleMic());
    const audible = p => p.locator('audio').evaluateAll(els => els.some(el => !el.paused && el.srcObject?.getAudioTracks().some(t => t.readyState === 'live' && !t.muted)));
    await expect.poll(() => audible(listener), { timeout: 15000 }).toBe(true);
    const listenerId = await listener.evaluate(() => window.roomSocket.id);
    await page.evaluate(({ channelId, listenerId }) => window.roomSocket.emit('audio:grant-speak', { channelId, targetSocketId: listenerId, grant: true }), { channelId, listenerId });
    await expect.poll(() => listener.evaluate(() => window.audioProbe.members.find(m => m.socketId === window.roomSocket.id)?.role)).toBe('speaker');
    await listener.evaluate(() => window.audioProbe.toggleMic());
    await expect.poll(() => audible(page), { timeout: 15000 }).toBe(true);
    await page.evaluate(({ channelId, listenerId }) => window.roomSocket.emit('audio:moderate', { channelId, targetSocketId: listenerId, action: 'mute' }), { channelId, listenerId });
    await expect.poll(() => listener.evaluate(() => window.audioProbe.members.find(m => m.socketId === window.roomSocket.id)?.forceMuted)).toBe(true);
    if (sfu) {
      const grant = await listener.evaluate(id => new Promise(resolve => {
        window.roomSocket.once('livekit-token', token => resolve(JSON.parse(atob(token.token.split('.')[1]))));
        window.roomSocket.emit('livekit-token', { roomId: id, kind: 'audio' });
      }), channelId);
      expect(grant.video.canPublish).toBe(false);
    }
    await listener.evaluate(() => window.audioProbe.leave());
    await expect.poll(() => page.evaluate(() => window.audioProbe.members.length)).toBe(1);
    await page.evaluate(() => { window.audioProbe.setEntryFee(5); window.audioProbe.setRoomLock('8391'); });
    await expect.poll(() => page.evaluate(() => window.audioProbe.channel.entryFee)).toBe(5);
    const getBalance = p => p.evaluate(async () => (await (await fetch('http://127.0.0.1:3000/api/audio-identity/me', { headers: { 'x-audio-session': window.audioTestToken } })).json()).identity.coins);
    const guestBefore = await getBalance(listener);
    const hostBefore = await getBalance(page);
    await listener.evaluate(id => window.audioProbe.join(id, undefined, '0000'), channelId);
    await expect.poll(() => listener.evaluate(() => !!window.audioProbe.lockRequired)).toBe(true);
    expect(await getBalance(listener)).toBe(guestBefore);
    await listener.evaluate(id => window.audioProbe.join(id, undefined, '8391'), channelId);
    await expect.poll(() => page.evaluate(() => window.audioProbe.members.length)).toBe(2);
    await expect.poll(() => getBalance(listener)).toBe(guestBefore - 5);
    await expect.poll(() => getBalance(page)).toBe(hostBefore + 4);
  } finally { await context.close(); }
});

test('host broadcasts actual video and audio to a live viewer', async ({ page, browser, request }) => {
  const viewerContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  try {
    const viewer = await viewerContext.newPage();
    const hostSocket = await socketClient(page, true);
    const viewerSocket = await socketClient(viewer);
    const identity = await identify(viewer, 'livegiftguest');
    const stolenSocketStart = await request.post('http://127.0.0.1:3000/api/lives/start', { headers: { 'x-creator-session': creatorToken }, data: { socketId: viewerSocket, title: 'Wrong socket' } });
    expect(stolenSocketStart.status()).toBe(403);
    const result = await request.post('http://127.0.0.1:3000/api/lives/start', { headers: { 'x-creator-session': creatorToken }, data: { socketId: hostSocket, title: 'Local broadcast test' } });
    const data = await result.json();
    expect(data.ok, JSON.stringify(data)).toBe(true);
    await mountLive(page, data.live, 'host');
    await mountLive(viewer, data.live, 'viewer');
    await expect.poll(() => viewer.locator('#room-test video').evaluateAll(v => v.some(el => el.videoWidth > 0 && !el.paused)), { timeout: 35000 }).toBe(true);
    await expect.poll(() => viewer.locator('audio').evaluateAll(v => v.some(el => el.srcObject?.getAudioTracks().some(t => t.readyState === 'live') && !el.paused)), { timeout: 15000 }).toBe(true);
    const unauthorizedPublish = await viewer.evaluate(liveId => new Promise(resolve => window.roomSocket.emit('live:token', { liveId, asHost: true }, resolve)), data.live.id);
    expect(unauthorizedPublish.ok).toBe(false);
    const catalog = await (await request.get('http://127.0.0.1:3000/api/economy/catalog')).json();
    const gift = catalog.gifts.find(g => g.cost <= identity.coins);
    expect(gift).toBeTruthy();
    const sent = await viewer.evaluate(({ liveId, giftId }) => new Promise(resolve => window.roomSocket.emit('live:gift', { liveId, giftId, nonce: 'rooms-test-gift-1' }, resolve)), { liveId: data.live.id, giftId: gift.id });
    expect(sent.ok, JSON.stringify(sent)).toBe(true);
    expect(sent.balance).toBe(identity.coins - gift.cost);
    const replay = await viewer.evaluate(({ liveId, giftId }) => new Promise(resolve => window.roomSocket.emit('live:gift', { liveId, giftId, nonce: 'rooms-test-gift-1' }, resolve)), { liveId: data.live.id, giftId: gift.id });
    expect(replay.duplicate).toBe(true);
    const balance = await viewer.evaluate(async () => (await (await fetch('http://127.0.0.1:3000/api/audio-identity/me', { headers: { 'x-audio-session': window.audioTestToken } })).json()).identity.coins);
    expect(balance).toBe(sent.balance);
    await viewer.screenshot({ path: 'test-results/live-viewer.png' });
    const blocked = await page.evaluate(({ liveId, targetSocketId }) => new Promise(resolve => window.roomSocket.emit('live:block', { liveId, targetSocketId }, resolve)), { liveId: data.live.id, targetSocketId: viewerSocket });
    expect(blocked.ok).toBe(true);
    const denied = await viewer.evaluate(liveId => new Promise(resolve => window.roomSocket.emit('live:token', { liveId }, resolve)), data.live.id);
    expect(denied.ok).toBe(false);
    await request.post(`http://127.0.0.1:3000/api/lives/${data.live.id}/end`, { headers: { 'x-creator-session': creatorToken } });
  } finally { await viewerContext.close(); }
});

test('three group-video participants receive each others cameras', async ({ page, browser }) => {
  const contexts = [];
  try {
    const pages = [page];
    for (let i = 0; i < 2; i++) { const c = await browser.newContext({ permissions: ['camera', 'microphone'] }); contexts.push(c); pages.push(await c.newPage()); }
    for (const p of pages) {
      p.on('pageerror', e => console.log('group page error:', e.message));
      await boot(p);
      await p.getByRole('button', { name: 'Group Video: Up to 4 on camera' }).click();
      const start = p.getByRole('button', { name: 'Start camera & microphone' });
      if (await start.isVisible()) await start.click();
      await expect.poll(() => p.locator('video').evaluateAll(v => v.filter(el => el.videoWidth > 0 && !el.paused).length), { timeout: 15000 }).toBeGreaterThanOrEqual(1);
    }
    for (const p of pages) await expect.poll(() => p.locator('video:visible').evaluateAll(v => v.filter(el => el.videoWidth > 0 && !el.paused).length), { timeout: 35000 }).toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: 'test-results/group-video.png' });
  } finally { for (const c of contexts) await c.close(); }
});
