# Path A checklist: Vercel DNS + Cloudflare Tunnel

No Cloudflare zone / nameserver change. See [CLOUDFLARE_ZONE_AND_VERCEL.md](./CLOUDFLARE_ZONE_AND_VERCEL.md).

## 1. One-time: Cloudflare login

```bash
brew install cloudflare/cloudflare/cloudflared   # if needed
cloudflared tunnel login
```

Complete the flow in the browser. This creates **`~/.cloudflared/cert.pem`**.

### “Authorize Cloudflare Tunnel” — pick a zone

Cloudflare opens a page like **`https://dash.cloudflare.com/argotunnel?...`** and asks:

> Please select the zone you want to add a Tunnel to.

That table only lists **domains that already exist as a zone in this Cloudflare account**. It does **not** pull from Vercel or your registrar by itself.

**Do this:** click the **`sockethr.com`** row in the **table on that page** (not the top “Search across all accounts” bar—that’s a different search).

#### No sockethr.com row (empty list or wrong account)

1. **Add the site in Cloudflare first** (still compatible with Path A — you do **not** have to change nameservers):
   - Dashboard **Account home** → **Add a site** / **Onboard a domain** (or **Websites** in the sidebar → **Add site**).
   - Enter **`sockethr.com`**, choose **Free**, complete **DNS record review** as far as Cloudflare asks, then **Continue to activation**.
   - For Path A you can **stop before** changing nameservers at the registrar; the zone may show as **Pending** / **Invalid nameservers** — that’s OK for listing it here.
2. **Confirm the right account** — top-right profile / account switcher. The zone must live under the **same** Cloudflare account you used for **`cloudflared tunnel login`**.
3. **Clear the wrong search** — if you typed in the **zone table** filter (under “Authorize…”), clear it so rows aren’t hidden.
4. Run **`cloudflared tunnel login`** again and open the **new** authorize URL (old links expire).

After `sockethr.com` appears, select that row and finish authorization.

- **Status shows “Invalid” (red)** — common when the domain is added to Cloudflare but **nameservers still point elsewhere** (e.g. Vercel). For Path A that’s expected. **Try selecting the row anyway**; many accounts still get `cert.pem` after authorization.
- If the UI **won’t let you select** it, you’ll need either a **fully active** zone (e.g. move nameservers to Cloudflare for Path B) or another domain already **Active** on the account, then retry `cloudflared tunnel login`.

## 2. One-time: tunnel + local config

From the **repo root**:

```bash
bash deploy/cloudflared/setup-path-a.sh
```

This creates **`sockethr-api`** (if missing), writes **`~/.cloudflared/config.yml`**, validates ingress, and prints the **Vercel CNAME** target.

### `missing credentials file: ~/.cloudflared/<uuid>.json`

The tunnel exists in Cloudflare but this Mac never got the secret file (created on another machine, file deleted, or create didn’t finish). **You can’t re-download the same secret.**

1. Stop **`cloudflared`** anywhere it might be running for this tunnel.
2. Delete the tunnel, then recreate:

   ```bash
   cloudflared tunnel delete sockethr-api
   # if it refuses (still connected): cloudflared tunnel delete sockethr-api -f
   bash deploy/cloudflared/setup-path-a.sh
   ```

3. If you already added a Vercel **CNAME** for `api`, update it to the **new** `<uuid>.cfargotunnel.com` from the script output.

## 3. Vercel DNS (manual)

In **Vercel** → project / domain → DNS for **`sockethr.com`**, add the record the script printed:

| Type   | Name | Value                          |
|--------|------|--------------------------------|
| CNAME  | api  | `<TUNNEL_UUID>.cfargotunnel.com` |

Use the **UUID** from the script output (not `https://`, no path). Do **not** point `api` at `cname.vercel-dns.com` if the tunnel should serve the API.

If **`curl https://api.sockethr.com/health`** returns **Vercel `DEPLOYMENT_NOT_FOUND`**, traffic is still hitting Vercel’s app router. **Remove `api.sockethr.com`** from any Vercel project’s **Domains** (Production) so only the **DNS CNAME** to `*.cfargotunnel.com` applies.

## 4. Every session

1. **LM Studio** + local model server (if you use it).
2. **API:** from repo root, `npm run server` (port **3000**).
3. **Tunnel:**

   ```bash
   cloudflared tunnel --config ~/.cloudflared/config.yml run
   ```

## 5. Verify

```bash
npm run verify:public-api
```

Or: `curl -sS https://api.sockethr.com/health` → expect `{"ok":true,"service":"sockethr-server"}`.

## Optional: Cloudflare dashboard cleanup

If you added **`sockethr.com`** as a site in Cloudflare but are **not** moving nameservers (Path A), you can **remove** that pending zone to avoid confusion, or ignore it—**public DNS stays Vercel** until the registrar uses Cloudflare’s nameservers.

## References

- [deploy/cloudflared/README.md](../deploy/cloudflared/README.md)
- [PUBLIC_TUNNEL.md](./PUBLIC_TUNNEL.md)
