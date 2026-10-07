# Environment variables and secrets

All **keys and sensitive passwords** must live in environment variables loaded from `.env` (or a path you set via `DOTENV_CONFIG_PATH`). Never commit `.env` or any file that contains real secrets.

## Server (root `.env`)

1. Copy the template:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` and set at least:
   - **`ADMIN_KEY`** – Strong random string (min 16 chars) for admin panel auth.  
     Example: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - **`FRONTEND_ORIGIN`** – In production, your front-end origin(s), comma-separated (e.g. `https://helloooo.site`).
3. Optional:
   - **`PORT`** – Default `3000`.
   - **`NODE_ENV`** – `development` or `production`.
   - **`REDIS_URL`** – Redis for matchmaking queues + Socket.IO adapter (recommended in production).
   - **`TURN_USERNAME`** / **`TURN_PASSWORD`** / **`TURN_URL`** – Your TURN account.
   - **`TURN_HOST_IN`**, **`TURN_HOST_UK`**, **`TURN_HOST_EU`**, **`TURN_HOST_US`**, **`TURN_HOST_GLOBAL`** – Regional TURN hosts (UDP preferred). Defaults map India→`in`, UK→`uk`, EU/DE→`eu` (Frankfurt-class), US→`us`.
   - **`LIVEKIT_URL`** – LiveKit WebSocket URL (`wss://…livekit.cloud` or self-hosted). Enables **group video SFU**.
   - **`LIVEKIT_API_KEY`** / **`LIVEKIT_API_SECRET`** – LiveKit project API credentials (server-only; never expose to Vite).
   - **`LIVEKIT_ROOM_PREFIX`** – Optional prefix for SFU room names (default `helloooo`).

See **`ENV.md`** for the full list and comments. Copy values into a local `.env` (never commit it).

## Client (`client/`)

- Use **`client/.env.example`** as a template for optional **`client/.env.local`** (e.g. `VITE_SOCKET_URL` if the API is on another domain).
- **Do not put secrets in any `VITE_*` variable** – Vite embeds them in the build, so they would be visible to users.

## WebRTC / media architecture (production)

```
Helloooo (Vercel)
      │
Node.js API (Render) — rooms, auth, permissions, chat, gifts
      │
      ▼
 LiveKit SFU  ──► User A / B / C (camera + mic)
```

- **1:1 video** — WebRTC mesh; Socket.IO signaling only. Media never routes through Node.
- **Group video** — **LiveKit SFU** when `LIVEKIT_*` is set; otherwise mesh fallback. Node mints short-lived tokens (`livekit-token`); LiveKit carries A/V.
- **Trickle ICE** — candidates are sent as they appear (mesh path).
- **Media pre-warm** — camera/mic acquired before partner match (1:1); RTCPeerConnection warmed while searching.
- **Socket.IO persists** — “Next” leaves the room and rematches; it does **not** open a new WebSocket.
- **Quality ladder** — connect at ~360p, then ramp toward 720p when the network is stable (mesh / LiveKit adaptive).
- **CDN** — frontend (JS/CSS/images) is served by **Vercel’s CDN**. Point avatars/gift assets at a CDN URL when possible; do not serve them from the Render API host.

Probe: `GET /api/livekit/status` → `{ enabled, url, provider }` (no secrets).

## Security checklist

- `.env` and `.env.local` are in `.gitignore`; never add them to version control.
- Only `.env.example` and `client/.env.example` (no real values) should be committed.
- In production, set `ADMIN_KEY` to a strong value so the `/admin` dashboard is protected.
- The server never logs `ADMIN_KEY`, `TURN_PASSWORD`, `LIVEKIT_API_SECRET`, or any other secret env value.

## Matchmaking, safety and relay

| Variable | Default | What it does |
| --- | --- | --- |
| `TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD` | — | Your own TURN server. Set these in production. |
| `TURN_FALLBACK_USERNAME`, `TURN_FALLBACK_PASSWORD` | public demo creds | Credentials for the shared regional relay. |
| `TURN_ALLOW_DEMO_RELAY` | — | Set to `1` to let production start on the public demo relay. It will fail for users behind symmetric NAT; only set this knowingly. |
| `MATCH_SCAN_LIMIT` | `80` | How deep a search reads the waiting queue. Bounded so a busy night does not slow every match. |
| `FIND_PARTNER_MAX` | `12` | Searches allowed per window, per device. |
| `FIND_PARTNER_WINDOW_MS` | `10000` | Length of that window. |
| `REPORT_STRIKE_THRESHOLD` | `3` | Distinct reporters before matching is paused. |
| `REPORT_WINDOW_MS` | `604800000` (7d) | How long a report counts, and how long strikes take to decay. |
| `REPORT_REVIEW_THRESHOLD` | `8` | Distinct reporters that flag someone for a human. |

**Production will not start** with no TURN configured and the demo relay
credentials still in place. See the TURN section in `docs/LIVE.md`.
