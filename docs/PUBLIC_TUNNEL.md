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
4. In the Cloudflare dashboard, add a **Public hostname** (same tunnel, either UI works):
   - **Zero Trust** → **Networks** → **Tunnels** → your tunnel → **Public hostname**, **or**
   - **Account home** (no zone selected) → sidebar **Networking** → **Tunnels**, **or** open **`https://dash.cloudflare.com/<your_account_id>/tunnels`** (same page; easier than **Insights → Tunnels** if clicks get stuck).
   - Set **hostname** to `api.sockethr.com` (or your chosen subdomain), **type** HTTP, **URL** `http://127.0.0.1:3000`.

   **If Zero Trust shows “Reporting only” or “We could not find that page” on Tunnels:** your role cannot manage connectors. Fix it by logging in as the **Zero Trust team owner** or having them grant **Super Administrator** (or equivalent). You can still try the **account-level Networking → Tunnels** path above, or do everything via CLI (`cloudflared tunnel route dns …` after login).

   **DNS on Vercel (not Cloudflare):** after the tunnel exists, Cloudflare shows a **CNAME target** (often `*.cfargotunnel.com`). In **Vercel → Project → Settings → Domains** (or your DNS host), add **CNAME** `api` → that target. Do **not** point `api` at Vercel’s `cname.vercel-dns.com` if you want the tunnel to serve the API.

   **If dashboard “Add route” → “Published application” has a grayed-out “Select domain”:** your apex domain (e.g. `sockethr.com`) is **not** added as a zone in this Cloudflare account, so the UI cannot auto-manage DNS. Fix: **add the domain to Cloudflare** (see [CLOUDFLARE_ZONE_AND_VERCEL.md](./CLOUDFLARE_ZONE_AND_VERCEL.md) — **partial/CNAME setup needs Business+**), **or** define the hostname in a **`cloudflared` config file** (`ingress` rules) and add the **CNAME** for `api` manually at Vercel (tunnel overview / docs show the `*.cfargotunnel.com` target once the route exists).

5. Run the tunnel (or use the generated config):

   ```bash
   cloudflared tunnel run sockethr-api
   ```

See also [deploy/cloudflared/config.example.yml](../deploy/cloudflared/config.example.yml) for a config-file shape (replace tunnel UUID and credentials path).

#### Option 1b — Vercel DNS only (`config.yml` + CNAME, no Cloudflare zone)

If **`sockethr.com` is not** on Cloudflare, skip the dashboard public hostname and use a **local config** plus a **Vercel CNAME**:

1. **`cloudflared tunnel create sockethr-api`** (if you have not already).
2. Copy **[`deploy/cloudflared/config.example.yml`](../deploy/cloudflared/config.example.yml)** to **`~/.cloudflared/config.yml`**, set **`tunnel:`** to the tunnel **UUID** and **`credentials-file`** to the matching **`~/.cloudflared/<UUID>.json`**.
3. **Ingress** must include **`api.sockethr.com` → `http://127.0.0.1:3000`** and a final **`http_status:404`** rule (see example).
4. At **Vercel** DNS for `sockethr.com`, add **CNAME** **`api`** → **`<TUNNEL_UUID>.cfargotunnel.com`** (same UUID as in the config).
5. Run: **`cloudflared tunnel --config ~/.cloudflared/config.yml run`** (with **`npm run server`** up).

Step-by-step: **[`deploy/cloudflared/README.md`](../deploy/cloudflared/README.md)** and **[`docs/PATH_A_SETUP.md`](./PATH_A_SETUP.md)** (checklist + `setup-path-a.sh`).

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
