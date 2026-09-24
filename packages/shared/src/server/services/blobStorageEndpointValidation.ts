import { env } from "../../env";
import {
  type OutboundUrlConnectionValidationOptions,
  type OutboundUrlValidationWhitelist,
  OutboundUrlValidationError,
  parseOutboundUrl,
  validateOutboundUrlHost,
} from "../outbound-url";

export const BLOB_STORAGE_ENDPOINT_VALIDATION_LOG_CONTEXT =
  "Blob storage endpoint";

const STRICT_BLOB_STORAGE_ENDPOINT_WHITELIST: OutboundUrlValidationWhitelist = {
  hosts: [],
  ips: [],
  ip_ranges: [],
};

function isLangfuseCloudEndpointValidationEnabled(): boolean {
  return (
    Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) &&
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== "DEV"
  );
}

export function blobStorageEndpointWhitelistFromEnv(): OutboundUrlValidationWhitelist {
  if (isLangfuseCloudEndpointValidationEnabled()) {
    return STRICT_BLOB_STORAGE_ENDPOINT_WHITELIST;
  }

  return {
    hosts: env.LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_HOST || [],
    ips: env.LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_IPS || [],
    ip_ranges: env.LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_IP_SEGMENTS || [],
  };
}

export async function validateBlobStorageEndpoint(
  endpoint: string,
  whitelist: OutboundUrlValidationWhitelist = blobStorageEndpointWhitelistFromEnv(),
): Promise<void> {
  const effectiveWhitelist = getEffectiveWhitelist(whitelist);

  if (!isBlobStorageEndpointValidationEnabled(effectiveWhitelist)) {
    return;
  }

  const url = parseOutboundUrl(endpoint);

  if (!["https:", "http:"].includes(url.protocol)) {
    throw new OutboundUrlValidationError(
      "protocol-not-allowed",
      "Only HTTP and HTTPS protocols are allowed",
    );
  }

  if (isLangfuseCloudEndpointValidationEnabled() && url.protocol !== "https:") {
    throw new OutboundUrlValidationError(
      "https-required",
      "Only HTTPS blob storage endpoints are allowed on Langfuse Cloud",
    );
  }

  try {
    await validateOutboundUrlHost({
      url,
      whitelist: effectiveWhitelist,
      logContext: BLOB_STORAGE_ENDPOINT_VALIDATION_LOG_CONTEXT,
      // Public IP literals are valid storage endpoints after blocklist checks and
      // should not require a reverse DNS path to exist at save time.
      shouldSkipDnsCheckForLiteralIps: true,
    });
  } catch (error) {
    // Re-wrap to append self-hosted guidance while preserving the validation
    // `code` so the worker's customer-fault classifier still recognises the
    // rejection. Do not chain `cause`: the guidance-suffixed message is the
    // authoritative one, and downstream formatters (worker
    // extractStorageErrorMessage, tRPC getErrorMessage) prefer a cause's
    // message and would otherwise drop the guidance / duplicate the text.
    // Unexpected non-validation errors pass through untouched so they are not
    // misclassified as customer faults.
    if (error instanceof OutboundUrlValidationError) {
      throw new OutboundUrlValidationError(
        error.code,
        `${error.message}${getSelfHostedWhitelistGuidance()}`,
      );
    }
    throw error;
  }
}

export function blobStorageEndpointConnectionValidationOptions(
  whitelist: OutboundUrlValidationWhitelist = blobStorageEndpointWhitelistFromEnv(),
): OutboundUrlConnectionValidationOptions | undefined {
  const effectiveWhitelist = getEffectiveWhitelist(whitelist);

  if (!isBlobStorageEndpointValidationEnabled(effectiveWhitelist)) {
    return undefined;
  }

  return {
    whitelist: effectiveWhitelist,
    logContext: BLOB_STORAGE_ENDPOINT_VALIDATION_LOG_CONTEXT,
  };
}

function getEffectiveWhitelist(
  whitelist: OutboundUrlValidationWhitelist,
): OutboundUrlValidationWhitelist {
  return isLangfuseCloudEndpointValidationEnabled()
    ? STRICT_BLOB_STORAGE_ENDPOINT_WHITELIST
    : whitelist;
}

function isBlobStorageEndpointValidationEnabled(
  whitelist: OutboundUrlValidationWhitelist,
): boolean {
  if (isLangfuseCloudEndpointValidationEnabled()) return true;

  // Compatibility rollout: self-hosted deployments may already point blob
  // exports at private MinIO/Azure endpoints. Keep the stricter SSRF/rebind
  // validation opt-in until operators configure the dedicated allowlist envs.
  // TODO(next major): enforce blob storage endpoint validation for self-hosted
  // deployments even when no allowlist env is configured.
  return (
    whitelist.hosts.length > 0 ||
    whitelist.ips.length > 0 ||
    whitelist.ip_ranges.length > 0
  );
}

function getSelfHostedWhitelistGuidance(): string {
  if (isLangfuseCloudEndpointValidationEnabled()) return "";

  return " For self-hosted deployments with internal blob storage endpoints, configure LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_HOST, LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_IPS, or LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_IP_SEGMENTS.";
}
