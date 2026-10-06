import { env } from "../../env";
import {
  type OutboundUrlConnectionValidationOptions,
  type OutboundUrlValidationWhitelist,
  OutboundUrlValidationError,
  parseOutboundUrl,
  validateOutboundUrlHost,
} from "../outbound-url";

const EXTERNAL_MEDIA_STORAGE_ENDPOINT_VALIDATION_LOG_CONTEXT =
  "External media storage endpoint";

const STRICT_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELIST: OutboundUrlValidationWhitelist =
  {
    hosts: [],
    ips: [],
    ip_ranges: [],
  };

function isLangfuseCloud() {
  return Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);
}

export function externalMediaStorageEndpointWhitelistFromEnv(): OutboundUrlValidationWhitelist {
  if (isLangfuseCloud()) {
    return STRICT_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELIST;
  }

  return {
    hosts: env.LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_HOST || [],
    ips: env.LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_IPS || [],
    ip_ranges:
      env.LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_IP_SEGMENTS ||
      [],
  };
}

export async function validateExternalMediaStorageEndpoint(
  endpoint: string,
  whitelist: OutboundUrlValidationWhitelist = externalMediaStorageEndpointWhitelistFromEnv(),
) {
  const effectiveWhitelist = isLangfuseCloud()
    ? STRICT_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELIST
    : whitelist;
  const url = parseOutboundUrl(endpoint);

  if (!["https:", "http:"].includes(url.protocol)) {
    throw new OutboundUrlValidationError(
      "protocol-not-allowed",
      "Only HTTP and HTTPS protocols are allowed",
    );
  }

  if (isLangfuseCloud() && url.protocol !== "https:") {
    throw new OutboundUrlValidationError(
      "https-required",
      "Only HTTPS external media storage endpoints are allowed on Langfuse Cloud",
    );
  }

  try {
    await validateOutboundUrlHost({
      url,
      whitelist: effectiveWhitelist,
      logContext: EXTERNAL_MEDIA_STORAGE_ENDPOINT_VALIDATION_LOG_CONTEXT,
      shouldSkipDnsCheckForLiteralIps: true,
    });
  } catch (error) {
    if (error instanceof OutboundUrlValidationError) {
      throw new OutboundUrlValidationError(
        error.code,
        `${error.message}${getSelfHostedWhitelistGuidance()}`,
      );
    }
    throw error;
  }
}

export function externalMediaStorageEndpointConnectionValidationOptions(): OutboundUrlConnectionValidationOptions {
  return {
    whitelist: externalMediaStorageEndpointWhitelistFromEnv(),
    logContext: EXTERNAL_MEDIA_STORAGE_ENDPOINT_VALIDATION_LOG_CONTEXT,
  };
}

function getSelfHostedWhitelistGuidance() {
  if (isLangfuseCloud()) return "";

  return " For self-hosted deployments with internal external media storage endpoints, configure LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_HOST, LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_IPS, or LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_IP_SEGMENTS.";
}
