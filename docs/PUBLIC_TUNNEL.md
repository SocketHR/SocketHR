# Public access: sockethr.com + Mac Studio API (LTE / anywhere)

Use this when **[https://sockethr.com](https://sockethr.com)** should talk to **SocketHR on your Mac** over **HTTPS** (required so the browser allows `fetch` from the HTTPS site).

## What you run on the Mac (always)

1. **LM Studio** — model loaded, **local server** started (port 1234).
2. **SocketHR API** — from repo root: `npm run server` (port 3000).
3. **HTTPS tunnel** — forwards a public URL → `http://127.0.0.1:3000` (see below).

LM Studio is **not** exposed publicly; only the Node server is. The server still calls LM Studio on localhost.

## Runtime `runtime-config.json` (fix phones without rebuilding JS)

The app fetches **`/runtime-config.json`** from the same host as the website. Commit default is empty `apiBase` ([`public/runtime-config.json`](../public/runtime-config.json)).

The repo ships [`public/runtime-config.json`](../public/runtime-config.json) with **`https://api.sockethr.com`**. **`npm run dev`** loads that file too, so **this Mac uses the same public API URL as any other device**. Use **`NEXT_PUBLIC_SOCKETHR_API_BASE=http://127.0.0.1:3000`** only when you want the UI to talk to a local server without the tunnel.

To use a different public URL, edit **`public/runtime-config.json`** (or override with **`NEXT_PUBLIC_SOCKETHR_API_BASE`** on Vercel) and redeploy. See [TROUBLESHOOTING_MOBILE.md](./TROUBLESHOOTING_MOBILE.md).

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

Use the printed **https://….ngrok-free.app** URL in **`runtime-config.json`** `apiBase` or as `NEXT_PUBLIC_SOCKETHR_API_BASE` when running `npm run dev` (free tier URLs may change on restart unless you reserve one).

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

## Step C — Set the API URL for production

```bash
cp .env.production.example .env.production
# Edit: set NEXT_PUBLIC_SOCKETHR_API_BASE=https://api.sockethr.com (optional)
npm run build
```

Or one-shot:

```bash
NEXT_PUBLIC_SOCKETHR_API_BASE=https://api.sockethr.com npm run build
```

`.env.production` is gitignored so your tunnel URL stays local unless you use CI secrets.

---

## Step D — Deploy to Vercel

Push to Git; Vercel builds/deploys automatically.

### GitHub Pages (optional)

Production **sockethr.com** is deployed via **Vercel**, not GitHub Pages. This workflow exists only if you want a separate Pages site.

This repo includes [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml). To use it:

1. Repo **Settings → Pages**: Source = **GitHub Actions**.
2. **Settings → Secrets and variables → Actions**: add repository secret **`NEXT_PUBLIC_SOCKETHR_API_BASE`** = your public API URL (e.g. `https://api.sockethr.com`) if you keep using this workflow.
3. In **Actions**, select **Deploy to GitHub Pages**, then **Run workflow** (it does not run on every push).

**To turn off GitHub Pages entirely** (e.g. stop Pages build emails): **Settings → Pages → Build and deployment → Source: None**.

---

## Step E — Smoke test

1. Phone on **LTE**: open **https://sockethr.com**, run **Analyze**.
2. Watch the Mac terminal running **`npm run server`** for incoming requests.

**CORS:** the server already allows any `Origin` (`cors({ origin: true })`), so `https://sockethr.com` works.

---

## Operations

- Mac must stay **awake** (adjust **Energy Saver** / **Prevent sleeping** while plugged in).
- Run **tunnel** + **`npm run server`** after reboot (consider `pm2` or **launchd** for both).
- If the public API URL changes, update `public/runtime-config.json` (or env override) and redeploy.

---

## Why https://sockethr.com failed from other devices before

The default API base is **`http://127.0.0.1:3000`**, which is **each device’s own loopback**, not your Mac. Also, an **HTTPS** page cannot call **HTTP** APIs (mixed content). This flow fixes both by using a **public HTTPS** API URL baked into the build.
