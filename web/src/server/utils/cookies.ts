import { type IncomingMessage } from "http";

import { env } from "@/src/env.mjs";

/** projectCookieName names the region-unscoped cookie recording a user's most recent project. */
export const projectCookieName = "langfuse.project";

/** projectCookieMaxAgeSeconds keeps the project cookie alive for 30 days. */
const projectCookieMaxAgeSeconds = 60 * 60 * 24 * 30;

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
    // Namespaces the cookie NAME so instances that share a parent cookie domain
    // never read each other's session cookie (a foreign one, encrypted with a
    // different NEXTAUTH_SECRET, fails to decrypt -> JWT_SESSION_ERROR -> login
    // loop). The Langfuse Cloud region ALWAYS takes precedence, so any deployment
    // that sets NEXT_PUBLIC_LANGFUSE_CLOUD_REGION (US/EU/STAGING/HIPAA/JP) keeps
    // byte-identical cookie names — NEXTAUTH_COOKIE_NAME_SUFFIX can never change
    // them, even if it is also set by mistake. The suffix applies only to
    // self-hosted deployments with no region (e.g. per-PR preview environments).
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
      ? `.${env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}`
      : env.NEXTAUTH_COOKIE_NAME_SUFFIX
        ? `.${env.NEXTAUTH_COOKIE_NAME_SUFFIX}`
        : "",
  ].join("");

/** ProjectCookie carries the server-stamped origin and project id of a user's most recent project. */
export type ProjectCookie = {
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

/** readProjectCookie parses the project cookie, returning null when absent or malformed. */
export const readProjectCookie = (
  cookies: Partial<Record<string, string>>,
): ProjectCookie | null => {
  const raw = cookies[projectCookieName];
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as ProjectCookie).origin === "string" &&
      typeof (parsed as ProjectCookie).projectId === "string"
    ) {
      const { origin, projectId } = parsed as ProjectCookie;
      return { origin, projectId };
    }
  } catch {
    // malformed cookie -> treat as absent
  }
  return null;
};

/** serializeProjectCookie builds the Set-Cookie header value for the project cookie. */
export const serializeProjectCookie = (value: ProjectCookie): string => {
  const options = getCookieOptions();
  const parts = [
    `${projectCookieName}=${encodeURIComponent(JSON.stringify(value))}`,
    `Path=${options.path}`,
    "SameSite=Lax",
    `Max-Age=${projectCookieMaxAgeSeconds}`,
  ];
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
};
