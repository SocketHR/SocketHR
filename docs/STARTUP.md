# Start everything (Mac Studio + mobile / sockethr.com)

Production UI (**https://sockethr.com**) loads API from **https://api.sockethr.com** via [`public/runtime-config.json`](../public/runtime-config.json) (production builds only). Your Mac must expose **SocketHR** on port **3000** at that hostname (Cloudflare Tunnel is the usual setup).

---

## Fresh terminals — exact order

### Terminal 1 — LM Studio (GUI, not `bash`)

1. Open **LM Studio**.
2. Load **openai/gpt-oss-20b** (or your model).
3. **Developer** tab → turn **local server** **ON** (listening on **1234**).

### Terminal 2 — SocketHR API

```bash
cd /Users/yanlevin/github/sockethr
npm run server
```

If you use env vars in `server/.env`:

```bash
cd /Users/yanlevin/github/sockethr/server
node --env-file=.env index.js
```

Leave this running.

### Terminal 3 — Public HTTPS → your Mac (Cloudflare Tunnel)

**First-time only:** install and log in (once per Mac):

```bash
brew install cloudflare/cloudflare/cloudflared
cloudflared tunnel login
cloudflared tunnel create sockethr-api
```

In **Cloudflare Zero Trust** → **Networks** → **Tunnels** → your tunnel → **Public hostname**:

- **Subdomain:** `api`
- **Domain:** `sockethr.com`
- **Service:** `http://127.0.0.1:3000`

**Every session** (after Terminals 1–2 are up):

```bash
cloudflared tunnel run sockethr-api
```

(Use the **same tunnel name** you created. If you named it differently, substitute that name.)

### Optional — local UI only (not required for sockethr.com)

```bash
cd /Users/yanlevin/github/sockethr
npm run dev
```

Open **http://localhost:5173** — dev mode still talks to **http://127.0.0.1:3000** (runtime-config override is **disabled** in development).

---

## Quick checks

```bash
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:1234/v1/models
curl -sS https://api.sockethr.com/health
```

The last command should return `{"ok":true,"service":"sockethr-server"}` when the tunnel and server are up.

---

## Vercel

The site redeploys from **Git**. After `git push`, Vercel builds automatically. Optional env **`VITE_SOCKETHR_API_BASE`** should match **`https://api.sockethr.com`** (or rely on `runtime-config.json` in the repo).

---

## Troubleshooting

See [TROUBLESHOOTING_MOBILE.md](./TROUBLESHOOTING_MOBILE.md) and [PUBLIC_TUNNEL.md](./PUBLIC_TUNNEL.md).
