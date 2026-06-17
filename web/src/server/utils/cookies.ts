import { type IncomingMessage } from "http";

import { env } from "@/src/env.mjs";

/** lastProjectCookieName names the region-unscoped cookie recording a user's most recent project. */
export const lastProjectCookieName = "langfuse.last-project";

/** lastProjectCookieMaxAgeSeconds keeps the last-project cookie alive for 30 days. */
const lastProjectCookieMaxAgeSeconds = 60 * 60 * 24 * 30;

// Use secure cookies on https hostnames, exception for Vercel which sets NEXTAUTH_URL without the protocol
const shouldSecureCookies = () =>
  env.NEXTAUTH_URL.startsWith("https://") || process.env.VERCEL === "1";

export const getCookieOptions = () => ({
  domain: env.NEXTAUTH_COOKIE_DOMAIN ?? undefined,
  httpOnly: true,
  sameSite: "lax" as const,
  path: env.NEXT_PUBLIC_BASE_PATH || "/",
  secure: shouldSecureCookies(),
});

export const getCookieName = (name: string) =>
  [
    shouldSecureCookies() ? "__Secure-" : "",
    name,
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
      ? `.${env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}`
      : "",
  ].join("");

/** LastProjectCookie carries the server-stamped origin and project id of a user's most recent project. */
export type LastProjectCookie = {
  origin: string;
  projectId: string;
};

/** getRequestOrigin derives the request's own origin from forwarded headers, never from client input. */
export const getRequestOrigin = (req: IncomingMessage): string | null => {
  const headers = req.headers;
  const hostHeader = Array.isArray(headers.host)
    ? headers.host[0]
    : headers.host;
  if (!hostHeader) return null;

  const forwardedProto = Array.isArray(headers["x-forwarded-proto"])
    ? headers["x-forwarded-proto"][0]
    : headers["x-forwarded-proto"];
  const proto =
    forwardedProto?.split(",")[0]?.trim() ||
    (shouldSecureCookies() ? "https" : "http");

  try {
    return new URL(`${proto}://${hostHeader}`).origin;
  } catch {
    return null;
  }
};

/** readLastProjectCookie parses the last-project cookie, returning null when absent or malformed. */
export const readLastProjectCookie = (
  cookies: Partial<Record<string, string>>,
): LastProjectCookie | null => {
  const raw = cookies[lastProjectCookieName];
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as LastProjectCookie).origin === "string" &&
      typeof (parsed as LastProjectCookie).projectId === "string"
    ) {
      const { origin, projectId } = parsed as LastProjectCookie;
      return { origin, projectId };
    }
  } catch {
    // malformed cookie -> treat as absent
  }
  return null;
};

/** serializeLastProjectCookie builds the Set-Cookie header value for the last-project cookie. */
export const serializeLastProjectCookie = (
  value: LastProjectCookie,
): string => {
  const options = getCookieOptions();
  const parts = [
    `${lastProjectCookieName}=${encodeURIComponent(JSON.stringify(value))}`,
    `Path=${options.path}`,
    "SameSite=Lax",
    `Max-Age=${lastProjectCookieMaxAgeSeconds}`,
  ];
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
};
