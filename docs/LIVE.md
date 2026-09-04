# Live streaming

Mobile-first, portrait-only live rooms: full-screen video with transparent
comments, floating reactions, virtual gifts with combos, real-time presence,
moderation and creator earnings.

## Architecture

| Concern | Transport | Where |
|---|---|---|
| Video + audio | **LiveKit** SFU (host publishes, viewers subscribe) | `server/livekitRooms.js`, `client/src/hooks/useLiveKitLive.js` |
| Comments, reactions, gifts, presence, follows, moderation | **Socket.IO** room `live:<id>` | `server/liveStreams.js`, `client/src/hooks/useLiveRoom.js` |
| Room state | **Redis** (or memory on one instance) | `server/liveStore.js` |
| Coins & gift ledger | HTTP + server-side wallet | `server/liveStreams.js` → `audioIdentity.debit` |
| Analytics | Buffered writes to Supabase | `server/livePersistence.js` |
| Discovery | REST polling `/api/lives` | `client/src/hooks/useLiveStream.js` |

### Scaling

Room state lives in `server/liveStore.js`, which has two interchangeable
backends behind one async interface:

- **memory** — used automatically when no Redis is configured. Single instance.
- **redis** — used automatically when `REDIS_URL` is set (the same client
  `matchQueue.js` already binds for the Socket.IO adapter).

With Redis, any instance can serve any viewer of any room: the feed, presence,
moderation, combos, the top-gifter board and — critically — the gift nonce
registry are all shared. `GET /api/lives` reports which mode is active as
`scaling: "redis" | "single-instance"`.

Room keys carry a TTL that the **host's** instance refreshes on a 30s
heartbeat. If that instance dies, the keys expire and whichever instance wins
the sweep lock tells the room the live ended — no ghost rooms in the feed.

Writes are mirrored into the local memory backend while Redis is up, so a Redis
outage degrades each instance to serving the rooms it already knows about
rather than losing them outright.

Nothing in the room is simulated client-side. Every comment, like total, viewer
count and gift the UI renders came off the socket.

## Files

```
server/
  liveStreams.js       room lifecycle, gifts, combos, moderation, presence, sockets
  liveStore.js         room state — memory or Redis behind one async interface
  livePersistence.js   buffered analytics writers (comments, watch time, receipts)
  liveModeration.js    banned-word filter (leet/spacing aware), rate limiters
  __livetest.js        self-test:  npm run test:live
  __fakeredis.js       test-only node-redis stand-in (not used in production)
client/src/
  styles/live.css      the whole live UI layer (safe areas, overlays, animations)
  hooks/
    useLiveRoom.js         realtime room state + actions
    useLiveKitLive.js      media subscribe/publish + host mic/camera controls
    useFloatingReactions.js pooled, capped heart engine
    useLiveViewport.js     --live-vh / --kb from visualViewport, body lock
  components/lives/
    LiveRoom.jsx       the room (mode="viewer" | "host")
    LiveBits.jsx       comments, hearts, gift banners, sheets, states
    LiveGiftTray.jsx   gift bottom sheet
    LiveSheets.jsx     viewers, per-user actions, moderation, report, stats
    LiveViewer.jsx     swipe stack of lives
    LiveStudio.jsx     go-live setup → host room
supabase_migration_live_v2.sql
e2e/
  live-api.spec.js     server contract: who may start, end and moderate a live
  live-mobile.spec.js  layout contract on five device profiles
```

Run `psql < supabase_migration_live_v2.sql` (or paste it into the Supabase SQL
editor) before deploying. It is idempotent.

## Layout contract

`.live-root` is the viewport. The video is the background layer; every overlay
lives inside `.live-ui`, a three-row grid (header / middle / controls). The grid
is what guarantees nothing overlaps or gets pushed off screen:

- Safe areas are applied **once**, on `.live-ui`, via
  `max(env(safe-area-inset-*), fallback)`. No child positions itself with a raw
  pixel offset from a screen edge.
- The keyboard height is written to `--kb` from `visualViewport`, so the
  composer rises above the keyboard instead of the page resizing.
- `--live-vh` covers iOS versions without `dvh`.
- The comment column is capped at `min(38dvh, 320px)` and `74%` width, so it can
  never reach the bottom controls or the right rail.
- Floating hearts sit at `z-index: 1` — **behind** the controls.
- Long comments, handles and gift names wrap or ellipsis; nothing scrolls
  horizontally.

Short phones (`max-height: 700px` / `600px`) shrink the comment ceiling and the
rail first, so the header and controls keep full size.

## What writes where

| Table | Written by | When |
|---|---|---|
| `mm_live_streams` | `livePersistence.openStream` / `closeStream` | start, end |
| `mm_live_gift_tx` | `liveStreams.recordGiftTransaction` | **synchronously, per gift** |
| `mm_live_comments` | `livePersistence` | batched every 5s |
| `mm_live_viewers` | `livePersistence.recordWatch` | on leave, batched |
| `mm_live_reactions` | `livePersistence.recordReactions` | aggregate bucket every 15s |
| `mm_live_gift_receipts` | `livePersistence.closeStream` | one row per finished live |
| `mm_live_analytics` | `livePersistence.closeStream` | one row per finished live |
| `mm_live_moderators` | `livePersistence.recordModerator` | on promote/demote |
| `mm_live_reports` | `liveStreams` report handler | on report |

Everything except the gift ledger is buffered and best-effort: reporting data
must never add a database round-trip to a comment or a like. The gift ledger is
the exception and is written on the request path.

## Money path

`live:gift` is the only place coins move, and the order is fixed:

1. validate room and gift id against the server catalog
2. reject a replayed `nonce` (per sender, 2-minute window)
3. rate-limit (20 gifts / 10s per wallet)
4. **atomic debit** — the wallet lock lives in `audioIdentity`
5. append to the immutable ledger (`mm_live_gift_tx`)
6. credit the creator's share
7. broadcast to the room

The client's balance is never an input. `mm_live_gift_tx` has a database
trigger rejecting `UPDATE`/`DELETE`, and a unique index on
`(sender_key, nonce)` — a duplicated request cannot double-charge even if it
reaches a different process.

## Anti-spam

| Vector | Limit |
|---|---|
| Comments | 8 / 10s per wallet, plus optional slow mode (0–120s) |
| Gifts | 20 / 10s per wallet + nonce replay rejection |
| Likes | 60 / 5s per wallet, aggregated into one broadcast per 350ms |
| Joins | 25 / min per IP |
| Follows | 10 / min per IP |
| Reports | 5 / min per IP |
| Banned words | leet + spacing normalised, masked not dropped |

## Performance

- Incoming comments are buffered in a ref and flushed every 140ms — one render
  per batch, not per message. The stream is capped at 40 nodes.
- Likes never send one packet per tap: the client fires and forgets, the server
  aggregates per room, and the client queues hearts onto one shared drain
  interval with a hard cap of 26 live DOM nodes.
- Viewer counts are coalesced to at most one broadcast per second per room, and
  only when the number actually changed. No per-tick database writes.
- The `<video>` element is mounted once outside every conditional branch, so
  sheets, comment bursts and role changes never remount the media stream.
- Gift art is emoji glyphs — nothing to download, no third-party assets, and
  full-screen animations only mount when a rare gift actually lands.

## Roles

`viewer` → `moderator` (host promotes in-room) → `host`. Moderation controls are
not rendered for ordinary viewers, and every moderation socket event
re-checks the role server-side.

## Testing

```
npm run test:live       # engine suite — no server, no database, ~2s
npm run test:e2e:live   # API contract + mobile layout
npm test                # both, plus the existing smoke suite
```

`server/__livetest.js` runs the **entire** suite twice — once on the memory
store and once against a fake Redis client — then simulates two instances
sharing one Redis to prove a viewer on instance B can join and gift a room
hosted on instance A, and that a replayed gift nonce is refused on the *other*
instance. That last case is the one a per-process Map could never catch.

`e2e/live-mobile.spec.js` asserts the layout contract on five device profiles
(SE, Dynamic Island, tall 20:9, Galaxy Fold, iPad mini): no horizontal scroll,
no element outside the viewport, no clipped or sub-24px control.

## Known limits

- Battle mode assumes both lives are reachable through the same store; with
  Redis that works across instances, in memory mode both must be on one box.
- `mm_live_comments` is written for moderation review, not as a chat archive —
  it keeps whatever flushed before the live ended.
