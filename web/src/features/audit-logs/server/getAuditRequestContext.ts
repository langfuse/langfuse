import { type IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";
import { type AuditRequestContext } from "@langfuse/shared";
import { getActiveTraceId } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";

const IPV4 = String.raw`\d{1,3}(?:\.\d{1,3}){3}`;
const BRACKETED_IPV6_WITH_OPTIONAL_PORT = /^\[([^\]]+)\](?::\d+)?$/;
const IPV4_WITH_PORT = new RegExp(`^(${IPV4}):\\d+$`);
const IPV4_MAPPED_IPV6 = new RegExp(`^::ffff:(${IPV4})$`, "i");

/**
 * Request metadata for audit events: the client IP, the User-Agent, and the
 * active OTel trace id as request id (absent when the trace is not sampled).
 *
 * The client IP follows LANGFUSE_TRUSTED_PROXY_COUNT. With 0, X-Forwarded-For
 * is ignored and `remoteAddress` (the socket peer) is used.
 */
export function getAuditRequestContext(
  headers: IncomingHttpHeaders,
  remoteAddress?: string,
): AuditRequestContext {
  return {
    ip: getClientIp(headers, remoteAddress),
    userAgent: headers["user-agent"] || undefined,
    requestId: getActiveTraceId(),
  };
}

// Each trusted proxy appends the address it received the request from, so
// with N trusted proxies the client is the N-th X-Forwarded-For entry from the
// right. Entries further left were sent by the client and can be forged.
const getClientIp = (
  headers: IncomingHttpHeaders,
  remoteAddress: string | undefined,
): string | undefined => {
  const trustedProxyCount = env.LANGFUSE_TRUSTED_PROXY_COUNT;
  if (trustedProxyCount === 0) return normalizeIp(remoteAddress);

  const forwardedFor = headers["x-forwarded-for"];
  const hops = (
    Array.isArray(forwardedFor) ? forwardedFor.join(",") : (forwardedFor ?? "")
  )
    .split(",")
    .map((hop) => hop.trim())
    .filter((hop) => hop.length > 0);

  // No header means the request did not pass through the proxies.
  if (hops.length === 0) return normalizeIp(remoteAddress);

  return normalizeIp(hops[Math.max(0, hops.length - trustedProxyCount)]);
};

// Accepts the address forms proxies and Node report: plain IPv4/IPv6, IPv4
// with a port, bracketed IPv6 with an optional port, and IPv4-mapped IPv6
// (how Node reports IPv4 peers on a dual-stack socket). Anything else is
// dropped rather than stored.
const normalizeIp = (raw: string | undefined): string | undefined => {
  let value = raw?.trim();
  if (!value) return undefined;

  const bracketed = BRACKETED_IPV6_WITH_OPTIONAL_PORT.exec(value);
  const withPort = IPV4_WITH_PORT.exec(value);
  if (bracketed) value = bracketed[1];
  else if (withPort) value = withPort[1];

  const mapped = IPV4_MAPPED_IPV6.exec(value);
  if (mapped) value = mapped[1];

  return isIP(value) ? value : undefined;
};
