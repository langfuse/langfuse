import {
  areLegacyWritesActive,
  validateExportSource,
  type AnalyticsIntegrationExportSource,
} from "@langfuse/shared";
import { env } from "../env";

/**
 * Legacy-source write-mode guard for the export workers (blob storage,
 * PostHog, Mixpanel) — thin adapter over validateExportSource; policy and
 * rationale in export-source-policy.ts. Throws BEFORE any export work so each
 * handler's normal failure path (log + rethrow, BullMQ retry, and for blob
 * storage lastError persistence + admin notification) takes over instead of
 * silently exporting stale/empty data while sync state advances (LFE-10148).
 *
 * The env read lives here in worker code. `remediation` is the
 * operator-actionable closing sentence, per integration.
 */
export function assertLegacyExportSourceWritable(
  exportSource: AnalyticsIntegrationExportSource,
  remediation: string,
): void {
  const validation = validateExportSource(exportSource, {
    // Capability-only context: no dates → the Cloud cutoffs never fire here
    // (they gate writes, not running exports), and enriched availability has
    // its own dedicated worker guard.
    isCloud: false,
    enrichedAvailable: true,
    legacyWritesActive: areLegacyWritesActive(
      env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
    ),
  });
  if (validation.ok) return;
  throw new Error(
    `The configured export source reads the legacy traces/observations tables, but this deployment runs LANGFUSE_MIGRATION_V4_WRITE_MODE=events_only and no longer writes them. ${remediation}`,
  );
}
