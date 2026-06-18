import {
  type AnalyticsIntegrationExportSource,
  InvalidRequestError,
  isEnrichedBlobExportAvailable,
  isEnrichedBlobExportSource,
} from "@langfuse/shared";

/**
 * Rejects enriched export sources (EVENTS, TRACES_OBSERVATIONS_EVENTS) on
 * deployments where the enriched export path is unavailable (self-hosted
 * without the V4 preview opt-in).
 *
 * For partial updates that omit exportSource, the persisted value stays in
 * effect — pass it as existingExportSource so a stale enriched value left
 * behind by a V4-preview flag rollback is rejected instead of silently
 * driving the worker against unpopulated tables.
 */
export function assertEnrichedBlobExportSourceAllowed({
  nextInternalExportSource,
  existingExportSource,
  isCloud,
  isV4PreviewEnabled,
}: {
  nextInternalExportSource: AnalyticsIntegrationExportSource | undefined;
  existingExportSource?: AnalyticsIntegrationExportSource | null;
  isCloud: boolean;
  isV4PreviewEnabled: boolean;
}): void {
  const effectiveSource = nextInternalExportSource ?? existingExportSource;
  if (!isEnrichedBlobExportSource(effectiveSource)) return;

  if (isEnrichedBlobExportAvailable(isCloud, isV4PreviewEnabled)) return;

  throw new InvalidRequestError(
    "Enriched blob export is not available on this deployment",
  );
}
