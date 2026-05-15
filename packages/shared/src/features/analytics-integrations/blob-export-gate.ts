// Business rules for the legacy blob export source deprecation gate.
// This is a client-safe file that can be imported from @langfuse/shared.

import { AnalyticsIntegrationExportSource } from "@prisma/client";

// Cloud projects created on or after this instant cannot use legacy export sources.
// NEXT_PUBLIC_LANGFUSE_BLOB_EXPORT_CUTOFF overrides the default for local dev testing.
export const LEGACY_BLOB_EXPORT_CUTOFF = process.env
  .NEXT_PUBLIC_LANGFUSE_BLOB_EXPORT_CUTOFF
  ? new Date(process.env.NEXT_PUBLIC_LANGFUSE_BLOB_EXPORT_CUTOFF)
  : new Date("2026-05-20T00:00:00.000Z");

// Internal enum values that are considered "legacy". satisfies ensures TypeScript
// errors if a new AnalyticsIntegrationExportSource variant is added without
// reconsidering whether it belongs here.
export const LEGACY_BLOB_EXPORT_SOURCES = [
  AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
  AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
] as const satisfies ReadonlyArray<AnalyticsIntegrationExportSource>;

/**
 * Returns true when a project may use legacy blob export sources.
 * False means the project is post-cutoff Cloud and must use ENRICHED only.
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
