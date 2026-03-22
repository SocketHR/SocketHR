# SocketHR

AI-assisted hiring UI: job posting, resume upload, local LLM scoring via **LM Studio**, optional public **https://api.sockethr.com** for **https://sockethr.com** on mobile.

## Runbook (copy-paste)

See **[docs/STARTUP.md](docs/STARTUP.md)** for the exact commands to start LM Studio, `npm run server`, and Cloudflare Tunnel.

## Docs

- [docs/LOCAL_BACKEND.md](docs/LOCAL_BACKEND.md) — Node server + LM Studio
- [docs/PUBLIC_TUNNEL.md](docs/PUBLIC_TUNNEL.md) — HTTPS tunnel + Vercel
- [deploy/cloudflared/README.md](deploy/cloudflared/README.md) — Tunnel + **Vercel DNS only** (`config.yml` + CNAME)
- [docs/CLOUDFLARE_ZONE_AND_VERCEL.md](docs/CLOUDFLARE_ZONE_AND_VERCEL.md) — Add `sockethr.com` to Cloudflare vs **partial/CNAME setup** (Business+)
- [docs/PATH_A_SETUP.md](docs/PATH_A_SETUP.md) — **Path A:** Vercel DNS + tunnel (`setup-path-a.sh`, verify script)
- [docs/TROUBLESHOOTING_MOBILE.md](docs/TROUBLESHOOTING_MOBILE.md) — phone / LTE issues

## Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server (local UI → localhost API) |
| `npm run build` | Production static `dist/` |
| `npm run server` | SocketHR API on port 3000 |

## Repo layout

- `ai_hiring_app.tsx` — React app
- `server/` — Express + PDF extract + LM Studio proxy
- `public/runtime-config.json` — production API base (`https://api.sockethr.com`)
