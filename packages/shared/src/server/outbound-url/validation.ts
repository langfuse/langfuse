import dns from "node:dns/promises";
import { URL } from "node:url";
import { logger } from "../logger";
import {
  isHostnameBlocked,
  isIPBlocked,
  isIPAddress,
} from "../webhooks/ipBlocking";

export interface OutboundUrlValidationWhitelist {
  hosts: string[];
  ips: string[];
  ip_ranges: string[];
}

export interface ValidateOutboundUrlHostOptions {
  url: URL;
  whitelist: OutboundUrlValidationWhitelist;
  shouldThrowIfDnsResolutionFails: boolean;
  logContext: string;
  shouldSkipDnsCheckForLiteralIps: boolean;
}

export async function resolveHost(hostname: string): Promise<string[]> {
  // Returns every A + AAAA address.
  const [v4, v6, lookup] = await Promise.allSettled([
    dns.resolve4(hostname),
    dns.resolve6(hostname),
    // fetch resolves through getaddrinfo, which can include hosts file/NSS
    // entries that resolve4/resolve6 do not see. Include them so validation
    // checks the same local resolution sources that runtime requests can use.
    dns.lookup(hostname, { all: true }),
  ]);

  const ips = new Set<string>();
  if (v4.status === "fulfilled") {
    const validV4Ips = v4.value.filter((ip) => ip && typeof ip === "string");
    validV4Ips.forEach((ip) => ips.add(ip));
  }
  if (v6.status === "fulfilled") {
    const validV6Ips = v6.value.filter((ip) => ip && typeof ip === "string");
    validV6Ips.forEach((ip) => ips.add(ip));
  }
  if (lookup.status === "fulfilled") {
    lookup.value
      .map(({ address }) => address)
      .filter((ip) => ip && typeof ip === "string")
      .forEach((ip) => ips.add(ip));
  }

  if (!ips.size) throw new Error(`DNS lookup failed for ${hostname}`);
  return [...ips];
}

export function parseOutboundUrl(urlString: string): URL {
  const trimmedUrl = urlString.trim();
  assertValidUrlEncoding(trimmedUrl);

  let url: URL;
  try {
    // Parse the original URL string so validation uses the same WHATWG URL
    // semantics as fetch. Decoding the whole URL first can turn encoded data
    // into delimiters and make validation inspect a different hostname.
    url = new URL(trimmedUrl);
  } catch {
    throw new Error("Invalid URL syntax");
  }

  if (url.username !== "" || url.password !== "") {
    throw new Error(
      "URL credentials are not allowed. Use authentication headers instead.",
    );
  }

  return url;
}

export async function validateOutboundUrlHost({
  url,
  whitelist,
  shouldThrowIfDnsResolutionFails,
  logContext,
  shouldSkipDnsCheckForLiteralIps,
}: ValidateOutboundUrlHostOptions): Promise<void> {
  // WHATWG URL parsing already lowercases and punycodes HTTP(S) hostnames, so
  // host safety checks stay tied to the parsed URL component.
  const hostname = url.hostname;

  if (whitelist.hosts.includes(hostname)) {
    return;
  }

  if (isHostnameBlocked(hostname)) {
    throw new Error("Blocked hostname detected");
  }

  if (isIPAddress(hostname)) {
    if (isIPBlocked(hostname, whitelist.ips, whitelist.ip_ranges)) {
      logger.warn(
        `${logContext} validation blocked IP address in hostname: ${hostname}`,
      );
      throw new Error("Blocked IP address detected");
    }

    if (shouldSkipDnsCheckForLiteralIps) return;
  }

  let ips: string[];
  try {
    ips = await resolveHost(hostname);
  } catch (error) {
    if (!shouldThrowIfDnsResolutionFails) return;
    throw error;
  }

  for (const ip of ips) {
    if (isIPBlocked(ip, whitelist.ips, whitelist.ip_ranges)) {
      logger.warn(
        `${logContext} validation blocked resolved IP address: ${ip} for hostname: ${hostname}`,
      );
      throw new Error("Blocked IP address detected");
    }
  }
}

function assertValidUrlEncoding(urlString: string): void {
  // This intentionally checks encoding validity only. Do not parse or validate
  // the decoded result: decoding the whole URL can turn encoded data into URL
  // delimiters and make validation inspect a different hostname than fetch.
  try {
    decodeURIComponent(urlString);
  } catch {
    throw new Error("Invalid URL encoding");
  }
}
