import { env } from "../../env";
import {
  type OutboundUrlValidationWhitelist,
  parseOutboundUrl,
  resolveHost,
  validateOutboundUrlHost,
} from "../outbound-url";

export type WebhookValidationWhitelist = OutboundUrlValidationWhitelist;
export { resolveHost };

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
  const url = parseOutboundUrl(urlString);

  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS protocols are allowed");
  }

  if (url.port && !["443", "80"].includes(url.port)) {
    throw new Error("Only ports 80 and 443 are allowed");
  }

  await validateOutboundUrlHost({
    url,
    whitelist,
    shouldThrowIfDnsResolutionFails: true,
    logContext: "Webhook",
    // Preserve the existing webhook behavior: public IP literals must still
    // pass the same DNS-resolution path as hostname destinations.
    shouldSkipDnsCheckForLiteralIps: false,
  });
}
