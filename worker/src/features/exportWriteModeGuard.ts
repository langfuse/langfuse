import {
  areEnrichedWritesActive,
  areLegacyWritesActive,
  isLegacyExportSource,
  validateExportSource,
  type AnalyticsIntegrationExportSource,
} from "@langfuse/shared";
import { logger, recordIncrement } from "@langfuse/shared/src/server";
import { isV4CutoffActive } from "@langfuse/shared/src/server/v4Cutoff";
import { env } from "../env";

/**
 * The export source a run uses. While the Cloud v3 export cutoff applies to the
 * project, a legacy source exports like EVENTS: observations_v2 and scores, no
 * legacy traces or observations. The persisted source stays as configured.
 */
export function effectiveExportSource(
  exportSource: AnalyticsIntegrationExportSource,
  projectId: string,
): AnalyticsIntegrationExportSource {
  if (
    !isLegacyExportSource(exportSource) ||
    !isV4CutoffActive({
      cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
      enabled: env.LANGFUSE_V4_CUTOFF_EXPORTS,
      exemptProjectIds: env.LANGFUSE_V4_CUTOFF_EXEMPT_PROJECT_IDS,
      projectId,
    })
  ) {
    return exportSource;
  }
  recordIncrement("langfuse.v4_cutoff", 1, { surface: "exports" });
  logger.info("Langfuse v3 cutoff", {
    surface: "exports",
    projectId,
    exportSource,
  });
  return "EVENTS";
}

/**
 * Write-mode guard for the export workers (blob storage, PostHog, Mixpanel);
 * policy in export-source-policy.ts. Throws BEFORE any export work so the
 * handler's failure path takes over instead of silently exporting stale/empty
 * data while sync state advances. Guards both directions: legacy sources on
 * events_only (LFE-10148), enriched sources on legacy mode (LFE-11009).
 * `legacyRemediation` is the per-integration closing sentence of the
 * legacy-source error; the enriched error is integration-neutral (the fix is
 * the write mode, not an integration setting).
 */
export function assertExportSourceWritable(
  exportSource: AnalyticsIntegrationExportSource,
  legacyRemediation: string,
): void {
  const validation = validateExportSource(exportSource, {
    // No dates: the Cloud cutoffs gate writes, not running exports.
    isCloud: false,
    enrichedAvailable: areEnrichedWritesActive(
      env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
    ),
    legacyWritesActive: areLegacyWritesActive(
      env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
    ),
  });
  if (validation.ok) return;
  if (validation.reason === "enriched-unavailable") {
    throw new Error(
      "The configured export source reads the enriched events tables, but this deployment runs LANGFUSE_MIGRATION_V4_WRITE_MODE=legacy and does not write them. Set LANGFUSE_MIGRATION_V4_WRITE_MODE to dual or events_only, or select a legacy export source.",
    );
  }
  throw new Error(
    `The configured export source reads the legacy traces/observations tables, but this deployment runs LANGFUSE_MIGRATION_V4_WRITE_MODE=events_only and no longer writes them. ${legacyRemediation}`,
  );
}
