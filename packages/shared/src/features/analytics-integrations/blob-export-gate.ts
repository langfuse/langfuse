// Business rules for the legacy blob export source deprecation gate.
// This is a client-safe file that can be imported from @langfuse/shared.

import { AnalyticsIntegrationExportSource } from "@prisma/client";

// Cloud projects created on or after this instant cannot use legacy export sources.
// NEXT_PUBLIC_LANGFUSE_BLOB_EXPORT_CUTOFF overrides the default for local dev testing.
const _override = process.env.NEXT_PUBLIC_LANGFUSE_BLOB_EXPORT_CUTOFF
  ? new Date(process.env.NEXT_PUBLIC_LANGFUSE_BLOB_EXPORT_CUTOFF)
  : null;
export const LEGACY_BLOB_EXPORT_CUTOFF =
  _override && !isNaN(_override.getTime())
    ? _override
    : new Date("2026-05-20T00:00:00.000Z");

// Internal enum values that are considered "legacy". satisfies ensures each
// element remains a valid AnalyticsIntegrationExportSource — catches renames or
// removals at compile time. Adding a new enum variant does NOT automatically
// produce an error here; the list must be reviewed manually.
export const LEGACY_BLOB_EXPORT_SOURCES = [
  AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
  AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
] as const satisfies ReadonlyArray<AnalyticsIntegrationExportSource>;

/**
 * Returns true when a project may use legacy blob export sources.
 * False means the project is post-cutoff Cloud and must use OBSERVATIONS_V2 (internal: EVENTS) only.
 *
 * Shared by the server guard (throws when false + legacy source) and the UI
 * (hides legacy dropdown options when false) so the predicate lives once.
 */
export function isLegacyBlobExportAllowed(
  projectCreatedAt: Date,
  isCloud: boolean,
): boolean {
  if (!isCloud) return true;
  return projectCreatedAt < LEGACY_BLOB_EXPORT_CUTOFF;
}

/**
 * Whether this deployment has the enriched events export path.
 * True for Cloud, or for self-hosted instances that have opted into the V4 preview
 * via LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN (server-side only — pass the flag
 * from a server-computed context rather than reading it client-side).
 */
export function isEnrichedBlobExportAvailable(
  isCloud: boolean,
  isV4PreviewEnabled?: boolean,
): boolean {
  return isCloud || isV4PreviewEnabled === true;
}
