# SocketHR

AI-assisted hiring web app with:

- Next.js frontend on Vercel
- Google sign-in via Auth.js (`next-auth`)
- Mac-hosted Express API behind `https://api.sockethr.com`
- local LLM scoring via LM Studio
- local resume persistence to USB (`SOCKETHR_DATA_DIR`)

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
| `npm run dev` | Next.js dev server (`http://localhost:3000`) |
| `npm run build` | Next.js production build |
| `npm run start` | Run Next.js production server |
| `npm run server` | SocketHR API on port 3000 |
| `npm run server:dev` | SocketHR API watch mode |

## Repo layout

- `src/pages/` — Next.js pages + API routes (`/api/auth/[...nextauth]`, `/api/mac-token`)
- `ai_hiring_app.tsx` — main hiring UI client component
- `server/` — Express + PDF extract + LM Studio proxy
- `public/runtime-config.json` — API base config (`https://api.sockethr.com` by default)
