import { env } from "../../env";
import type { LLMCredentialSource } from "./ai-sdk/providers/types";
import {
  type OutboundUrlValidationWhitelist,
  OutboundUrlValidationError,
  parseOutboundUrl,
  validateOutboundUrlHost,
} from "../outbound-url";

export type LlmBaseUrlValidationWhitelist = OutboundUrlValidationWhitelist;

const EMPTY_LLM_BASE_URL_WHITELIST: LlmBaseUrlValidationWhitelist = {
  hosts: [],
  ips: [],
  ip_ranges: [],
  allowedHosts: [],
};

export function llmBaseUrlWhitelistFromEnv(): LlmBaseUrlValidationWhitelist {
  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    return EMPTY_LLM_BASE_URL_WHITELIST;
  }

  return {
    hosts: env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST || [],
    ips: env.LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS || [],
    ip_ranges: env.LANGFUSE_LLM_CONNECTION_WHITELISTED_IP_SEGMENTS || [],
    allowedHosts: env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS,
  };
}

/** llmFetchWhitelistForBaseUrl applies the positive host list only to user connections with a custom base URL. */
export function llmFetchWhitelistForBaseUrl(
  baseURL: string | null | undefined,
  credentialSource: LLMCredentialSource = "user",
): LlmBaseUrlValidationWhitelist {
  const whitelist = llmBaseUrlWhitelistFromEnv();
  if (baseURL && credentialSource === "user") return whitelist;
  if ((whitelist.allowedHosts ?? []).length === 0) return whitelist;
  return { ...whitelist, allowedHosts: [] };
}

export async function validateLlmConnectionBaseURL(
  urlString: string,
  whitelist: LlmBaseUrlValidationWhitelist = llmBaseUrlWhitelistFromEnv(),
): Promise<void> {
  const effectiveWhitelist = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
    ? EMPTY_LLM_BASE_URL_WHITELIST
    : whitelist;

  const url = parseOutboundUrl(urlString);

  if (!["https:", "http:"].includes(url.protocol)) {
    throw new OutboundUrlValidationError(
      "protocol-not-allowed",
      "Only HTTP and HTTPS protocols are allowed",
    );
  }

  await validateOutboundUrlHost({
    url,
    whitelist: effectiveWhitelist,
    logContext: "LLM base URL",
    // Existing LLM validation accepts public IP literals after CIDR checks so
    // custom gateways are not forced through DNS at write time.
    shouldSkipDnsCheckForLiteralIps: true,
  });

  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION && url.protocol !== "https:") {
    throw new OutboundUrlValidationError(
      "https-required",
      "Only HTTPS base URLs are allowed on Langfuse Cloud",
    );
  }
}
