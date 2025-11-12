import { type IncomingHttpHeaders } from "http";

export interface IpInfo {
  clientIp: string | null;
  ipChain: string[];
}

/**
 * Extracts IP information from request headers and socket.
 * Handles Cloudflare proxy (CF-Connecting-IP) and AWS ALB (X-Forwarded-For).
 *
 * Priority for clientIp:
 * 1. CF-Connecting-IP (Cloudflare's original client IP)
 * 2. X-Forwarded-For (first IP, typically the original client)
 * 3. X-Real-IP
 * 4. socket.remoteAddress
 *
 * @param headers - HTTP request headers
 * @param remoteAddress - Socket remote address (optional)
 * @returns Object with clientIp and ipChain
 */
export function extractIpInfo(
  headers: IncomingHttpHeaders,
  remoteAddress?: string,
): IpInfo {
  const ips: string[] = [];
  const seenIps = new Set<string>();

  // Helper to add unique IPs
  const addIp = (ip: string | undefined | null) => {
    if (ip && typeof ip === "string") {
      const trimmed = ip.trim();
      if (trimmed && !seenIps.has(trimmed) && isValidIp(trimmed)) {
        ips.push(trimmed);
        seenIps.add(trimmed);
      }
    }
  };

  // 1. CF-Connecting-IP (Cloudflare's original client IP)
  const cfConnectingIp = headers["cf-connecting-ip"];
  if (cfConnectingIp) {
    addIp(Array.isArray(cfConnectingIp) ? cfConnectingIp[0] : cfConnectingIp);
  }

  // 2. X-Forwarded-For (comma-separated list, left-most is typically the client)
  const xForwardedFor = headers["x-forwarded-for"];
  if (xForwardedFor) {
    const forwardedIps = (
      Array.isArray(xForwardedFor) ? xForwardedFor.join(",") : xForwardedFor
    )
      .split(",")
      .map((ip) => ip.trim());
    forwardedIps.forEach(addIp);
  }

  // 3. X-Real-IP
  const xRealIp = headers["x-real-ip"];
  if (xRealIp) {
    addIp(Array.isArray(xRealIp) ? xRealIp[0] : xRealIp);
  }

  // 4. Socket remote address
  if (remoteAddress) {
    addIp(remoteAddress);
  }

  return {
    clientIp: ips.length > 0 ? ips[0] : null,
    ipChain: ips,
  };
}

/**
 * Basic IP validation to filter out obviously invalid IPs.
 * Validates both IPv4 and IPv6 formats.
 */
function isValidIp(ip: string): boolean {
  if (!ip || ip === "unknown") {
    return false;
  }

  // IPv4 validation
  const ipv4Regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (ipv4Regex.test(ip)) {
    return true;
  }

  // IPv6 validation (basic check)
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  const ipv6CompressedRegex =
    /^(?:[0-9a-fA-F]{1,4}:)*::(?:[0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}::$/;

  if (ipv6Regex.test(ip) || ipv6CompressedRegex.test(ip) || ip === "::1") {
    return true;
  }

  return false;
}
