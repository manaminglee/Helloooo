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

## Nuts pricing

One base rate, then visible bonuses:

- **Base rate** — `BASE_NUTS_PER_INR = 100`. Every pack pays at least this.
- **Bonus** — the amount above base, shown as both `+N% bonus` and `N Nuts / ₹`
  so a buyer never has to divide to find the better pack. Bonuses run +2% at
  ₹49 up to +18% at ₹19,999, and value per rupee climbs monotonically. A test
  asserts the ladder never has a bigger pack that is worse value.
- **Ceiling** — `MAX_NUTS_PER_INR = 118`, and this is a business constraint, not
  a taste. Creators cash out at `NUTS_PER_USD` (10,000 Nuts = $1) and the top
  gift tier pays them 86% of what the gift cost. Above the ceiling, a whale
  buying the biggest pack to send the biggest gift loses the platform money on
  every send. `__paytest.js` asserts ≥10% gross margin on every pack at the
  highest creator share in the catalog.

  The previous ladder topped out at 250 Nuts/₹, which was under water against
  the payout rate — the current ladder is narrower for that reason.
- **First purchase** — +50% capped at 8,000 Nuts, applied by
  `audioIdentity.creditCoinPack` inside the wallet lock. The cap matters: an
  uncapped percentage makes the largest pack the cheapest Nuts on the platform,
  which is the pack with the least margin to give away. Lifetime
  `coinsRecharged` is the first-purchase signal, so there is no extra flag to
  keep in sync, and reading it inside the same lock as the credit means two
  simultaneous checkouts cannot both collect it.
- **Retired packs** — `RETIRED_PACKS` maps old ids to their replacements and
  every server lookup goes through `findCoinPackage`, so a checkout started
  before a price change still completes.
- **Shortfall** — a failed gift send carries its shortfall to the market sheet,
  which highlights the cheapest pack that covers it (`packForShortfall`).

## Matchmaking (1:1 video, text, group video)

Two tiers, always in this order:

1. **Shared interest.** Candidates who share at least one real interest with the
   seeker, ranked by how many they share. `general` (and `any` / `random` /
   empty) is the default everybody carries, so it is excluded — counting it
   would put the whole queue in tier 1 and the preference would mean nothing.
2. **Anyone.** If tier 1 is empty, the search takes the best remaining
   stranger. Nobody waits on a hobby match that may never arrive.

Scoring lives in `enhancements.smartMatchScore`: one shared interest is worth
40 points plus 12 per overlap (capped at 3), which is deliberately more than
region and language can add together — a same-country stranger with nothing in
common must not beat a genuine interest match. Waiting time adds up to 6 points
so that among equals the person who has waited longest goes first.

**Speed.** Two things kept searches slow:

- The Redis path did one `GET` per waiting person on every search, so the
  busier the queue the slower each match became. It is now one `LRANGE` plus
  one `MGET`, with stale ids swept in a single pipeline off the blocking path.
  `__matchtest.js` asserts this — a search across 40 waiting people must cost
  exactly one `MGET` and zero `GET`s.
- Searches read the whole queue. They now stop at `MATCH_SCAN_LIMIT` (80,
  `MATCH_SCAN_LIMIT` env). The head of the list is the longest-waiting people,
  so a bounded scan is also the fairer half.

A lost claim (another instance took the same person) retries down the list up
to four times instead of dropping the seeker back into the queue — under load
that race is common, and re-queueing turned it into a visible stall.

**Skip.** `canMatch` refuses the partner you just skipped for the length of the
skip window, unless you both skipped each other at the same moment, which
reconnects you instead. `clearRoom()` nulls `roomIdRef` synchronously so the
re-queue effect fires on the very next render rather than waiting for the
2.5-second stall recovery.

## Match status line

`client/src/components/MatchStatusLine.jsx` owns the chat line that reports
where you are in a match, and both 1:1 video and group video write it, so the
wording is identical in both:

- searching — "Now finding a stranger…" with a pulsing meter
- connected — "Connected to a stranger from" plus a flag and country name
- left — "The stranger from <country> left"

Build them with `searchingMessage()` / `connectedMessage(country)` /
`leftMessage(country)`; each stamps a `kind` that the renderer switches on. A
plain `system: true` message still renders as the old grey line.

Writing a connected line drops any searching line, and writing a searching line
drops both, so the chat reads as one status that changed rather than a log.

Country reaches the client even in anonymous video: `publicAnonPeer` includes
it deliberately. A whole country does not identify anyone — it is already what
the flag on every chat bubble shows — and without it the room cannot say where
the stranger is. Nickname, user id and creator status stay hidden.

`CountryFlag` falls back from the CDN image to an emoji flag, then to the
country code, so a blocked or slow CDN leaves text rather than a blank gap.

## Video attach

`attachStreamToVideo` retries `play()` on `loadedmetadata`, `canplay`,
`stalled`, `suspend`, `emptied`, on track mute/unmute/ended, on `addtrack`, and
on returning from the background. Every one of those is a case where the first
`play()` legitimately rejects and then becomes possible a moment later; without
the retries the result is a live track behind a black pane.

## Match safety

Reports used to be a table nobody read: a row was stored, trust dropped 8, and
nothing else happened until a human manually banned an IP. Somebody exposing
themselves could be reported by fifty people in an hour and keep matching all
night. `server/matchSafety.js` is the missing middle.

- **Distinct reporters, not report count.** One angry person hammering the
  button must not remove anybody, and the queue makes being matched with the
  same person twice easy. Repeat reports refresh a timestamp; they do not count
  again. Three distinct reporters inside the window is the first strike.
- **Escalate, don't ban.** 30 minutes → 6 hours → 24 hours → 7 days, and it
  stops there. Bad-faith reporting is real and devices are shared, so a first
  strike is a cooling-off period. Reports arriving *during* a pause do not
  compound it — otherwise one incident runs the whole ladder.
- **Strikes decay.** They survive one report window past the last strike (so a
  second incident that week really is a second strike) and then reset. Decay
  happens on read, not on the sweep: tying it to the sweep meant a record kept
  for moderator review never decayed and escalated somebody forever.
- **Suspension is from MATCHING, not the site.** An existing conversation is
  untouched, and the person can still read, top up and reach support. Both
  `find-partner` and `join-group-by-topics` are gated — gating only one would
  have left the whole thing a tab away from pointless.
- **It can never take matching down.** Every call is wrapped; a throwing
  listener does not stop a suspension, and a failure here does not fail a match.

Moderators get `/api/admin/match-safety` (the review queue, with anyone
currently online under each key so the stream can be watched) and
`/api/admin/match-safety/clear` to lift a pause.

The person sees `MatchSuspendedNotice` — what happened, a live countdown, and a
way to appeal. A pause with a visible end reads as a consequence; a pause with
no end reads as a permanent ban.

## Identity keys

Anonymous video has no account, so the only identifier used to be the IP, which
fails both ways: one carrier IP is thousands of people (blocking it punishes
bystanders) and an IP rotates daily (a block evaporates on its own).
`client/src/utils/deviceHandle.js` stores a random 128-bit handle in
localStorage and sends it in the socket handshake; `identityKeyFor()` prefers it
and falls back to `ip:<addr>`.

This is not security. Clearing site data produces a new handle, and it should —
it exists to keep "I never want to see this person again" working across a
reconnect, not to stop someone determined to evade it. The server validates the
shape rather than trusting it.

Personal blocks are stored on this key and checked in both directions.

## Search throttle

`find-partner` is the one socket event a client can loop on for free, and each
call costs a queue round trip. Unthrottled it is both a cheap DoS and the
fastest way to enumerate everyone online. 12 searches per 10s per device
(`FIND_PARTNER_MAX` / `FIND_PARTNER_WINDOW_MS`), which is far above what a
person skipping hard produces by hand. The client backs off on `find-throttled`
rather than spinning.

## Network handover

Wifi → cellular changes your local address and silently kills every candidate
pair. WebRTC notices eventually — `iceConnectionState` must reach `failed`,
which browsers delay on purpose — so the user sees 10–15 seconds of frozen
video first. `useNetworkRecovery` listens for `online` and
`navigator.connection` change and restarts ICE immediately, turning the freeze
into a blip. Debounced at 400ms with a 4s floor between restarts so a flapping
connection cannot become an offer loop.

## TURN credentials

The shared relay fallback ships public demo credentials. They are fine locally
and useless in production: rate limited, shared with everyone who copied them,
revocable without warning — and when they stop working there is no error
anywhere. ICE simply never finds a relay pair and every user behind symmetric
NAT (most mobile networks) gets a black remote video.

`assertRelayCredentialsUsable()` therefore makes production **refuse to start**
on them. A warning would scroll past in a deploy log, and the symptom looks like
an app bug rather than missing config. Configure `TURN_URL` /
`TURN_USERNAME` / `TURN_PASSWORD`, or your own `TURN_FALLBACK_*`, or set
`TURN_ALLOW_DEMO_RELAY=1` to accept a relay that will fail.

## Test suites

    node server/__matchtest.js       queue: interest tiers, scan cost, both backends
    node server/__matchflowtest.js   real server + real sockets: pairing, signalling,
                                     glare, skip, throttle
    node server/__safetytest.js      report ladder, decay, review queue, TURN guard

`__matchflowtest.js` boots `server/index.js` as a child process and drives it
with Socket.IO clients. Every wait is an explicit event await with a named
timeout rather than a sleep, so it does not go flaky when CI is busy.
