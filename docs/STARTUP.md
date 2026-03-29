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

**Pick one:**

**A — Dashboard public hostname** (domain is a **Cloudflare zone**): **Cloudflare** → **Zero Trust → Networks → Tunnels** *or* **Networking → Tunnels** → your tunnel → **Public hostname** / **Add route** → **Published application**:

- **Subdomain:** `api`
- **Domain:** `sockethr.com`
- **Service:** `http://127.0.0.1:3000`

**B — Vercel DNS only** (domain **not** on Cloudflare): use **`~/.cloudflared/config.yml`** from **[`deploy/cloudflared/config.example.yml`](../deploy/cloudflared/config.example.yml)**, CNAME **`api`** → **`<tunnel-uuid>.cfargotunnel.com`** at Vercel. Full steps: **[`deploy/cloudflared/README.md`](../deploy/cloudflared/README.md)**.

If you hit **Reporting only** or a grayed-out **Select domain**, use **B** or see [PUBLIC_TUNNEL.md](./PUBLIC_TUNNEL.md).

**Every session** (after Terminals 1–2 are up):

```bash
# If you use a config file (Vercel DNS path):
cloudflared tunnel --config ~/.cloudflared/config.yml run

# If the tunnel is only configured in the Cloudflare dashboard:
cloudflared tunnel run sockethr-api
```

(Use the **same tunnel name** you created when using the second form. If you named it differently, substitute that name.)

### Optional — local UI only (not required for sockethr.com)

```bash
cd /Users/yanlevin/github/sockethr
npm run dev
```

Open **http://localhost:3000**.  
By default the UI reads **`public/runtime-config.json`** and calls **`https://api.sockethr.com`** (your tunnel must be up).

To force local API during dev:

```bash
NEXT_PUBLIC_SOCKETHR_API_BASE=http://127.0.0.1:3000 npm run dev
```

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

The site redeploys from **Git**. After `git push`, Vercel builds automatically.

Set these env vars in Vercel:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXTAUTH_URL=https://sockethr.com`
- `NEXTAUTH_SECRET=<strong random secret>`

Optional:

- `NEXT_PUBLIC_SOCKETHR_API_BASE=https://api.sockethr.com` (or rely on `public/runtime-config.json`)

---

## Troubleshooting

See [TROUBLESHOOTING_MOBILE.md](./TROUBLESHOOTING_MOBILE.md) and [PUBLIC_TUNNEL.md](./PUBLIC_TUNNEL.md).
