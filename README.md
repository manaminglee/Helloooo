# ManaMingle

ManaMingle is a real-time social platform for interest-based text and video conversations.  
Users can join topic-driven rooms, chat instantly, and connect over WebRTC-powered video sessions with moderation, safety, and creator-focused tooling.

## Live Site

Primary redirect/domain: **[manamingle.site](https://manamingle.site)**  
If needed, open directly via this link and you will be redirected to the active deployment.

## Highlights

- Interest-based matching for group and one-to-one experiences
- Real-time messaging with Socket.IO
- WebRTC video chat with connection resilience improvements
- Age verification gate with Cloudflare Turnstile support
- Creator/admin utilities for platform controls and operations

## Tech Stack

- Frontend: React, Vite, Tailwind CSS
- Backend: Node.js, Express, Socket.IO
- Realtime/Media: WebRTC + Socket signaling
- Security: Helmet, CORS controls, request hardening, verification checks

## Project Structure

- `client/` - React frontend (Vite)
- `server/` - Express and Socket.IO backend logic
- `vercel.json` - Vercel build/output configuration
- `.github/workflows/` - CI/CD workflows (including GitHub Pages deployment)

## Local Development

### 1) Install dependencies

```bash
npm install
cd client && npm install && cd ..
```

### 2) Run development servers

Backend:

```bash
npm run dev
```

Frontend:

```bash
npm run dev:client
```

Open `http://localhost:5173` for the client application.

## Production Build

```bash
npm run build
npm start
```

The server runs on `http://localhost:3000` by default.

## Environment Variables

Configure environment values in `.env` (see project examples/templates if available):

- `PORT` - Server port (default: `3000`)
- `NODE_ENV` - `development` or `production`
- `FRONTEND_ORIGIN` - Allowed frontend origin(s) for CORS
- `VITE_SOCKET_URL` - Frontend API/socket base URL
- `VITE_TURNSTILE_SITE_KEY` - Cloudflare Turnstile site key (client)
- `TURNSTILE_SECRET_KEY` - Cloudflare Turnstile secret (server)
- `TURN_USERNAME` / `TURN_PASSWORD` - Optional TURN credentials for difficult NAT networks

## Deployment

### Vercel (Frontend)

This repository includes `vercel.json` configured to build from `client/` and publish `client/dist`.

### GitHub Pages

A workflow is included at `.github/workflows/deploy-pages.yml` to build and deploy the frontend artifact.

## License

MIT
