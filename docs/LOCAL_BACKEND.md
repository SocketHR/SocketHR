# SocketHR local backend (LM Studio)

The React app talks to a small **Node server** on your Mac. That server saves job uploads under `data/jobs/` and calls **LM Studio**’s OpenAI-compatible API for inference.

## Prerequisites

1. **LM Studio** — load **gpt-oss-20b** (or your chosen model).
2. **Developer** tab in LM Studio → **Start server** (default `http://127.0.0.1:1234`).
3. Confirm the model id: open `http://127.0.0.1:1234/v1/models` and copy the exact `id` string.

## Configure the server

```bash
cd server
cp .env.example .env
# Edit .env: set LM_STUDIO_MODEL to match /v1/models
```

Environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `LM_STUDIO_BASE_URL` | `http://127.0.0.1:1234/v1` | LM Studio OpenAI base URL |
| `LM_STUDIO_MODEL` | `openai/gpt-oss-20b` | Model id sent in API requests |
| `PORT` | `3000` | HTTP port for SocketHR server |
| `HOST` | `0.0.0.0` | Bind address (`0.0.0.0` allows LAN access) |
| `SOCKETHR_DATA_DIR` | *(repo)*`data/jobs` | Where submissions are stored |
| `WAITLIST_SMTP_USER` / `WAITLIST_SMTP_PASS` | *(unset)* | Required for `/api/waitlist` email (e.g. Gmail + App Password) |
| `WAITLIST_SMTP_HOST` / `WAITLIST_SMTP_PORT` | `smtp.gmail.com` / `587` | SMTP endpoint |
| `WAITLIST_MAIL_FROM` | same as SMTP user | `From:` header |
| `WAITLIST_MAIL_TO` | `contact@sockethr.com` | `To:` recipient |

Load `.env` when starting Node (Node 20+):

```bash
cd server
npm install
node --env-file=.env index.js
```

Or export variables in your shell before `npm start`.

## Run everything

**Terminal 1 — backend**

```bash
# from repo root
npm run server
# or watch mode:
npm run server:dev
```

**Terminal 2 — frontend**

```bash
npm run dev
```

Open `http://localhost:3000`.

By default the UI uses **`https://api.sockethr.com`** (from `public/runtime-config.json`), same as production.

To force local API during dev:

```bash
NEXT_PUBLIC_SOCKETHR_API_BASE=http://127.0.0.1:3000 npm run dev
```

## Point the frontend at another host

If the browser is not on the same machine as the API, start the frontend with:

```bash
NEXT_PUBLIC_SOCKETHR_API_BASE=http://192.168.1.10:3000 npm run dev
```

## API

| Method | Path | Body |
|--------|------|------|
| `GET` | `/health` | — |
| `POST` | `/api/analyze` | `{ job, resumes: [{ name, base64, type }] }` + `Authorization: Bearer <token>` |
| `POST` | `/api/chat` | `{ job, selected, messages: [{ role, content }] }` + bearer token |
| `POST` | `/api/email` | `{ job, selected }` + bearer token |
| `POST` | `/api/waitlist` | `{ firstName, lastName, company?, email, phone? }` |

PDFs are **text-extracted on the server** (no vision); use PDF or `.txt` for best results.

## Stored data

Each analyze run creates `SOCKETHR_DATA_DIR/<uploader>/<uuid>/` with:

- `job.json` — job fields + metadata  
- `resumes/<applicant-email>/` — only resumes where applicant email is detected
- `results.json` — merged candidate list after analysis  

`data/` is gitignored.

Resumes without detected applicant email are still ranked but not stored.

## Running the server always-on (macOS)

- **PM2:** `npm i -g pm2 && pm2 start server/index.js --name sockethr --cwd /path/to/sockethr/server` (use `--env-file` or env in ecosystem file).  
- **launchd:** add a plist that runs `node` with `--env-file=.env` and `WorkingDirectory` set to `server/`.

LM Studio must also be running (or use LM Studio CLI/headless if you automate loading the model).

## Auth secret sync (required)

The Mac API verifies signed tokens from the Next.js app.  
Set the same secret value in both places:

- Vercel: `NEXTAUTH_SECRET`
- Mac `server/.env`: `AUTH_SECRET=<same value>`

## Advertising waitlist email (Gmail SMTP)

The `/advertising` waitlist form `POST`s JSON to **`POST /api/waitlist`** on the same host as `apiBase` (see [`public/runtime-config.json`](../public/runtime-config.json)). The Node server sends mail with **Nodemailer** over SMTP (defaults work for **Gmail**).

1. In Google Account → **Security**, enable **2-Step Verification**, then create an [**App password**](https://support.google.com/accounts/answer/185833) for Mail.
2. In `server/.env` set at minimum **`WAITLIST_SMTP_USER`** (full Gmail) and **`WAITLIST_SMTP_PASS`** (app password). Optional: **`WAITLIST_MAIL_FROM`** (defaults to user), **`WAITLIST_MAIL_TO`** (defaults to `contact@sockethr.com`), **`WAITLIST_SMTP_HOST`** / **`WAITLIST_SMTP_PORT`**.
3. Restart the server (`npm run server` or your process manager). If credentials are missing, the route returns **503** and the UI shows a generic error.

## Public site (sockethr.com) + phone on LTE

See **[PUBLIC_TUNNEL.md](./PUBLIC_TUNNEL.md)** — HTTPS tunnel to your Mac, `NEXT_PUBLIC_SOCKETHR_API_BASE`, **`runtime-config.json`**, and optional GitHub Pages workflow. If the phone site fails, use **[TROUBLESHOOTING_MOBILE.md](./TROUBLESHOOTING_MOBILE.md)**.
