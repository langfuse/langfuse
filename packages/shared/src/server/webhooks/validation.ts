import dns from "node:dns/promises";
import { URL } from "node:url";
import { isIPBlocked, isIPAddress, isHostnameBlocked } from "./ipBlocking";
import { env } from "../../env";
import { logger } from "../logger";

export async function resolveHost(hostname: string): Promise<string[]> {
  // Returns every A + AAAA address
  const [v4, v6] = await Promise.allSettled([
    dns.resolve4(hostname),
    dns.resolve6(hostname),
  ]);

  const ips: string[] = [];
  if (v4.status === "fulfilled") {
    // Filter out any undefined/null values
    const validV4Ips = v4.value.filter((ip) => ip && typeof ip === "string");

    ips.push(...validV4Ips);
  }
  if (v6.status === "fulfilled") {
    // Filter out any undefined/null values
    const validV6Ips = v6.value.filter((ip) => ip && typeof ip === "string");

    ips.push(...validV6Ips);
  }
  if (!ips.length) throw new Error(`DNS lookup failed for ${hostname}`);
  return ips;
}

export interface WebhookValidationWhitelist {
  hosts: string[];
  ips: string[];
  ip_ranges: string[];
}

export function whitelistFromEnv(): WebhookValidationWhitelist {
  return {
    hosts: env.LANGFUSE_WEBHOOK_WHITELISTED_HOST || [],
    ips: env.LANGFUSE_WEBHOOK_WHITELISTED_IPS || [],
    ip_ranges: env.LANGFUSE_WEBHOOK_WHITELISTED_IP_SEGMENTS || [],
  };
}

/**
 * Validates a webhook URL to prevent SSRF attacks by blocking internal/private IP addresses
 * Should be called when saving webhook URLs and before sending webhooks
 *
 * Security Note: This validation has a Time-of-Check-Time-of-Use (TOCTOU) vulnerability
 * where DNS can change between validation and actual HTTP request. For maximum security,
 * the HTTP client should also implement IP blocking at connection time.
 */
export async function validateWebhookURL(
  urlString: string,
  whitelist: WebhookValidationWhitelist = whitelistFromEnv(),
): Promise<void> {
  // Step 1: Basic URL parsing and normalization
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

  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS protocols are allowed");
  }

  if (url.username !== "" || url.password !== "") {
    throw new Error(
      "URL credentials are not allowed. Use webhook headers for authentication instead.",
    );
  }

  // Step 2: Port validation
  if (url.port && !["443", "80"].includes(url.port)) {
    throw new Error("Only ports 80 and 443 are allowed");
  }

  // Step 3: Hostname validation. WHATWG URL parsing already lowercases and
  // punycodes HTTP(S) hostnames, so keep this tied to the parsed URL component.
  const hostname = url.hostname;

  if (whitelist.hosts.includes(hostname)) {
    // skip further checks if hostname is whitelisted
    return;
  }

  // Block obviously dangerous hostnames
  if (isHostnameBlocked(hostname)) {
    throw new Error("Blocked hostname detected");
  }

  // Step 4: Check for IP address literals in hostname
  if (isIPAddress(hostname)) {
    if (isIPBlocked(hostname, whitelist.ips, whitelist.ip_ranges)) {
      // Log detailed error internally for debugging
      logger.warn(
        `Webhook validation blocked IP address in hostname: ${hostname}`,
      );
      // Throw generic error to user to prevent IP leakage
      throw new Error("Blocked IP address detected");
    }
  }

  // Step 5: DNS resolution and validation
  const ips = await resolveHost(hostname);
  for (const ip of ips) {
    if (isIPBlocked(ip, whitelist.ips, whitelist.ip_ranges)) {
      // Log detailed error internally for debugging
      logger.warn(
        `Webhook validation blocked resolved IP address: ${ip} for hostname: ${hostname}`,
      );
      // Throw generic error to user to prevent IP leakage
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
