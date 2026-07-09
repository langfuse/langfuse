// Business rules for the legacy blob export source deprecation gate.
// This is a client-safe file that can be imported from @langfuse/shared.

import { AnalyticsIntegrationExportSource } from "@prisma/client";

// Cloud projects created on or after this instant cannot use legacy export sources.
// Both cutoffs in this file are Cloud-only by design (the `!isCloud` short-circuits
// below): self-hosted instances can enable the enriched export via the V4 preview
// opt-in, but that must not activate these cutoffs — deprecating legacy sources
// on self-hosted is a separate, still-open decision.
// NEXT_PUBLIC_LANGFUSE_BLOB_EXPORT_CUTOFF overrides the default for local dev testing.
const _override = process.env.NEXT_PUBLIC_LANGFUSE_BLOB_EXPORT_CUTOFF
  ? new Date(process.env.NEXT_PUBLIC_LANGFUSE_BLOB_EXPORT_CUTOFF)
  : null;
export const LEGACY_BLOB_EXPORT_CUTOFF =
  _override && !isNaN(_override.getTime())
    ? _override
    : new Date("2026-05-20T00:00:00.000Z");

// Cloud blob storage integrations created on or after this instant cannot use legacy
// export sources. Symmetric with `LEGACY_BLOB_EXPORT_CUTOFF` (project-level) but applied
// to `BlobStorageIntegration.createdAt` instead of `Project.createdAt`. Cloud-only —
// see the note above.
// NEXT_PUBLIC_LANGFUSE_BLOB_EXPORTER_CUTOFF overrides the default for local dev testing.
const _exporterOverride = process.env.NEXT_PUBLIC_LANGFUSE_BLOB_EXPORTER_CUTOFF
  ? new Date(process.env.NEXT_PUBLIC_LANGFUSE_BLOB_EXPORTER_CUTOFF)
  : null;
export const LEGACY_BLOB_EXPORTER_CUTOFF =
  _exporterOverride && !isNaN(_exporterOverride.getTime())
    ? _exporterOverride
    : new Date("2026-06-22T00:00:00.000Z");

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

// Internal enum values whose export includes the enriched observations
// (events) path. satisfies ensures each element remains a valid
// AnalyticsIntegrationExportSource. Adding a new enum variant does NOT
// automatically produce an error here; the list must be reviewed manually.
export const ENRICHED_BLOB_EXPORT_SOURCES = [
  AnalyticsIntegrationExportSource.EVENTS,
  AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
] as const satisfies ReadonlyArray<AnalyticsIntegrationExportSource>;

export function isEnrichedBlobExportSource(
  source: AnalyticsIntegrationExportSource | null | undefined,
): boolean {
  return (
    source != null &&
    (
      ENRICHED_BLOB_EXPORT_SOURCES as readonly AnalyticsIntegrationExportSource[]
    ).includes(source)
  );
}

/**
 * Whether a blob storage integration row counts as legacy — i.e. may still use
 * legacy export sources. Applied to `BlobStorageIntegration.createdAt`.
 *
 * - `!isCloud` → `true`: self-hosted is exempt (cutoff does not apply).
 * - `null` createdAt → `false`: no existing row means a brand-new integration,
 *   which follows new-customer rules.
 * - otherwise legacy iff the row was created strictly before the cutoff.
 */
export function isLegacyBlobExporter(
  integrationCreatedAt: Date | null,
  isCloud: boolean,
): boolean {
  if (!isCloud) return true;
  if (integrationCreatedAt == null) return false;
  return integrationCreatedAt < LEGACY_BLOB_EXPORTER_CUTOFF;
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
