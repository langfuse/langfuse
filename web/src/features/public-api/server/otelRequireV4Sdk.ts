import { logger, recordIncrement } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";

const OTEL_LEGACY_SDK_REJECTED_METRIC =
  "langfuse.public_api.otel_legacy_sdk_rejected";

const SDK_UPGRADE_DOCS =
  "https://langfuse.com/docs/observability/sdk/upgrade-path";
const OTEL_MIGRATION_DOCS =
  "https://langfuse.com/integrations/native/opentelemetry/migration-to-v4.md";

/** OTEL_LEGACY_LANGFUSE_SDK_ERROR tells a cutoff organization to upgrade its Langfuse SDK or send OpenTelemetry directly. */
export const OTEL_LEGACY_LANGFUSE_SDK_ERROR = `This organization only accepts OpenTelemetry traces from the latest Langfuse SDKs or from OpenTelemetry directly. Upgrade to the latest Langfuse SDKs, or send via OpenTelemetry directly. Docs: ${SDK_UPGRADE_DOCS} ${OTEL_MIGRATION_DOCS}`;

/**
 * isOrganizationCreatedAtOrAfterCutoff reports whether an organization was
 * created at or after an ISO-8601 cutoff. An unset cutoff, a missing
 * timestamp, or a value that does not parse leaves the caller unchanged.
 * The comparison matches the legacy ingestion score-only cutoff.
 */
export function isOrganizationCreatedAtOrAfterCutoff(
  organizationCreatedAt: string | null | undefined,
  cutoff: string | null | undefined,
): boolean {
  if (!cutoff || !organizationCreatedAt) return false;

  const createdAtMs = Date.parse(organizationCreatedAt);
  const cutoffMs = Date.parse(cutoff);
  if (Number.isNaN(createdAtMs) || Number.isNaN(cutoffMs)) return false;
  return createdAtMs >= cutoffMs;
}

/** isOtelV4SdkRequiredOrg reports whether this organization must use a current Langfuse SDK or plain OpenTelemetry on the OTel trace route. */
export function isOtelV4SdkRequiredOrg(
  organizationCreatedAt: string | null | undefined,
): boolean {
  return isOrganizationCreatedAtOrAfterCutoff(
    organizationCreatedAt,
    env.LANGFUSE_OTEL_REQUIRE_V4_SDK_ORG_CREATED_CUTOFF,
  );
}

/** recordOtelLegacySdkRejection counts batches the OTel SDK cutoff rejected. Tags are the SDK name and version bucket, never the organization. */
export function recordOtelLegacySdkRejection(params: {
  sdk: string;
  versionBucket: string;
  orgId?: string;
  projectId?: string;
}): void {
  recordIncrement(OTEL_LEGACY_SDK_REJECTED_METRIC, 1, {
    sdk: params.sdk,
    version_bucket: params.versionBucket,
  });
  logger.info("Rejected OpenTelemetry batch from an older Langfuse SDK", {
    sdk: params.sdk,
    versionBucket: params.versionBucket,
    orgId: params.orgId,
    projectId: params.projectId,
  });
}
