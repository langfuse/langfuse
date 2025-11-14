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

function whitelistFromEnv(): WebhookValidationWhitelist {
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
  let url: URL;
  try {
    // Normalize the URL string first to handle encoding issues
    const normalizedUrl = normalizeURL(urlString);
    url = new URL(normalizedUrl);
  } catch {
    throw new Error("Invalid URL syntax");
  }

  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS protocols are allowed");
  }

  // Step 2: Port validation
  if (url.port && !["443", "80"].includes(url.port)) {
    throw new Error("Only ports 80 and 443 are allowed");
  }

  // Step 3: Hostname normalization and validation
  const hostname = normalizeHostname(url.hostname);

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

/**
 * Normalize URL to prevent encoding/unicode bypass attempts
 */
function normalizeURL(urlString: string): string {
  // Remove leading/trailing whitespace
  let normalized = urlString.trim();

  // Decode URL encoding to prevent bypass attempts like %6C%6F%63%61%6C%68%6F%73%74 (localhost)
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    throw new Error("Invalid URL encoding");
  }

  // Normalize unicode to prevent IDN bypass attempts
  try {
    normalized = normalized.normalize("NFC");
  } catch {
    throw new Error("Invalid unicode in URL");
  }

  return normalized;
}

/**
 * Normalize hostname to handle IDN and case sensitivity
 */
function normalizeHostname(hostname: string): string {
  let normalized = hostname.toLowerCase();

  // Convert internationalized domain names to ASCII (Punycode)
  try {
    // This will convert unicode domain names to their ASCII representation
    const url = new URL(`http://${normalized}`);
    normalized = url.hostname;
  } catch {
    // If hostname is invalid, keep the original for later validation failure
  }

  return normalized;
}

/**
 * Fetches a webhook URL with secure redirect handling.
 * Each redirect destination is validated to prevent SSRF attacks.
 *
 * @param url - The initial URL to fetch
 * @param options - Fetch options (method, body, headers, signal)
 * @returns The final Response after following redirects
 */
export async function fetchWebhookWithSecureRedirects(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const MAX_REDIRECTS = 5;
  let currentUrl = url;
  let redirectCount = 0;
  let response: Response;

  // Follow redirects manually to validate each destination
  do {
    logger.debug(
      `Fetching webhook URL: ${currentUrl} (redirect ${redirectCount}/${MAX_REDIRECTS})`,
    );

    // Fetch with manual redirect handling
    response = await fetch(currentUrl, {
      ...options,
      redirect: "manual",
    });

    // Check if response is a redirect (3xx status)
    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect) {
      break;
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(
        `Webhook returned redirect status ${response.status} without Location header for url ${currentUrl}`,
      );
    }

    // Resolve relative URLs against the current URL
    const redirectUrl = new URL(location, currentUrl).href;

    logger.info(
      `Webhook redirect detected: ${currentUrl} -> ${redirectUrl} (attempt ${redirectCount + 1}/${MAX_REDIRECTS})`,
    );

    // Check redirect depth limit
    redirectCount++;
    if (redirectCount > MAX_REDIRECTS) {
      throw new Error(
        `Webhook exceeded maximum redirect limit of ${MAX_REDIRECTS}`,
      );
    }

    // Validate the redirect destination URL to prevent SSRF
    try {
      await validateWebhookURL(redirectUrl);
    } catch (validationError) {
      logger.error(
        `Webhook redirect validation failed: ${currentUrl} -> ${redirectUrl}`,
        validationError,
      );
      throw new Error(
        `Webhook redirect blocked for security reasons: ${redirectUrl} failed validation. ${validationError instanceof Error ? validationError.message : "Unknown error"}`,
      );
    }

    // Update current URL for next iteration
    currentUrl = redirectUrl;
  } while (redirectCount <= MAX_REDIRECTS);

  // Log success if we followed redirects
  if (redirectCount > 0) {
    logger.info(
      `Webhook successfully followed ${redirectCount} redirect(s) to ${currentUrl}`,
    );
  }

  return response;
}
