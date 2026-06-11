import {
  InvalidRequestError,
  isLegacyBlobExporter,
  LEGACY_BLOB_EXPORT_SOURCES,
  LEGACY_BLOB_EXPORTER_CUTOFF,
} from "@langfuse/shared";
import { type AnalyticsIntegrationExportSource } from "@langfuse/shared/src/db";
import { assertLegacyBlobExportSourceAllowed } from "@/src/features/blobstorage-integration/server/assertLegacyBlobExportSourceAllowed";

/**
 * Write-time gate for blob storage upserts. Composes the project-level
 * post-cutoff gate (`assertLegacyBlobExportSourceAllowed`, still used by REST)
 * with the integration-level cutoff: a row may only keep using a legacy export
 * source if its own `createdAt` predates `LEGACY_BLOB_EXPORTER_CUTOFF`.
 *
 * `existingIntegration` is `null` for a brand-new integration, which is treated
 * as non-legacy (new-customer rules) by `isLegacyBlobExporter`.
 *
 * Keyed on `isCloud` directly, not on enriched-export availability: self-hosted
 * stays exempt even with the V4 preview enabled (see blob-export-gate.ts).
 */
export function assertLegacyBlobExportSourceAllowedForUpsert({
  project,
  existingIntegration,
  nextInternalExportSource,
  isCloud,
}: {
  project: { createdAt: Date };
  existingIntegration: { createdAt: Date } | null;
  nextInternalExportSource: AnalyticsIntegrationExportSource;
  isCloud: boolean;
}): void {
  // Project-level post-cutoff gate first (shared with REST). Throws on a
  // post-cutoff Cloud project + legacy source regardless of the row's age.
  assertLegacyBlobExportSourceAllowed({
    project,
    nextInternalExportSource,
    isCloud,
  });

  if (
    !(LEGACY_BLOB_EXPORT_SOURCES as ReadonlyArray<string>).includes(
      nextInternalExportSource,
    )
  )
    return; // OBSERVATIONS_V2 (internal: EVENTS) is always allowed.

  if (isLegacyBlobExporter(existingIntegration?.createdAt ?? null, isCloud))
    return;

  // Distinct message from the project-level gate so the two rejection paths can
  // be counted separately in logs. Not customer-facing: the UI prevents this
  // state from arising in the form flow. The date is read from the constant so
  // a NEXT_PUBLIC_LANGFUSE_BLOB_EXPORTER_CUTOFF override stays accurate.
  throw new InvalidRequestError(
    `Legacy export sources are not available for blob storage integrations created on or after ${LEGACY_BLOB_EXPORTER_CUTOFF.toISOString()} on Cloud. Use 'OBSERVATIONS_V2' instead.`,
  );
}
