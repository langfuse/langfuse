// Export-source availability policy for analytics integrations (blob storage,
// PostHog, Mixpanel). Client-safe: no server env reads — adapters assemble an
// ExportSourceContext from whatever they can read (env, DB rows, tRPC
// responses) and every decision funnels through the two policy functions
// below. UI option lists, the server upsert asserts, the in-transaction
// service backstop, and the worker guards are all thin adapters over this
// module.
//
// The reasoning, in one place:
//
// - CLOUD DATE CUTOFFS ("cloud-cutoff"): Cloud projects created on or after
//   LEGACY_BLOB_EXPORT_CUTOFF, and Cloud blob storage integration rows created
//   on or after LEGACY_BLOB_EXPORTER_CUTOFF (including brand-new rows), cannot
//   use legacy export sources. These cutoffs are Cloud-only by design,
//   permanently: their dates are arbitrary from a self-hosted operator's
//   perspective (LFE-10065, LFE-10148). They apply to newly chosen values
//   only — a persisted legacy value on an old row is grandfathered, which is
//   why the cutoffs key on creation dates rather than the write path.
// - ENRICHED AVAILABILITY ("enriched-unavailable"): sources that include the
//   enriched observations path (EVENTS, TRACES_OBSERVATIONS_EVENTS) need the
//   enriched read path — available on Cloud, or on self-hosted via the V4
//   preview opt-in. A persisted enriched value left behind by a preview
//   rollback is rejected too, instead of silently driving exports against
//   unpopulated tables (LFE-10296).
// - LEGACY WRITE CAPABILITY ("legacy-writes-disabled"): legacy sources read
//   the v3 traces/observations tables. Under
//   LANGFUSE_MIGRATION_V4_WRITE_MODE=events_only those tables are no longer
//   written, so a legacy source would silently export stale/empty data —
//   blocked by data capability, deployment-agnostic, on Cloud and self-hosted
//   alike (LFE-10148). Unlike the date cutoffs this also applies to persisted
//   values: keeping one would not grandfather anything, it would export
//   nothing.
// - PERSISTED VALUES ARE NEVER SILENTLY REWRITTEN (LFE-10296): the UI keeps a
//   persisted-but-blocked source visible as an unavailable option and blocks
//   the save; forms and servers must not substitute a different source behind
//   the user's back.
//
// Check order inside validateExportSource doubles as the user-facing reason
// precedence: enriched-unavailable first (such a source cannot export at all),
// then the Cloud cutoffs — so Cloud users are never shown messaging about
// deployment configuration they do not control — then legacy-writes-disabled,
// which in practice only surfaces on self-hosted (Cloud does not run
// events_only), where naming the env var is operator-appropriate.

import { AnalyticsIntegrationExportSource } from "@prisma/client";

// NEXT_PUBLIC_LANGFUSE_BLOB_EXPORT_CUTOFF / _EXPORTER_CUTOFF override the
// defaults for local dev testing.
const _override = process.env.NEXT_PUBLIC_LANGFUSE_BLOB_EXPORT_CUTOFF
  ? new Date(process.env.NEXT_PUBLIC_LANGFUSE_BLOB_EXPORT_CUTOFF)
  : null;
export const LEGACY_BLOB_EXPORT_CUTOFF =
  _override && !isNaN(_override.getTime())
    ? _override
    : new Date("2026-05-20T00:00:00.000Z");

const _exporterOverride = process.env.NEXT_PUBLIC_LANGFUSE_BLOB_EXPORTER_CUTOFF
  ? new Date(process.env.NEXT_PUBLIC_LANGFUSE_BLOB_EXPORTER_CUTOFF)
  : null;
export const LEGACY_BLOB_EXPORTER_CUTOFF =
  _exporterOverride && !isNaN(_exporterOverride.getTime())
    ? _exporterOverride
    : new Date("2026-06-22T00:00:00.000Z");

// satisfies ensures each element remains a valid enum member — catches renames
// at compile time. A new enum variant does NOT automatically error here; the
// lists must be reviewed manually.
export const LEGACY_BLOB_EXPORT_SOURCES = [
  AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
  AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
] as const satisfies ReadonlyArray<AnalyticsIntegrationExportSource>;

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
 * Whether an export source is one of the deprecated legacy sources — i.e. it
 * still exports the legacy traces/observations tables. True for both
 * TRACES_OBSERVATIONS and TRACES_OBSERVATIONS_EVENTS (the latter exports the
 * legacy tables *and* the enriched events); false for the EVENTS-only source.
 * Symmetric with isEnrichedBlobExportSource.
 */
export function isLegacyBlobExportSource(
  source: AnalyticsIntegrationExportSource | null | undefined,
): boolean {
  return (
    source != null &&
    (
      LEGACY_BLOB_EXPORT_SOURCES as readonly AnalyticsIntegrationExportSource[]
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
 *
 * validateExportSource expresses the integration-level cutoff through this
 * predicate; it is also exported for row-age heuristics outside the policy
 * (e.g. the worker's deprecation-notice cleanup).
 */
export function isLegacyBlobExporter(
  integrationCreatedAt: Date | null,
  isCloud: boolean,
): boolean {
  if (!isCloud) return true;
  if (integrationCreatedAt == null) return false;
  return integrationCreatedAt < LEGACY_BLOB_EXPORTER_CUTOFF;
}

/** Enriched export path availability: Cloud, or self-hosted V4 preview opt-in. */
export function isEnrichedBlobExportAvailable(
  isCloud: boolean,
  isV4PreviewEnabled?: boolean,
): boolean {
  return isCloud || isV4PreviewEnabled === true;
}

/**
 * Mirrors the LANGFUSE_MIGRATION_V4_WRITE_MODE env enum; kept as a literal
 * union so this client-safe file has no dependency on server env parsing.
 */
export type BlobExportWriteMode = "legacy" | "dual" | "events_only";

/** Whether the deployment still writes the v3 traces/observations tables. */
export function areLegacyWritesActive(writeMode: BlobExportWriteMode): boolean {
  return writeMode !== "events_only";
}

/**
 * Everything the policy needs to know about a deployment/project/integration.
 * Adapters assemble it (env reads stay server/worker-side); optional fields
 * skip their check when absent:
 * - projectCreatedAt: omit to skip the project-level Cloud cutoff (e.g. when
 *   the caller has no project in scope).
 * - integrationCreatedAt: omit to skip the integration-level Cloud cutoff
 *   (PostHog/Mixpanel have no such cutoff); pass null for "no existing row",
 *   which follows new-customer rules on Cloud.
 */
export type ExportSourceContext = {
  isCloud: boolean;
  enrichedAvailable: boolean;
  legacyWritesActive: boolean;
  projectCreatedAt?: Date;
  integrationCreatedAt?: Date | null;
};

export type ExportSourceBlockedReason =
  | "cloud-cutoff"
  | "legacy-writes-disabled"
  | "enriched-unavailable";

export type ExportSourceValidation =
  | { ok: true }
  | { ok: false; reason: ExportSourceBlockedReason; message: string };

const ENRICHED_UNAVAILABLE_MESSAGE =
  "Enriched blob export is not available on this deployment";

// Distinct messages for the two Cloud-cutoff paths so rejections can be
// counted separately in logs. Customer-facing via the public REST PUT.
const PROJECT_CUTOFF_MESSAGE =
  "Legacy export sources are not available for Cloud projects created on or after 2026-05-20. Use 'OBSERVATIONS_V2' instead.";
const exporterCutoffMessage = () =>
  `Legacy export sources are not available for blob storage integrations created on or after ${LEGACY_BLOB_EXPORTER_CUTOFF.toISOString()} on Cloud. Use 'OBSERVATIONS_V2' instead.`;

// Self-hosted-operator-facing: naming the env var is intentional. Worded
// integration-neutrally since blob storage, PostHog, and Mixpanel all surface
// it. (The Cloud-cutoff messages above keep their pre-existing
// 'OBSERVATIONS_V2' blob-REST wording; tracked under LFE-9688.)
const LEGACY_WRITES_DISABLED_MESSAGE =
  "Legacy export sources are not available while LANGFUSE_MIGRATION_V4_WRITE_MODE=events_only, because the legacy traces/observations tables are no longer written. Switch to the enriched observations export source instead.";

/** Whether a source may be selected/kept in the given context. */
export function validateExportSource(
  source: AnalyticsIntegrationExportSource,
  ctx: ExportSourceContext,
): ExportSourceValidation {
  if (isEnrichedBlobExportSource(source) && !ctx.enrichedAvailable) {
    return {
      ok: false,
      reason: "enriched-unavailable",
      message: ENRICHED_UNAVAILABLE_MESSAGE,
    };
  }
  if (isLegacyBlobExportSource(source) && ctx.isCloud) {
    if (
      ctx.projectCreatedAt !== undefined &&
      ctx.projectCreatedAt >= LEGACY_BLOB_EXPORT_CUTOFF
    ) {
      return {
        ok: false,
        reason: "cloud-cutoff",
        message: PROJECT_CUTOFF_MESSAGE,
      };
    }
    if (
      ctx.integrationCreatedAt !== undefined &&
      !isLegacyBlobExporter(ctx.integrationCreatedAt, ctx.isCloud)
    ) {
      return {
        ok: false,
        reason: "cloud-cutoff",
        message: exporterCutoffMessage(),
      };
    }
  }
  if (isLegacyBlobExportSource(source) && !ctx.legacyWritesActive) {
    return {
      ok: false,
      reason: "legacy-writes-disabled",
      message: LEGACY_WRITES_DISABLED_MESSAGE,
    };
  }
  return { ok: true };
}

export type AvailableExportSource = {
  source: AnalyticsIntegrationExportSource;
  blockedReason?: ExportSourceBlockedReason;
};

// UI display order; matches EXPORT_SOURCE_OPTIONS in ./index.ts.
const EXPORT_SOURCE_ORDER = [
  AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
  AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
  AnalyticsIntegrationExportSource.EVENTS,
] as const satisfies ReadonlyArray<AnalyticsIntegrationExportSource>;

/** All sources with their blocked reason (if any) in the given context. */
export function getAvailableExportSources(
  ctx: ExportSourceContext,
): AvailableExportSource[] {
  return EXPORT_SOURCE_ORDER.map((source) => {
    const validation = validateExportSource(source, ctx);
    return validation.ok
      ? { source }
      : { source, blockedReason: validation.reason };
  });
}
