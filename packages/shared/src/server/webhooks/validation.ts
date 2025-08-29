import dns from "node:dns/promises";
import { URL } from "node:url";
import { isIPBlocked, isIPAddress, isHostnameBlocked } from "./ipBlocking";

export async function resolveHost(hostname: string): Promise<string[]> {
  // Returns every A + AAAA address
  console.log(`DNS resolving hostname: ${hostname}`);
  const [v4, v6] = await Promise.allSettled([
    dns.resolve4(hostname),
    dns.resolve6(hostname),
  ]);

  console.log(`DNS v4 result:`, v4);
  console.log(`DNS v6 result:`, v6);

  const ips: string[] = [];
  if (v4.status === "fulfilled") {
    console.log(`Raw v4 addresses:`, v4.value);
    // Filter out any undefined/null values
    const validV4Ips = v4.value.filter((ip) => ip && typeof ip === "string");
    console.log(`Valid v4 addresses:`, validV4Ips);
    ips.push(...validV4Ips);
  }
  if (v6.status === "fulfilled") {
    console.log(`Raw v6 addresses:`, v6.value);
    // Filter out any undefined/null values
    const validV6Ips = v6.value.filter((ip) => ip && typeof ip === "string");
    console.log(`Valid v6 addresses:`, validV6Ips);
    ips.push(...validV6Ips);
  }
  console.log(`Final resolved IPs:`, ips);
  if (!ips.length) throw new Error(`DNS lookup failed for ${hostname}`);
  return ips;
}

/**
 * Validates a webhook URL to prevent SSRF attacks by blocking internal/private IP addresses
 * Should be called when saving webhook URLs and before sending webhooks
 *
 * Security Note: This validation has a Time-of-Check-Time-of-Use (TOCTOU) vulnerability
 * where DNS can change between validation and actual HTTP request. For maximum security,
 * the HTTP client should also implement IP blocking at connection time.
 */
export async function validateWebhookURL(urlString: string): Promise<void> {
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

  // Block obviously dangerous hostnames
  if (isHostnameBlocked(hostname)) {
    throw new Error("Blocked hostname detected");
  }

  // Step 4: Check for IP address literals in hostname
  if (isIPAddress(hostname)) {
    if (isIPBlocked(hostname)) {
      throw new Error(`Blocked IP address detected: ${hostname}`);
    }
  }

  // Step 5: DNS resolution and validation
  const ips = await resolveHost(hostname);
  for (const ip of ips) {
    if (isIPBlocked(ip)) {
      throw new Error(`Blocked IP address detected: ${ip}`);
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
