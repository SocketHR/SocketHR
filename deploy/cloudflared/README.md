# Cloudflare Tunnel + Vercel DNS only

Use this when **`sockethr.com` DNS lives on Vercel** (or any non-Cloudflare DNS) and the dashboard **“Select domain”** is grayed out because the domain is **not** a Cloudflare zone.

You define **`api.sockethr.com` → `http://127.0.0.1:3000`** in a local **`config.yml`**, run **`cloudflared`**, then point **`api`** at Cloudflare’s tunnel hostname with a **CNAME** in Vercel.

## 0. Automated Path A setup (recommended)

1. **Login once** (opens a browser):

   ```bash
   cloudflared tunnel login
   ```

   If **Authorize Cloudflare Tunnel** shows **no `sockethr.com` row**, that domain is **not** a zone in this Cloudflare account yet. Add it first (**Add site** → `sockethr.com` → Free); you can stay on Path A and **not** change nameservers. See **[PATH_A_SETUP.md — No sockethr.com row](../../docs/PATH_A_SETUP.md#no-sockethrcom-row-empty-list-or-wrong-account)**.

2. **Create tunnel + write `~/.cloudflared/config.yml` + print Vercel CNAME** (from repo root):

   ```bash
   bash deploy/cloudflared/setup-path-a.sh
   ```

   The script prints the exact **CNAME** value for Vercel. Then continue with **§4 Every session** and **§5 Verify** below.

Full checklist: **[../../docs/PATH_A_SETUP.md](../../docs/PATH_A_SETUP.md)**.

## 1. One-time: install, login, create tunnel

```bash
brew install cloudflare/cloudflare/cloudflared
cloudflared tunnel login
cloudflared tunnel create sockethr-api
cloudflared tunnel list
```

Note the **Tunnel ID** (UUID) next to `sockethr-api`. The credentials file is usually:

`~/.cloudflared/<TUNNEL_UUID>.json`

## 2. Config file

Copy the example and edit placeholders:

```bash
cp deploy/cloudflared/config.example.yml ~/.cloudflared/config.yml
```

In **`~/.cloudflared/config.yml`**:

- Set **`tunnel:`** to your **Tunnel ID** (UUID).
- Set **`credentials-file:`** to the matching **`~/.cloudflared/<UUID>.json`** path.

The **`ingress`** block should keep:

- **`hostname: api.sockethr.com`** → **`service: http://127.0.0.1:3000`**
- A final **`service: http_status:404`** catch-all (required).

Validate:

```bash
cloudflared tunnel --config ~/.cloudflared/config.yml ingress validate
```

## 3. CNAME on Vercel

In **Vercel** → your project (or domain DNS) → **Domains** / DNS for `sockethr.com`:

| Type  | Name | Value |
|-------|------|--------|
| **CNAME** | **api** | **`<TUNNEL_UUID>.cfargotunnel.com`** |

Use the **same UUID** as in `tunnel:` (no `https://`, no path).  
Do **not** point `api` at `cname.vercel-dns.com` if you want traffic to hit the tunnel.

DNS can take a few minutes to propagate.

## 4. Every session: run API + tunnel

With **LM Studio** and **`npm run server`** (port **3000**) already running:

```bash
cloudflared tunnel --config ~/.cloudflared/config.yml run
```

(If your config only references one tunnel, this is enough; you can also pass the tunnel name: `cloudflared tunnel run sockethr-api` **only if** that name resolves to the same tunnel and credentials Cloudflare expects—using **`--config`** is the most reliable.)

## 5. Verify

```bash
curl -sS https://api.sockethr.com/health
```

Expect: `{"ok":true,"service":"sockethr-server"}`

## Troubleshooting

- **525 / SSL errors** — Usually DNS not yet pointing at the tunnel, or wrong CNAME target.
- **502** — Tunnel is up but nothing is listening on **`127.0.0.1:3000`** on the Mac running `cloudflared`.
- **Wrong host** — Ingress **`hostname`** must exactly match **`api.sockethr.com`** (what clients use in `https://api.sockethr.com`).

See also **[../../docs/PUBLIC_TUNNEL.md](../../docs/PUBLIC_TUNNEL.md)** and **[../../docs/STARTUP.md](../../docs/STARTUP.md)**.
