import { SignJWT } from "jose";
import { getServerSession } from "next-auth/next";
import type { NextApiRequest, NextApiResponse } from "next";
import { authOptions } from "../../lib/auth-options";

const ISSUER = "sockethr-next";
const AUDIENCE = "sockethr-mac-api";
const TOKEN_TTL_SECONDS = 10 * 60;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  const email = session?.user?.email;
  if (!email) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "Missing AUTH_SECRET" });
  }

  const now = Math.floor(Date.now() / 1000);
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
