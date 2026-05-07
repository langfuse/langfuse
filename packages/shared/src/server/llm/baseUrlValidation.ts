import { env } from "../../env";
import {
  type OutboundUrlValidationWhitelist,
  parseOutboundUrl,
  validateOutboundUrlHost,
} from "../outbound-url";

export type LlmBaseUrlValidationWhitelist = OutboundUrlValidationWhitelist;

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

  const url = parseOutboundUrl(urlString);

  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS protocols are allowed");
  }

  await validateOutboundUrlHost({
    url,
    whitelist: effectiveWhitelist,
    shouldThrowIfDnsResolutionFails: false,
    logContext: "LLM base URL",
    // Existing LLM validation accepts public IP literals after CIDR checks so
    // custom gateways are not forced through DNS at write time.
    shouldSkipDnsCheckForLiteralIps: true,
  });

  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION && url.protocol !== "https:") {
    throw new Error("Only HTTPS base URLs are allowed on Langfuse Cloud");
  }
}
