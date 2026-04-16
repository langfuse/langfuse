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
 * Validates a webhook URL to prevent SSRF attacks by blocking internal/private IP addresses.
 * Returns the resolved IP addresses so callers can pin DNS and avoid TOCTOU races
 * between validation and the actual HTTP request.
 *
 * Should be called when saving webhook URLs and before sending webhooks.
 */
export async function validateWebhookURLAndGetIPs(
  urlString: string,
  whitelist: WebhookValidationWhitelist = whitelistFromEnv(),
): Promise<string[]> {
  const url = parseOutboundUrl(urlString);

  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS protocols are allowed");
  }

  if (url.port && !["443", "80"].includes(url.port)) {
    throw new Error("Only ports 80 and 443 are allowed");
  }

  return await validateOutboundUrlHost({
    url,
    whitelist,
    logContext: "Webhook",
    // Preserve the existing webhook behavior: public IP literals must still
    // pass the same DNS-resolution path as hostname destinations.
    shouldSkipDnsCheckForLiteralIps: false,
  });
}
