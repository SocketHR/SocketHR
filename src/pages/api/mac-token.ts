import { randomUUID } from "crypto";
import { SignJWT } from "jose";
import { getServerSession } from "next-auth/next";
import type { NextApiRequest, NextApiResponse } from "next";
import { authOptions } from "../../lib/auth-options";

const ISSUER = "sockethr-next";
const AUDIENCE = "sockethr-mac-api";
const TOKEN_TTL_SECONDS = 10 * 60;
const GUEST_COOKIE = "sockethr_guest_id";
const GUEST_MAX_AGE = 60 * 60 * 24 * 365;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function guestCookieHeader(uuid: string, clear: boolean): string {
  const value = clear ? "" : uuid;
  const maxAge = clear ? "Max-Age=0" : `Max-Age=${GUEST_MAX_AGE}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${GUEST_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; ${maxAge}${secure}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "Missing AUTH_SECRET" });
  }

  const session = await getServerSession(req, res, authOptions);
  const email = session?.user?.email;

  const now = Math.floor(Date.now() / 1000);

  if (email) {
    res.setHeader("Set-Cookie", guestCookieHeader("", true));
    const jwt = await new SignJWT({
      email,
      name: session.user?.name ?? "",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(email)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + TOKEN_TTL_SECONDS)
      .sign(new TextEncoder().encode(secret));

    return res.status(200).json({ token: jwt });
  }

  let guestId = String(req.cookies[GUEST_COOKIE] ?? "").trim();
  const setCookies: string[] = [];
  if (!UUID_RE.test(guestId)) {
    guestId = randomUUID();
    setCookies.push(guestCookieHeader(guestId, false));
  }

  const sub = `guest_${guestId}`;
  const jwt = await new SignJWT({
    name: "",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_TTL_SECONDS)
    .sign(new TextEncoder().encode(secret));

  if (setCookies.length) {
    res.setHeader("Set-Cookie", setCookies);
  }

  return res.status(200).json({ token: jwt });
}
