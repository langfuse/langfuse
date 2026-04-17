import { URL } from "node:url";
import { env } from "../../env";
import { logger } from "../logger";
import {
  isHostnameBlocked,
  isIPBlocked,
  isIPAddress,
} from "../webhooks/ipBlocking";
import { resolveHost } from "../webhooks/validation";

export interface LlmBaseUrlValidationWhitelist {
  hosts: string[];
  ips: string[];
  ip_ranges: string[];
}

export function llmBaseUrlWhitelistFromEnv(): LlmBaseUrlValidationWhitelist {
  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    return {
      hosts: [],
      ips: [],
      ip_ranges: [],
    };
  }

  return {
    hosts: env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST || [],
    ips: env.LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS || [],
    ip_ranges: env.LANGFUSE_LLM_CONNECTION_WHITELISTED_IP_SEGMENTS || [],
  };
}

export async function validateLlmConnectionBaseURL(
  urlString: string,
  whitelist: LlmBaseUrlValidationWhitelist = llmBaseUrlWhitelistFromEnv(),
): Promise<void> {
  const effectiveWhitelist = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
    ? {
        hosts: [],
        ips: [],
        ip_ranges: [],
      }
    : whitelist;

  let url: URL;
  try {
    url = new URL(normalizeURL(urlString));
  } catch {
    throw new Error("Invalid URL syntax");
  }

  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS protocols are allowed");
  }

  const hostname = normalizeHostname(url.hostname);

  if (effectiveWhitelist.hosts.includes(hostname)) {
    return;
  }

  if (isHostnameBlocked(hostname)) {
    throw new Error("Blocked hostname detected");
  }

  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION && url.protocol !== "https:") {
    throw new Error("Only HTTPS base URLs are allowed on Langfuse Cloud");
  }

  if (isIPAddress(hostname)) {
    if (
      isIPBlocked(
        hostname,
        effectiveWhitelist.ips,
        effectiveWhitelist.ip_ranges,
      )
    ) {
      logger.warn(
        `LLM base URL validation blocked IP address in hostname: ${hostname}`,
      );
      throw new Error("Blocked IP address detected");
    }

    return;
  }

  let ips: string[];
  try {
    ips = await resolveHost(hostname);
  } catch {
    // DNS resolution is best-effort here so valid custom gateways do not fail at write time.
    return;
  }

  for (const ip of ips) {
    if (isIPBlocked(ip, effectiveWhitelist.ips, effectiveWhitelist.ip_ranges)) {
      logger.warn(
        `LLM base URL validation blocked resolved IP address: ${ip} for hostname: ${hostname}`,
      );
      throw new Error("Blocked IP address detected");
    }
  }
}

function normalizeURL(urlString: string): string {
  let normalized = urlString.trim();

  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    throw new Error("Invalid URL encoding");
  }

  try {
    normalized = normalized.normalize("NFC");
  } catch {
    throw new Error("Invalid unicode in URL");
  }

  return normalized;
}

function normalizeHostname(hostname: string): string {
  let normalized = hostname.toLowerCase();

  try {
    normalized = new URL(`http://${normalized}`).hostname;
  } catch {
    // Keep the original hostname so URL parsing can fail consistently elsewhere.
  }

  return normalized;
}
