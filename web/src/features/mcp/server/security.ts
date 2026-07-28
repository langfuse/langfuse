import { env } from "@/src/env.mjs";
import { getBaseUrl } from "@/src/utils/base-url";
import { ForbiddenError } from "@langfuse/shared";
import { type NextApiRequest, type NextApiResponse } from "next";

const LOCALHOST_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"] as const;

function parseAllowedMcpHostEntry(
  entry: string,
  fallbackProtocol: string,
): { hostname: string; origin: string } | null {
  const trimmedEntry = entry.trim();
  let url: URL;
  try {
    url = new URL(
      /^https?:\/\//i.test(trimmedEntry)
        ? trimmedEntry
        : `${fallbackProtocol}//${trimmedEntry}`,
    );
  } catch {
    return null;
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.hostname.includes("*")
  ) {
    return null;
  }

  return {
    hostname: url.hostname.toLowerCase(),
    origin: url.origin.toLowerCase(),
  };
}

function getAllowedMcpOriginsAndHostnames() {
  const baseUrl = getBaseUrl();
  const allowedHostnames = new Set([baseUrl.hostname.toLowerCase()]);
  const allowedOrigins = new Set([baseUrl.origin.toLowerCase()]);

  for (const entry of env.LANGFUSE_MCP_ALLOWED_HOSTS) {
    const allowedHost = parseAllowedMcpHostEntry(entry, baseUrl.protocol);
    if (!allowedHost) continue;

    allowedHostnames.add(allowedHost.hostname);
    allowedOrigins.add(allowedHost.origin);
  }

  if (env.NODE_ENV !== "production") {
    const localPort =
      baseUrl.port ||
      process.env.PORT ||
      (baseUrl.protocol === "https:" ? "443" : "80");

    for (const hostname of LOCALHOST_HOSTNAMES) {
      allowedHostnames.add(hostname.toLowerCase());
      allowedOrigins.add(`http://${hostname}:${localPort}`);
      allowedOrigins.add(`https://${hostname}:${localPort}`);
    }
  }

  return { allowedHostnames, allowedOrigins };
}

/**
 * Resolves the host header to validate against the allowlist.
 *
 * Reverse proxies (ALB, Cloudflare, Traefik, nginx, k8s ingresses) commonly
 * rewrite `Host` to the internal upstream name and relay the original client
 * host in `X-Forwarded-Host`. We only honor `X-Forwarded-Host` when the
 * operator has opted in via LANGFUSE_MCP_TRUST_FORWARDED_HEADERS, because the
 * header is client-settable and blindly trusting it would let attackers
 * bypass the Host allowlist (DNS-rebinding protection). Mirrors the
 * first-comma-value convention of getRequestOrigin in server/utils/cookies.
 */
function getEffectiveHostHeader(req: NextApiRequest): {
  headerName: "Host" | "X-Forwarded-Host";
  value: string | undefined;
} {
  if (env.LANGFUSE_MCP_TRUST_FORWARDED_HEADERS === "true") {
    const rawForwardedHost = Array.isArray(req.headers["x-forwarded-host"])
      ? req.headers["x-forwarded-host"][0]
      : req.headers["x-forwarded-host"];
    const forwardedHost = rawForwardedHost?.split(",")[0]?.trim();
    if (forwardedHost) {
      return { headerName: "X-Forwarded-Host", value: forwardedHost };
    }
  }

  return {
    headerName: "Host",
    value: Array.isArray(req.headers.host)
      ? req.headers.host[0]
      : req.headers.host,
  };
}

export function validateMcpRequestSecurity(req: NextApiRequest): string | null {
  const { allowedHostnames, allowedOrigins } =
    getAllowedMcpOriginsAndHostnames();

  const { headerName, value: hostHeader } = getEffectiveHostHeader(req);
  if (!hostHeader) {
    throw new ForbiddenError("Missing Host header");
  }

  let hostname: string;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    throw new ForbiddenError(`Invalid ${headerName} header: ${hostHeader}`);
  }

  if (!allowedHostnames.has(hostname)) {
    throw new ForbiddenError(`Invalid ${headerName} header: ${hostHeader}`);
  }

  const originHeader = Array.isArray(req.headers.origin)
    ? req.headers.origin[0]
    : req.headers.origin;
  if (!originHeader) {
    return null;
  }

  let origin: string;
  try {
    origin = new URL(originHeader).origin.toLowerCase();
  } catch {
    throw new ForbiddenError(`Invalid Origin header: ${originHeader}`);
  }

  if (!allowedOrigins.has(origin)) {
    throw new ForbiddenError(`Invalid Origin header: ${originHeader}`);
  }

  return origin;
}

export function applyMcpCorsHeaders(
  res: NextApiResponse,
  allowedOrigin: string | null,
): void {
  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept, Mcp-Session-Id, Last-Event-ID",
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}
