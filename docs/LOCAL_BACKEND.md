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

Open the Vite URL (e.g. `http://localhost:5173`). The UI calls `http://127.0.0.1:3000` by default.

## Point the frontend at another host

If the browser is not on the same machine as the API, create `.env` in the **repo root**:

```env
VITE_SOCKETHR_API_BASE=http://192.168.1.10:3000
```

Restart `npm run dev`.

## API

| Method | Path | Body |
|--------|------|------|
| `GET` | `/health` | — |
| `POST` | `/api/analyze` | `{ job, resumes: [{ name, base64, type }] }` |
| `POST` | `/api/chat` | `{ job, selected, messages: [{ role, content }] }` |
| `POST` | `/api/email` | `{ job, selected }` |

PDFs are **text-extracted on the server** (no vision); use PDF or `.txt` for best results.

## Stored data

Each analyze run creates `data/jobs/<uuid>/` with:

- `job.json` — job fields + metadata  
- `resumes/` — uploaded files  
- `results.json` — merged candidate list after analysis  

`data/` is gitignored.

## Running the server always-on (macOS)

- **PM2:** `npm i -g pm2 && pm2 start server/index.js --name sockethr --cwd /path/to/sockethr/server` (use `--env-file` or env in ecosystem file).  
- **launchd:** add a plist that runs `node` with `--env-file=.env` and `WorkingDirectory` set to `server/`.

LM Studio must also be running (or use LM Studio CLI/headless if you automate loading the model).

## Public site (sockethr.com) + phone on LTE

See **[PUBLIC_TUNNEL.md](./PUBLIC_TUNNEL.md)** — HTTPS tunnel to your Mac, `VITE_SOCKETHR_API_BASE`, and optional GitHub Pages workflow.
