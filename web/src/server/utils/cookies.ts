import { env } from "@/src/env.mjs";

// Use secure cookies on https hostnames, exception for Vercel which sets NEXTAUTH_URL without the protocol
const shouldSecureCookies =
  env.NEXTAUTH_URL.startsWith("https://") || process.env.VERCEL === "1";

export const cookieOptions = {
  domain: env.NEXTAUTH_COOKIE_DOMAIN ?? undefined,
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: shouldSecureCookies,
};

export const getCookieName = (name: string) =>
  [
    shouldSecureCookies ? "__Secure-" : "",
    name,
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
      ? `.${env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}`
      : "",
  ].join("");
