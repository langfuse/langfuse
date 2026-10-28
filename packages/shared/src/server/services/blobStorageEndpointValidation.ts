import { type BlobStorageIntegrationType } from "@prisma/client";
import { env } from "../../env";
import {
  isDnsCompatibleBucketName,
  type OutboundUrlConnectionValidationOptions,
  type OutboundUrlValidationWhitelist,
  OutboundUrlValidationError,
  parseOutboundUrl,
  resolveHost,
  validateOutboundResolvedIp,
  validateOutboundUrlHost,
} from "../outbound-url";
import { isIPAddress } from "../webhooks/ipBlocking";

export const BLOB_STORAGE_ENDPOINT_VALIDATION_LOG_CONTEXT =
  "Blob storage endpoint";

const S3_BUCKET_LABEL = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

const STRICT_BLOB_STORAGE_ENDPOINT_WHITELIST: OutboundUrlValidationWhitelist = {
  hosts: [],
  ips: [],
  ip_ranges: [],
  allowedHosts: [],
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
    allowedHosts: env.LANGFUSE_BLOB_STORAGE_ENDPOINT_ALLOWED_HOSTS,
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
        `${error.message}${getSelfHostedWhitelistGuidance(error.code)}`,
      );
    }
    throw error;
  }
}

export type BlobStorageBucketHostTarget = {
  type: BlobStorageIntegrationType;
  endpoint: string | null | undefined;
  bucketName: string;
  forcePathStyle: boolean | null | undefined;
};

/**
 * With an allowed-hosts list, a listed endpoint host may be private, but the
 * `{bucket}.{host}` name S3 connects to without path-style still gets the
 * private-address block. Check that name up front so the integration is
 * rejected with guidance instead of disabled after its first export.
 */
export async function validateBlobStorageBucketHost(
  target: BlobStorageBucketHostTarget,
  whitelist: OutboundUrlValidationWhitelist = blobStorageEndpointWhitelistFromEnv(),
): Promise<void> {
  const connectionWhitelist =
    blobStorageEndpointConnectionValidationOptions(whitelist)?.whitelist;
  const bucketHost = virtualHostedBucketHost(
    target,
    connectionWhitelist?.allowedHosts ?? [],
  );
  if (!connectionWhitelist || !bucketHost) return;

  await assertBucketHostAddressesAllowed(bucketHost, connectionWhitelist);
}

// Rejection of a keyless GCS export. The worker classifies it by name as a
// bucket fault, so the integration is disabled instead of retried.
class GcsBucketNotAllowedError extends Error {
  constructor(
    readonly code: "gcs-bucket-not-allowed" | "gcs-not-allowed",
    message: string,
  ) {
    super(message);
    this.name = "GcsBucketNotAllowedError";
  }
}

/**
 * Keyless GOOGLE_CLOUD_STORAGE blob exports (no service account key stored)
 * authenticate as the deployment's own GCP identity (ADC), so the bucket is the
 * only thing a project owner controls. Restrict it to operator-approved buckets.
 * Self-hosted only: on Langfuse Cloud the ADC identity is Langfuse's own.
 * Exports with a customer service account key are scoped by that key instead,
 * like the Vertex AI LLM connection, and need no allowlist.
 */
export function assertGcsBlobStorageBucketAllowed(bucketName: string): void {
  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    throw new GcsBucketNotAllowedError(
      "gcs-not-allowed",
      "Google Cloud Storage exports with default credentials are only available on self-hosted deployments. Provide a service account key instead.",
    );
  }
  const allowed = env.LANGFUSE_BLOB_STORAGE_GCS_ALLOWED_BUCKETS ?? [];
  if (!allowed.includes(bucketName.toLowerCase().trim())) {
    throw new GcsBucketNotAllowedError(
      "gcs-bucket-not-allowed",
      allowed.length === 0
        ? "Google Cloud Storage exports with default credentials are disabled. Set LANGFUSE_BLOB_STORAGE_GCS_ALLOWED_BUCKETS to enable them, or provide a service account key."
        : `Bucket "${bucketName}" is not in LANGFUSE_BLOB_STORAGE_GCS_ALLOWED_BUCKETS. Use an allowed bucket or provide a service account key.`,
    );
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
    // S3 connects to `{bucket}.{endpoint host}` unless path-style is forced,
    // and follows region redirects to `{bucket}.s3.<region>.amazonaws.com`.
    // A rule over all listed hosts, rather than the integration's own bucket,
    // keeps one pooled agent policy per deployment; the bucket name is the
    // project owner's choice either way.
    whitelist: {
      ...effectiveWhitelist,
      allowedBucketHostParents: effectiveWhitelist.allowedHosts,
    },
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
    whitelist.ip_ranges.length > 0 ||
    (whitelist.allowedHosts?.length ?? 0) > 0
  );
}

function getSelfHostedWhitelistGuidance(
  code: OutboundUrlValidationError["code"],
): string {
  if (isLangfuseCloudEndpointValidationEnabled()) return "";

  if (code === "host-not-allowed") {
    return " Add the host to LANGFUSE_BLOB_STORAGE_ENDPOINT_ALLOWED_HOSTS.";
  }

  return " For self-hosted deployments with internal blob storage endpoints, configure LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_HOST, LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_IPS, or LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_IP_SEGMENTS.";
}

/** virtualHostedBucketHost returns the `{bucket}.{host}` name the S3 SDK connects to, if it virtual-hosts this target under a listed host. */
function virtualHostedBucketHost(
  target: BlobStorageBucketHostTarget,
  allowedHosts: string[],
): string | undefined {
  if (
    allowedHosts.length === 0 ||
    !target.endpoint ||
    target.forcePathStyle ||
    target.type === "AZURE_BLOB_STORAGE" ||
    target.type === "GOOGLE_CLOUD_STORAGE"
  ) {
    return undefined;
  }

  const url = parseOutboundUrl(target.endpoint);
  const bucketName = target.bucketName.trim();
  if (
    !allowedHosts.includes(url.hostname) ||
    isIpLiteralHostname(url.hostname) ||
    !isSdkVirtualHostableBucket(bucketName, url.protocol === "https:")
  ) {
    return undefined;
  }
  return `${bucketName}.${url.hostname}`;
}

// The SDK addresses IP endpoints path-style.
function isIpLiteralHostname(hostname: string): boolean {
  return hostname.startsWith("[") || isIPAddress(hostname);
}

// Mirrors the S3 endpoint ruleset: over HTTPS a dotted bucket stays on the
// endpoint host so the certificate matches; over HTTP every label must be a
// 3-63 character bucket label.
function isSdkVirtualHostableBucket(
  bucketName: string,
  https: boolean,
): boolean {
  if (!isDnsCompatibleBucketName(bucketName)) return false;
  if (!bucketName.includes(".")) return true;
  return (
    !https &&
    bucketName.split(".").every((label) => S3_BUCKET_LABEL.test(label))
  );
}

async function assertBucketHostAddressesAllowed(
  bucketHost: string,
  whitelist: OutboundUrlValidationWhitelist,
): Promise<void> {
  // No hostname blocklist here: sockets are only checked by resolved address,
  // so names like `{bucket}.minio.internal` must not be rejected by suffix.
  try {
    for (const ip of await resolveHost(bucketHost)) {
      validateOutboundResolvedIp({
        hostname: bucketHost,
        ip,
        whitelist,
        logContext: BLOB_STORAGE_ENDPOINT_VALIDATION_LOG_CONTEXT,
      });
    }
  } catch (error) {
    if (error instanceof OutboundUrlValidationError) {
      throw new OutboundUrlValidationError(
        error.code,
        `${error.message} for ${bucketHost}. S3 connects to the bucket as a subdomain of the endpoint unless Force Path Style is on. Turn on Force Path Style, or add the address to LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_IPS or LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_IP_SEGMENTS.`,
      );
    }
    throw error;
  }
}
