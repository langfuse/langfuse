import { env } from "@/src/env.mjs";
import { ForbiddenError } from "@langfuse/shared";
import { type NextApiRequest, type NextApiResponse } from "next";

const MCP_ALLOW_METHODS = "GET, POST, DELETE, OPTIONS";
const MCP_ALLOW_HEADERS =
  "Content-Type, Authorization, Accept, Mcp-Session-Id, Last-Event-ID";
const MCP_EXPOSE_HEADERS = "Mcp-Session-Id";
const LOCALHOST_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"] as const;

function getSingleHeader(
  header: string | string[] | undefined,
): string | undefined {
  if (!header) {
    return undefined;
  }

  return Array.isArray(header) ? header[0] : header;
}

function parseConfiguredBaseUrl(value: string): URL {
  if (/^https?:\/\//i.test(value)) {
    return new URL(value);
  }

  const protocol = LOCALHOST_HOSTNAMES.some((hostname) =>
    new RegExp(
      `^${hostname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?::|/|$)`,
    ).test(value),
  )
    ? "http"
    : "https";

  return new URL(`${protocol}://${value}`);
}

function parseHostname(hostHeader: string): string {
  try {
    return new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    throw new ForbiddenError(`Invalid Host header: ${hostHeader}`);
  }
}

function parseOrigin(originHeader: string): string {
  try {
    return new URL(originHeader).origin.toLowerCase();
  } catch {
    throw new ForbiddenError(`Invalid Origin header: ${originHeader}`);
  }
}

function getAllowedMcpOriginsAndHostnames() {
  const baseUrl = parseConfiguredBaseUrl(env.NEXTAUTH_URL);
  const allowedHostnames = new Set([baseUrl.hostname.toLowerCase()]);
  const allowedOrigins = new Set([baseUrl.origin.toLowerCase()]);

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

  return {
    allowedHostnames,
    allowedOrigins,
  };
}

export function validateMcpRequestSecurity(req: NextApiRequest): string | null {
  const { allowedHostnames, allowedOrigins } =
    getAllowedMcpOriginsAndHostnames();

  const hostHeader = getSingleHeader(req.headers.host);
  if (!hostHeader) {
    throw new ForbiddenError("Missing Host header");
  }

  const hostname = parseHostname(hostHeader);
  if (!allowedHostnames.has(hostname)) {
    throw new ForbiddenError(`Invalid Host header: ${hostHeader}`);
  }

  const originHeader = getSingleHeader(req.headers.origin);
  if (!originHeader) {
    return null;
  }

  const origin = parseOrigin(originHeader);
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

  res.setHeader("Access-Control-Allow-Methods", MCP_ALLOW_METHODS);
  res.setHeader("Access-Control-Allow-Headers", MCP_ALLOW_HEADERS);
  res.setHeader("Access-Control-Expose-Headers", MCP_EXPOSE_HEADERS);
}
