import {
  InvalidRequestError,
  isLegacyBlobExportAllowed,
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
  if (
    !(LEGACY_BLOB_EXPORT_SOURCES as ReadonlyArray<string>).includes(
      nextInternalExportSource,
    )
  )
    return; // OBSERVATIONS_V2 (internal: EVENTS) is always allowed.

  if (isLegacyBlobExportAllowed(project.createdAt, isCloud)) return;

  throw new InvalidRequestError(
    "Legacy export sources are not available for Cloud projects created on or after 2026-05-20. Use 'OBSERVATIONS_V2' instead.",
  );
}
