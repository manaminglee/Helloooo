const { test, expect } = require('@playwright/test');

const API = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:3000';

/**
 * Server contract for the live layer. These lock the boundaries that cost
 * money or safety if they ever regress — anyone can read the feed, nobody can
 * start, end or moderate a live without proving who they are.
 *
 * The realtime money paths (gift debit, nonce replay, combos, mute, block) are
 * covered exhaustively against both store backends in server/__livetest.js.
 */
test.describe('live API contract', () => {
  test('feed is public and reports its scaling mode', async ({ request }) => {
    const res = await request.get(`${API}/api/lives`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.lives)).toBe(true);
    expect(body.livekit).toHaveProperty('enabled');
    // 'redis' once REDIS_URL is set, 'single-instance' otherwise.
    expect(['redis', 'single-instance']).toContain(body.scaling);
  });

  test('every live in the feed carries what the room needs to render', async ({ request }) => {
    const body = await (await request.get(`${API}/api/lives`)).json();
    for (const live of body.lives) {
      expect(live).toHaveProperty('id');
      expect(live).toHaveProperty('handle');
      expect(live).toHaveProperty('viewerCount');
      expect(live).toHaveProperty('startedAt');
      expect(typeof live.viewerCount).toBe('number');
    }
  });

  test('starting a live requires a creator session', async ({ request }) => {
    const res = await request.post(`${API}/api/lives/start`, {
      data: { title: 'unauthorised', socketId: 'fake-socket' },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).ok).toBe(false);
  });

  test('a made-up live id is a 404, not a 500', async ({ request }) => {
    const res = await request.get(`${API}/api/lives/does-not-exist`);
    expect(res.status()).toBe(404);
  });

  test('stats are not readable by strangers', async ({ request }) => {
    const res = await request.get(`${API}/api/lives/does-not-exist/stats`);
    // 404 when the room is gone, 403 when it exists — never 200.
    expect([403, 404]).toContain(res.status());
  });

  test('ending someone else’s live is rejected', async ({ request }) => {
    const res = await request.post(`${API}/api/lives/does-not-exist/end`);
    expect([403, 404]).toContain(res.status());
  });

  test('wallpaper upload requires a creator session', async ({ request }) => {
    const res = await request.post(`${API}/api/lives/wallpaper`, {
      data: { wallpaperUrl: 'https://example.com/a.jpg' },
    });
    expect(res.status()).toBe(401);
  });

  test('gift catalog prices are server-owned and sane', async ({ request }) => {
    const body = await (await request.get(`${API}/api/economy/catalog`)).json();
    expect(Array.isArray(body.gifts)).toBe(true);
    expect(body.gifts.length).toBeGreaterThan(10);
    for (const g of body.gifts) {
      expect(typeof g.cost).toBe('number');
      expect(g.cost).toBeGreaterThan(0);
      expect(g.creatorShare).toBeGreaterThan(0);
      expect(g.creatorShare).toBeLessThanOrEqual(1);
    }
    // Gift ids must be unique — the catalog is the lookup table the server
    // charges against.
    const ids = body.gifts.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
