# Deployment: Vercel (frontend) + Render (backend)

Push to **GitHub** → both auto-deploy. Follow the steps below to use both.

---

## Step 1: Push code to GitHub

Ensure your repo is on GitHub and up to date:

```bash
git add .
git commit -m "Deploy config"
git push origin main
```

---

## Step 2: Set up Render (backend)

1. Go to [dashboard.render.com](https://dashboard.render.com) and sign in.
2. Click **New** → **Web Service**.
3. Connect your GitHub repo: `manaminglee/manamingle` (or your repo name).
4. Configure:
   - **Name**: `mana-mingle` (or any name)
   - **Region**: Oregon (or closest to you)
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

5. Click **Advanced** → **Add Environment Variable**:
   - `NODE_ENV` = `production`
   - `ADMIN_KEY` = click "Generate" (or paste a strong random string)
   - `FRONTEND_ORIGIN` = leave empty for now (add after Vercel is set up)

6. Click **Create Web Service**. Wait for the first deploy.
7. Copy your Render URL, e.g. `https://mana-mingle-xxxx.onrender.com` (from the top of the service page).

---

## Step 3: Set up Vercel (frontend)

1. Go to [vercel.com/new](https://vercel.com/new) and sign in.
2. Import your GitHub repo: `manaminglee/manamingle`.
3. Configure:
   - **Framework Preset**: Other
   - **Root Directory**: leave empty
   - **Build Command**: `cd client && npm install && npm run build`
   - **Output Directory**: `client/dist`

4. Under **Environment Variables**, add:
   - **Key**: `VITE_SOCKET_URL`
   - **Value**: `https://mana-mingle-xxxx.onrender.com` (paste your Render URL from Step 2)

5. Click **Deploy**. Wait for the build to finish.
6. Copy your Vercel URL, e.g. `https://manamingle-xxxx.vercel.app` (from the deployment page).

---

## Step 4: Connect backend and frontend

1. **Render** → Your service → **Environment** tab:
   - Add or edit `FRONTEND_ORIGIN` = your Vercel URL (e.g. `https://manamingle-xxxx.vercel.app`)
   - Click **Save Changes**. Render will redeploy.

2. **Vercel** → Your project → **Settings** → **Environment Variables**:
   - Confirm `VITE_SOCKET_URL` is set to your Render URL.

---

## Step 5: Keep Render alive (optional, free tier)

Render free tier sleeps after ~15 min of no traffic. To keep it warm:

1. Go to [uptimerobot.com](https://uptimerobot.com) (free account).
2. **Add New Monitor**:
   - Monitor Type: HTTP(s)
   - Friendly Name: `Mana-Mingle Backend`
   - URL: `https://YOUR-RENDER-URL.onrender.com/health`
   - Monitoring Interval: 5 minutes
3. Click **Create Monitor**.

---

## URLs

| Purpose      | URL                               |
|--------------|-----------------------------------|
| App (users)  | Your Vercel URL                   |
| Admin panel  | `https://YOUR-VERCEL-URL/admin`   |
| Backend API  | Your Render URL                   |

---

## Auto-deploy

After setup, any push to `main` will:
- Deploy the frontend to Vercel
- Deploy the backend to Render (if connected via Render dashboard)

To enable auto-deploy on Render: Service → **Settings** → **Build & Deploy** → **Auto-Deploy** = Yes.

---

## Troubleshooting

- **"Failed to fetch" or CORS errors** → Check `FRONTEND_ORIGIN` on Render matches your Vercel URL exactly (no trailing slash).
- **Socket not connecting** → Check `VITE_SOCKET_URL` on Vercel matches your Render URL (with `https://`).
- **Render sleeping** → First request after sleep can take 30–60 seconds. Use UptimeRobot to reduce this.
