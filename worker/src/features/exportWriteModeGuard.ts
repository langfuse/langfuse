import {
  areLegacyWritesActive,
  validateExportSource,
  type AnalyticsIntegrationExportSource,
} from "@langfuse/shared";
import { env, v4WritesToEventsTable } from "../env";

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
    enrichedAvailable: v4WritesToEventsTable(env),
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
