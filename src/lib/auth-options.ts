import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  // Avoid unstable derived secret in production (see next-auth AuthOptions.secret).
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      // PKCE verifier cookies can fail on some CDN/proxy setups; confidential clients
      // may use state-only checks with Google (openid still works).
      checks: ["state"],
    }),
  ],
};
