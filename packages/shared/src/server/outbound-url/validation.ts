import dns from "node:dns/promises";
import { URL } from "node:url";
import { env } from "../../env";
import { logger } from "../logger";
import {
  isHostnameBlocked,
  isIPBlocked,
  isIPAddress,
} from "../webhooks/ipBlocking";

export type OutboundUrlValidationErrorCode =
  | "blocked-hostname"
  | "blocked-ip"
  | "dns-lookup-failed"
  | "host-not-allowed"
  | "https-required"
  | "invalid-encoding"
  | "invalid-syntax"
  | "port-not-allowed"
  | "protocol-not-allowed"
  | "url-credentials-not-allowed";

export class OutboundUrlValidationError extends Error {
  constructor(
    readonly code: OutboundUrlValidationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OutboundUrlValidationError";
  }
}

// Prefix of the message thrown on DNS-resolution failure. Exported so consumers
// can detect this failure by message when the typed `code` is lost — e.g. after
// RedirectValidationError re-wraps the inner error by message text only.
export const DNS_LOOKUP_FAILED_MESSAGE_PREFIX = "DNS lookup failed for";
const HOST_NOT_IN_ALLOWLIST_MESSAGE =
  "Host is not in the outbound URL allowlist";
/** Bucket names the AWS SDK virtual-hosts as `{bucket}.{endpoint host}`. */
const DNS_COMPATIBLE_BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const IP_SHAPED_BUCKET_NAME = /(?:\d+\.){3}\d+/;
const ADJACENT_DOTS = /\.\./;

export interface OutboundUrlValidationWhitelist {
  hosts: string[];
  ips: string[];
  ip_ranges: string[];
  // Positive host list. Empty or omitted keeps the default-allow behavior:
  // any public host is accepted, and `hosts` only exempts private targets.
  allowedHosts?: string[];
  // Listed hosts whose S3 virtual-hosted names `{bucket}.{host}` also pass
  // the positive list. Unlike exact entries, those names still get the
  // private-address block: whoever controls the parent zone's DNS, or picks
  // the bucket name, decides where they resolve. Only read when
  // `allowedHosts` is non-empty.
  allowedBucketHostParents?: string[];
}

export interface ValidateOutboundUrlHostOptions {
  url: URL;
  whitelist: OutboundUrlValidationWhitelist;
  logContext: string;
  shouldSkipDnsCheckForLiteralIps: boolean;
}

interface ValidateOutboundResolvedIpOptions {
  hostname: string;
  ip: string;
  whitelist: OutboundUrlValidationWhitelist;
  logContext: string;
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

  if (!ips.size) {
    throw new OutboundUrlValidationError(
      "dns-lookup-failed",
      `${DNS_LOOKUP_FAILED_MESSAGE_PREFIX} ${hostname}`,
    );
  }
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
    throw new OutboundUrlValidationError(
      "invalid-syntax",
      "Invalid URL syntax",
    );
  }

  if (url.username !== "" || url.password !== "") {
    throw new OutboundUrlValidationError(
      "url-credentials-not-allowed",
      "URL credentials are not allowed. Use authentication headers instead.",
    );
  }

  return url;
}

export async function validateOutboundUrlHost({
  url,
  whitelist,
  logContext,
  shouldSkipDnsCheckForLiteralIps,
}: ValidateOutboundUrlHostOptions): Promise<void> {
  // WHATWG URL parsing already lowercases and punycodes HTTP(S) hostnames, so
  // host safety checks stay tied to the parsed URL component.
  const hostname = url.hostname;

  if (enforcePositiveAllowlist(hostname, whitelist) === "allowed") {
    return;
  }

  if (whitelist.hosts.includes(hostname)) {
    return;
  }

  if (isHostnameBlocked(hostname)) {
    throw new OutboundUrlValidationError(
      "blocked-hostname",
      "Blocked hostname detected",
    );
  }

  if (isIPAddress(hostname)) {
    validateOutboundResolvedIp({
      hostname,
      ip: hostname,
      whitelist,
      logContext,
    });

    if (shouldSkipDnsCheckForLiteralIps) return;
  }

  // DNS-resolution failure is treated as a hard validation error: silently
  // returning here would let attacker-controlled or split-horizon DNS bypass
  // the IP blocklist (DNS-rebinding SSRF). Self-hosted gateways that the
  // validator cannot resolve must be added to the host whitelist above.
  const ips = await resolveHost(hostname);

  for (const ip of ips) {
    validateOutboundResolvedIp({
      hostname,
      ip,
      whitelist,
      logContext,
    });
  }
}

export function validateOutboundResolvedIp({
  hostname,
  ip,
  whitelist,
  logContext,
}: ValidateOutboundResolvedIpOptions): void {
  if (enforcePositiveAllowlist(hostname, whitelist) === "allowed") {
    return;
  }

  if (whitelist.hosts.includes(hostname)) {
    return;
  }

  if (
    isIPBlocked(
      ip,
      whitelist.ips,
      whitelist.ip_ranges,
      env.LANGFUSE_OUTBOUND_BLOCKED_IP_SEGMENTS ?? [],
    )
  ) {
    logger.warn(
      `${logContext} validation blocked resolved IP address: ${ip} for hostname: ${hostname}`,
    );
    throw new OutboundUrlValidationError(
      "blocked-ip",
      "Blocked IP address detected",
    );
  }
}

/** enforcePositiveAllowlist returns whether a configured positive host list allows this hostname. */
function enforcePositiveAllowlist(
  hostname: string,
  whitelist: OutboundUrlValidationWhitelist,
): "allowed" | "bucket-host" | "not-configured" {
  const allowedHosts = whitelist.allowedHosts ?? [];
  if (allowedHosts.length === 0) return "not-configured";
  if (allowedHosts.includes(hostname)) return "allowed";
  if (isBucketHostOfAllowedParent(hostname, whitelist)) return "bucket-host";
  throw new OutboundUrlValidationError(
    "host-not-allowed",
    HOST_NOT_IN_ALLOWLIST_MESSAGE,
  );
}

function isBucketHostOfAllowedParent(
  hostname: string,
  whitelist: OutboundUrlValidationWhitelist,
): boolean {
  return (whitelist.allowedBucketHostParents ?? []).some(
    (parent) =>
      hostname.endsWith(`.${parent}`) &&
      isDnsCompatibleBucketName(hostname.slice(0, -parent.length - 1)),
  );
}

export function isDnsCompatibleBucketName(bucketName: string): boolean {
  return (
    DNS_COMPATIBLE_BUCKET_NAME.test(bucketName) &&
    !IP_SHAPED_BUCKET_NAME.test(bucketName) &&
    !ADJACENT_DOTS.test(bucketName)
  );
}

function assertValidUrlEncoding(urlString: string): void {
  // This intentionally checks encoding validity only. Do not parse or validate
  // the decoded result: decoding the whole URL can turn encoded data into URL
  // delimiters and make validation inspect a different hostname than fetch.
  try {
    decodeURIComponent(urlString);
  } catch {
    throw new OutboundUrlValidationError(
      "invalid-encoding",
      "Invalid URL encoding",
    );
  }
}
