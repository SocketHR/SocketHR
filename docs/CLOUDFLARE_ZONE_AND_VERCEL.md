# Cloudflare zone for `sockethr.com` + Vercel DNS

## Important: “Partial / CNAME setup” is not on Free

Cloudflare’s official **CNAME setup (partial zone)** — keep your **authoritative DNS at Vercel** while proxying chosen hostnames through Cloudflare — is only available on **Business** and **Enterprise** plans, not Free or Pro.

Docs: [CNAME setup (Partial) — Availability](https://developers.cloudflare.com/dns/zone-setups/partial-setup/)

So:

| Goal | Free / Pro | Business+ |
|------|------------|-------------|
| Proxy `www` / apex through Cloudflare **without** moving nameservers | Not via official partial setup | Use **CNAME setup (partial)** |
| **`api.sockethr.com` → Mac via Cloudflare Tunnel** | **Yes** — CNAME `api` → `<tunnel-uuid>.cfargotunnel.com` at Vercel ([`deploy/cloudflared/README.md`](../deploy/cloudflared/README.md)) | Same |
| Full Cloudflare proxy + DNS at Cloudflare | **Yes** — move **nameservers** to Cloudflare and copy DNS records | Same |

---

## Stay on Free: pick one path

**Forget partial/CNAME setup** — not on Free. You choose **either** Vercel stays DNS **or** Cloudflare becomes DNS (still Free).

### Path A — Simplest (recommended): Vercel stays authoritative DNS

1. **Do not** rely on Cloudflare partial zone (unavailable on Free).
2. **API via tunnel:** at **Vercel** → DNS → CNAME **`api`** → `<your-tunnel-uuid>.cfargotunnel.com` ([`deploy/cloudflared/README.md`](../deploy/cloudflared/README.md)).
3. **Tunnel hostname in config:** use `hostname: api.sockethr.com` in `cloudflared` ingress (or Zero Trust dashboard if the zone lets you pick the domain).
4. **Pending `sockethr.com` site in Cloudflare?** If you only need Path A, you can **remove** the unused zone (or leave it pending) — public DNS stays Vercel either way until you change nameservers.

### Path B — Full zone on Free: Cloudflare becomes DNS

1. Finish onboarding → set **registrar nameservers** to the two Cloudflare NS values.
2. In **Cloudflare → DNS**, match what Vercel had (apex, `www`, `api` CNAME to tunnel target, etc.). Set **orange vs gray cloud** carefully so `www` / apex still work with Vercel if that’s how you host the site.
3. **Stop** editing the same names at Vercel for public resolution (Vercel project can stay; DNS for the domain is now Cloudflare).

### Path B — Dashboard: add site and activate

1. **Account home** → **Onboard a domain** (or **Add site**).
2. Enter **`sockethr.com`**, choose how to import DNS (e.g. automatic scan).
3. **Review DNS records** — be careful:
   - **Orange-cloud (proxied)** A/AAAA records send web traffic through Cloudflare to those IPs. If those IPs are **Vercel**, you usually want records aligned with how Vercel expects traffic, or you’ll break the site.
   - For a **Vercel-hosted** site, many people use **DNS only** (gray cloud) for records that must match Vercel’s docs, or they **move NS to Cloudflare** and recreate the same records Cloudflare scanned (then tune proxy status).
4. **Select Free plan** → **Continue to activation**.
5. Cloudflare will ask you to set **nameservers** at your **registrar** to the two Cloudflare nameservers.

Until nameservers point to Cloudflare, the zone stays **pending** and Cloudflare is not authoritative for public DNS.

**If you do not change nameservers:** global DNS still follows Vercel; a pending Cloudflare zone does not replace that. For tunnel-only needs on Free, **Path A** is usually enough.

---

## Practical recommendation for SocketHR (Free)

1. **API on the Mac:** Path A — tunnel + **Vercel CNAME** for `api` → `…cfargotunnel.com`.
2. **Want Cloudflare features for the whole domain on Free:** Path B — **nameserver change** (full primary zone). **Business+** only if you need authoritative DNS to stay at Vercel **and** Cloudflare proxy (partial setup).

---

## References

- [Partial setup — setup steps](https://developers.cloudflare.com/dns/zone-setups/partial-setup/setup/) (Business+)
- [PUBLIC_TUNNEL.md](./PUBLIC_TUNNEL.md)
- [STARTUP.md](./STARTUP.md)
