import { env } from "@/src/env.mjs";
import { getBaseUrl } from "@/src/utils/base-url";
import {
  ForbiddenError,
  MAX_MCP_REQUEST_ELEMENTS,
  PayloadTooLargeError,
} from "@langfuse/shared";
import { type NextApiRequest, type NextApiResponse } from "next";

const LOCALHOST_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"] as const;

/** Validates MCP requests and preserves CORS headers on allowed-origin body errors. */
export function validateMcpRequestSecurity(
  req: NextApiRequest,
  res: NextApiResponse,
): string | null {
  const allowedOrigin = validateMcpRequestOrigin(req);
  applyMcpCorsHeaders(res, allowedOrigin);
  validateMcpRequestBody(req.body);
  return allowedOrigin;
}

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

function validateMcpRequestOrigin(req: NextApiRequest): string | null {
  const originHeader = Array.isArray(req.headers.origin)
    ? req.headers.origin[0]
    : req.headers.origin;

  if (env.LANGFUSE_MCP_ALLOWED_HOSTS.includes("*")) {
    return originHeader ?? null;
  }

  const { allowedHostnames, allowedOrigins } =
    getAllowedMcpOriginsAndHostnames();

  const hostHeader = Array.isArray(req.headers.host)
    ? req.headers.host[0]
    : req.headers.host;
  if (!hostHeader) {
    throw new ForbiddenError("Missing Host header");
  }

  let hostname: string;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    throw new ForbiddenError(`Invalid Host header: ${hostHeader}`);
  }

  if (!allowedHostnames.has(hostname)) {
    throw new ForbiddenError(`Invalid Host header: ${hostHeader}`);
  }

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

function applyMcpCorsHeaders(
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

/** Bounds structure before SDK schema validation; the route separately caps bytes. */
function validateMcpRequestBody(body: unknown): void {
  const pending: unknown[] = [body];
  let elements = 0;

  while (pending.length > 0) {
    const value = pending.pop();
    if (value === null || typeof value !== "object") continue;

    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      if (++elements > MAX_MCP_REQUEST_ELEMENTS) {
        throw new PayloadTooLargeError(
          `MCP request exceeds ${MAX_MCP_REQUEST_ELEMENTS} object members and array elements across the entire request. ` +
            "No tools in this request were executed. Split batches into smaller requests before retrying. " +
            "If a single item cannot fit, ask the user how to proceed. Do not truncate data or retry the same request unchanged.",
        );
      }

      const child = (value as Record<string, unknown>)[key];
      if (child !== null && typeof child === "object") pending.push(child);
    }
  }
}
