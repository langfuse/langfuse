import {
  InvalidRequestError,
  LEGACY_BLOB_EXPORT_CUTOFF,
  LEGACY_BLOB_EXPORT_SOURCES,
} from "@langfuse/shared";
import { type AnalyticsIntegrationExportSource } from "@langfuse/shared/src/db";

export function assertLegacyBlobExportSourceAllowed({
  project,
  nextInternalExportSource,
  isCloud,
}: {
  project: { createdAt: Date };
  nextInternalExportSource: AnalyticsIntegrationExportSource;
  isCloud: boolean;
}): void {
  // Self-hosted deployments bypass the gate entirely.
  if (!isCloud) return;

  // EVENTS (OBSERVATIONS_V2) is always allowed.
  if (
    !(LEGACY_BLOB_EXPORT_SOURCES as ReadonlyArray<string>).includes(
      nextInternalExportSource,
    )
  )
    return;

  // Projects created before the cutoff are grandfathered.
  if (project.createdAt < LEGACY_BLOB_EXPORT_CUTOFF) return;

  throw new InvalidRequestError(
    "Legacy export sources (TRACES_OBSERVATIONS, TRACES_OBSERVATIONS_EVENTS) are not available for projects created on or after 2026-05-20. Use 'OBSERVATIONS_V2' ('EVENTS') instead.",
  );
}
