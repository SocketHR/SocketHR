# Troubleshooting: sockethr.com broken on phone / LTE

## Step 1 — Verify what host the live site calls (verify-bundle)

1. On a desktop, open **[https://sockethr.com](https://sockethr.com)**.
2. Open **DevTools** (Chrome: `Cmd+Option+I`) → **Network**.
3. Use the app until it calls the API (e.g. **Analyze**).
4. Click the request (e.g. `analyze`) and check **Request URL**:
   - If it shows **`http://127.0.0.1:3000`** or **`localhost`**, phones will never work (that is the phone’s own machine, not your Mac).

**Fix without rebuilding JS:** edit **`runtime-config.json`** on your static host (see below).

**Fix with a rebuild:** `VITE_SOCKETHR_API_BASE=https://YOUR_API_HOST npm run build` and redeploy `dist/`.

---

## Step 2 — Runtime API URL (`runtime-config.json`)

The app loads **`/runtime-config.json`** from the **same origin** as the website (e.g. `https://sockethr.com/runtime-config.json`).

Production builds load [`public/runtime-config.json`](../public/runtime-config.json) (committed **`https://api.sockethr.com`**). **`npm run dev`** does not apply that file — local dev uses **localhost:3000** (or `VITE_SOCKETHR_API_BASE`).

**To point production at your tunnel** (HTTPS, no trailing slash):

1. After `npm run build`, edit **`dist/runtime-config.json`** before upload, **or** upload a custom file to your host:

   ```json
   { "apiBase": "https://api.sockethr.com" }
   ```

2. Hard-refresh the phone (or use a private tab).

The UI shows an **amber banner** when the page is **not** opened on localhost but the resolved API URL still contains `localhost` / `127.0.0.1`.

---

## Step 3 — Public API must respond (tunnel + Mac)

From **LTE** or any network **outside** your home:

```bash
curl -sS https://YOUR_API_HOST/health
```

Expect: `{"ok":true,"service":"sockethr-server"}`.

- **Fails:** On the Mac, start your **tunnel** (Cloudflare / ngrok / Tailscale Funnel) to **`http://127.0.0.1:3000`**. Reboots stop the tunnel unless you use **launchd** / **pm2**.

On the **Mac**:

```bash
curl -s http://127.0.0.1:3000/health    # npm run server
curl -s http://127.0.0.1:1234/v1/models  # LM Studio server ON
```

---

## Step 4 — Rebuild + redeploy (rebuild-deploy)

If you prefer the API URL **inside** the JS bundle only:

```bash
VITE_SOCKETHR_API_BASE=https://YOUR_API_HOST npm run build
```

Deploy **`dist/`**. Do **not** use `VAR=value tsc && vite build` — the variable must apply to the whole `npm run build`.

For **GitHub Actions**, set repository secret **`VITE_SOCKETHR_API_BASE`** (see [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml)).

---

## Summary

| Check | What you want |
|--------|----------------|
| Network tab on sockethr.com | Request URL = your **https://** API host |
| `curl https://api.../health` from LTE | JSON `ok: true` |
| Mac | `npm run server` + LM Studio server **on** + tunnel running |

More context: [PUBLIC_TUNNEL.md](./PUBLIC_TUNNEL.md).
