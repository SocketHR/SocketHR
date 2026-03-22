# Public access: sockethr.com + Mac Studio API (LTE / anywhere)

Use this when **[https://sockethr.com](https://sockethr.com)** should talk to **SocketHR on your Mac** over **HTTPS** (required so the browser allows `fetch` from the HTTPS site).

## What you run on the Mac (always)

1. **LM Studio** — model loaded, **local server** started (port 1234).
2. **SocketHR API** — from repo root: `npm run server` (port 3000).
3. **HTTPS tunnel** — forwards a public URL → `http://127.0.0.1:3000` (see below).

LM Studio is **not** exposed publicly; only the Node server is. The server still calls LM Studio on localhost.

## Runtime `runtime-config.json` (fix phones without rebuilding JS)

The app fetches **`/runtime-config.json`** from the same host as the website. Commit default is empty `apiBase` ([`public/runtime-config.json`](../public/runtime-config.json)).

The repo ships [`public/runtime-config.json`](../public/runtime-config.json) with **`https://api.sockethr.com`** for **production** builds. Local **`npm run dev`** ignores that file so the API stays on **localhost:3000**.

To use a different public URL, edit **`public/runtime-config.json`** (or override with **`VITE_SOCKETHR_API_BASE`** on Vercel) and redeploy. See [TROUBLESHOOTING_MOBILE.md](./TROUBLESHOOTING_MOBILE.md).

---

## Step A — Tunnel public HTTPS → port 3000

### Option 1: Cloudflare Tunnel (stable `api` subdomain)

Best if **sockethr.com DNS is on Cloudflare**.

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) on the Mac.
2. Authenticate: `cloudflared tunnel login`
3. Create a tunnel: `cloudflared tunnel create sockethr-api`
4. In Cloudflare dashboard: **Zero Trust → Networks → Tunnels** → assign a **Public hostname**, e.g. `api.sockethr.com` → **HTTP** → `http://127.0.0.1:3000`
5. Run the tunnel (or use the generated config):

   ```bash
   cloudflared tunnel run sockethr-api
   ```

See also [deploy/cloudflared/config.example.yml](../deploy/cloudflared/config.example.yml) for a config-file shape (replace tunnel UUID and credentials path).

### Option 2: ngrok (quick test)

```bash
ngrok http 3000
```

Use the printed **https://….ngrok-free.app** URL in **`runtime-config.json`** `apiBase` or as `VITE_SOCKETHR_API_BASE` when building (free tier URLs may change on restart unless you reserve one).

### Option 3: Tailscale Funnel

If you use Tailscale, enable [Funnel](https://tailscale.com/kb/1223/funnel) and expose the machine’s port 3000; use the provided `https://…ts.net` URL in the frontend build.

---

## Step B — Verify from another network (LTE)

On a phone **Wi‑Fi off** or any machine **not** on your LAN:

```bash
curl -s https://YOUR_API_HOST/health
```

Expect: `{"ok":true,"service":"sockethr-server"}`

If this fails, fix DNS/tunnel before rebuilding the website.

---

## Step C — Bake the API URL into the production build

Vite reads **`.env.production`** automatically when you run `npm run build`.

```bash
cp .env.production.example .env.production
# Edit: set VITE_SOCKETHR_API_BASE=https://api.sockethr.com  (no trailing slash)
npm run build
```

Or one-shot (prefix the **whole** command — do not use `VAR=value tsc && vite build`, or only `tsc` gets the variable):

```bash
VITE_SOCKETHR_API_BASE=https://api.sockethr.com npm run build
```

`.env.production` is gitignored so your tunnel URL stays local unless you use CI secrets.

---

## Step D — Deploy `dist/` to sockethr.com

Upload the contents of **`dist/`** to your static host (Cloudflare Pages, Vercel, Netlify, S3, etc.).

### GitHub Pages (optional)

This repo includes [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml). To use it:

1. Repo **Settings → Pages**: Source = **GitHub Actions**.
2. **Settings → Secrets and variables → Actions**: add repository secret **`VITE_SOCKETHR_API_BASE`** = your public API URL (e.g. `https://api.sockethr.com`).
3. Push to `main`; the workflow builds with that variable and deploys `dist/`.

---

## Step E — Smoke test

1. Phone on **LTE**: open **https://sockethr.com**, run **Analyze**.
2. Watch the Mac terminal running **`npm run server`** for incoming requests.

**CORS:** the server already allows any `Origin` (`cors({ origin: true })`), so `https://sockethr.com` works.

---

## Operations

- Mac must stay **awake** (adjust **Energy Saver** / **Prevent sleeping** while plugged in).
- Run **tunnel** + **`npm run server`** after reboot (consider `pm2` or **launchd** for both).
- If the public API URL changes, **rebuild** the frontend and **redeploy**.

---

## Why https://sockethr.com failed from other devices before

The default API base is **`http://127.0.0.1:3000`**, which is **each device’s own loopback**, not your Mac. Also, an **HTTPS** page cannot call **HTTP** APIs (mixed content). This flow fixes both by using a **public HTTPS** API URL baked into the build.
