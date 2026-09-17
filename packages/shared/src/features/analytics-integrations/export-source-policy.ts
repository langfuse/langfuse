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
//   LEGACY_EXPORT_PROJECT_CUTOFF, and Cloud integration rows created on or after
//   their family's exporter cutoff (including brand-new rows), cannot
//   use legacy export sources. These cutoffs are Cloud-only by design,
//   permanently: their dates are arbitrary from a self-hosted operator's
//   perspective. They apply to newly chosen values
//   only — a persisted legacy value on an old row is grandfathered, which is
//   why the cutoffs key on creation dates rather than the write path.
// - ENRICHED AVAILABILITY ("enriched-unavailable"): sources that include the
//   enriched observations path (EVENTS, TRACES_OBSERVATIONS_EVENTS) read the v4
//   events table. Under LANGFUSE_MIGRATION_V4_WRITE_MODE=legacy that table is
//   not written, so such a source would export nothing.
// - LEGACY WRITE CAPABILITY ("legacy-writes-disabled"): legacy sources read
//   the v3 traces/observations tables. Under
//   LANGFUSE_MIGRATION_V4_WRITE_MODE=events_only those tables are no longer
//   written, so a legacy source would silently export stale/empty data.
//
//   Both are data capability, deployment-agnostic, on Cloud and self-hosted
//   alike, and derived from the one write mode via areEnrichedWritesActive /
//   areLegacyWritesActive. Unlike the date cutoffs
//   they also apply to persisted values: keeping one would not grandfather
//   anything, it would export nothing. TRACES_OBSERVATIONS_EVENTS is both
//   families at once, so it needs dual — that falls out of the two rules
//   rather than being special-cased.
// - PERSISTED VALUES ARE NEVER SILENTLY REWRITTEN: the UI keeps a
//   persisted-but-blocked source visible as an unavailable option and blocks
//   the save; forms and servers must not substitute a different source behind
//   the user's back.
// - ONE DEFAULT FOR A NEW ROW: defaultExportSource is the single answer to
//   "which source should a brand-new integration get". Settings pages, tRPC
//   routers and the public REST API all call it, so a create through any of
//   them lands the same source. It prefers the enriched path wherever the
//   deployment writes it.
//
// Check order inside validateExportSource doubles as the user-facing reason
// precedence: enriched-unavailable first (such a source cannot export at all),
// then the Cloud cutoffs — so Cloud users are never shown messaging about
// deployment configuration they do not control — then legacy-writes-disabled,
// which in practice only surfaces on self-hosted (Cloud does not run
// events_only), where naming the env var is operator-appropriate.

import { AnalyticsIntegrationExportSource } from "@prisma/client";

// An unset or unparsable override falls back to the shipped default, so a typo
// in a local .env degrades to production behaviour rather than NaN dates.
function cutoffFromEnv(
  override: string | undefined,
  fallbackIso: string,
): Date {
  if (!override) return new Date(fallbackIso);
  const parsed = new Date(override);
  return isNaN(parsed.getTime()) ? new Date(fallbackIso) : parsed;
}

// The NEXT_PUBLIC_* overrides exist for local dev testing of the cutoffs.
export const LEGACY_EXPORT_PROJECT_CUTOFF = cutoffFromEnv(
  process.env.NEXT_PUBLIC_LANGFUSE_BLOB_EXPORT_CUTOFF,
  "2026-05-20T00:00:00.000Z",
);

export const LEGACY_BLOB_EXPORTER_CUTOFF = cutoffFromEnv(
  process.env.NEXT_PUBLIC_LANGFUSE_BLOB_EXPORTER_CUTOFF,
  "2026-06-22T00:00:00.000Z",
);

// PostHog/Mixpanel run their own, later exporter cutoff: their integration-level
// gate ships after blob storage's, so reusing the blob date would retroactively
// invalidate rows that were legitimately created on a legacy source.
export const LEGACY_ANALYTICS_EXPORTER_CUTOFF = cutoffFromEnv(
  process.env.NEXT_PUBLIC_LANGFUSE_ANALYTICS_EXPORTER_CUTOFF,
  "2026-08-19T00:00:00.000Z",
);

// satisfies ensures each element remains a valid enum member — catches renames
// at compile time. A new enum variant does NOT automatically error here; the
// lists must be reviewed manually.
export const LEGACY_EXPORT_SOURCES = [
  AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
  AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
] as const satisfies ReadonlyArray<AnalyticsIntegrationExportSource>;

export const ENRICHED_EXPORT_SOURCES = [
  AnalyticsIntegrationExportSource.EVENTS,
  AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
] as const satisfies ReadonlyArray<AnalyticsIntegrationExportSource>;

export function isEnrichedExportSource(
  source: AnalyticsIntegrationExportSource | null | undefined,
): boolean {
  return (
    source != null &&
    (
      ENRICHED_EXPORT_SOURCES as readonly AnalyticsIntegrationExportSource[]
    ).includes(source)
  );
}

/**
 * Whether an export source is one of the deprecated legacy sources — i.e. it
 * still exports the legacy traces/observations tables. True for both
 * TRACES_OBSERVATIONS and TRACES_OBSERVATIONS_EVENTS (the latter exports the
 * legacy tables *and* the enriched events); false for the EVENTS-only source.
 * Symmetric with isEnrichedExportSource.
 */
export function isLegacyExportSource(
  source: AnalyticsIntegrationExportSource | null | undefined,
): boolean {
  return (
    source != null &&
    (
      LEGACY_EXPORT_SOURCES as readonly AnalyticsIntegrationExportSource[]
    ).includes(source)
  );
}

/**
 * Whether an integration row counts as legacy — i.e. may still use legacy
 * export sources. Applied to the integration row's `createdAt`.
 *
 * - `!isCloud` → `true`: self-hosted is exempt (cutoff does not apply).
 * - `null` createdAt → `false`: no existing row means a brand-new integration,
 *   which follows new-customer rules.
 * - otherwise legacy iff the row was created strictly before the cutoff.
 *
 * `exporterCutoff` defaults to the blob date so existing blob callers are
 * unaffected; each integration family passes its own.
 *
 * validateExportSource expresses the integration-level cutoff through this
 * predicate; it is also exported for row-age heuristics outside the policy
 * (e.g. the worker's deprecation-notice cleanup).
 */
export function isLegacyExporter(
  integrationCreatedAt: Date | null,
  isCloud: boolean,
  exporterCutoff: Date = LEGACY_BLOB_EXPORTER_CUTOFF,
): boolean {
  if (!isCloud) return true;
  if (integrationCreatedAt == null) return false;
  return integrationCreatedAt < exporterCutoff;
}

/**
 * Mirrors the LANGFUSE_MIGRATION_V4_WRITE_MODE env enum; kept as a literal
 * union so this client-safe file has no dependency on server env parsing.
 */
export type V4WriteMode = "legacy" | "dual" | "events_only";

/** Whether the deployment still writes the v3 traces/observations tables. */
export function areLegacyWritesActive(writeMode: V4WriteMode): boolean {
  return writeMode !== "events_only";
}

/** Whether the deployment already writes the v4 events table. */
export function areEnrichedWritesActive(writeMode: V4WriteMode): boolean {
  return writeMode !== "legacy";
}

/**
 * Everything the policy needs to know about a deployment/project/integration.
 * Adapters assemble it (env reads stay server/worker-side); optional fields
 * skip their check when absent:
 * - projectCreatedAt: omit to skip the project-level Cloud cutoff (e.g. when
 *   the caller has no project in scope).
 * - integrationCreatedAt: omit to skip the integration-level Cloud cutoff; pass
 *   null for "no existing row", which follows new-customer rules on Cloud.
 * - exporterCutoff: the integration-level cutoff date. Each integration family
 *   has its own; defaults to LEGACY_BLOB_EXPORTER_CUTOFF.
 */
export type ExportSourceContext = {
  isCloud: boolean;
  enrichedAvailable: boolean;
  legacyWritesActive: boolean;
  projectCreatedAt?: Date;
  integrationCreatedAt?: Date | null;
  exporterCutoff?: Date;
};

export type ExportSourceBlockedReason =
  | "cloud-cutoff"
  | "legacy-writes-disabled"
  | "enriched-unavailable";

export type ExportSourceValidation =
  | { ok: true }
  | { ok: false; reason: ExportSourceBlockedReason; message: string };

// Self-hosted-operator-facing: enriched writes are only absent under the legacy
// write mode, which Cloud never runs, so naming the env var is appropriate.
// Worded integration-neutrally — blob storage, PostHog and Mixpanel all reach
// it, so it must not name any one of them.
const ENRICHED_UNAVAILABLE_MESSAGE =
  "Enriched export sources are not available while LANGFUSE_MIGRATION_V4_WRITE_MODE=legacy, because the enriched observations table is not written. Switch to a legacy export source instead.";

// Distinct messages for the two Cloud-cutoff paths so rejections can be
// counted separately in logs. Customer-facing via the public REST PUT.
const PROJECT_CUTOFF_MESSAGE =
  "Legacy export sources are not available for Cloud projects created on or after 2026-05-20. Use 'OBSERVATIONS_V2' instead.";
// Covers both integration-level rejections: a brand-new integration (which
// follows new-customer rules whatever today's date is) and an existing one that
// postdates the cutoff. Worded integration-neutrally — blob storage, PostHog and
// Mixpanel all reach it, each with its own cutoff.
const exporterCutoffMessage = (
  exporterCutoff: Date = LEGACY_BLOB_EXPORTER_CUTOFF,
) =>
  `Legacy export sources are not available on Cloud for new integrations, or for integrations created on or after ${exporterCutoff.toISOString()}. Use 'OBSERVATIONS_V2' instead.`;

// Self-hosted-operator-facing: naming the env var is intentional. Worded
// integration-neutrally since blob storage, PostHog, and Mixpanel all surface
// it.
const LEGACY_WRITES_DISABLED_MESSAGE =
  "Legacy export sources are not available while LANGFUSE_MIGRATION_V4_WRITE_MODE=events_only, because the legacy traces/observations tables are no longer written. Switch to the enriched observations export source instead.";

/** Whether a source may be selected/kept in the given context. */
export function validateExportSource(
  source: AnalyticsIntegrationExportSource,
  ctx: ExportSourceContext,
): ExportSourceValidation {
  if (isEnrichedExportSource(source) && !ctx.enrichedAvailable) {
    return {
      ok: false,
      reason: "enriched-unavailable",
      message: ENRICHED_UNAVAILABLE_MESSAGE,
    };
  }
  if (isLegacyExportSource(source) && ctx.isCloud) {
    if (
      ctx.projectCreatedAt !== undefined &&
      ctx.projectCreatedAt >= LEGACY_EXPORT_PROJECT_CUTOFF
    ) {
      return {
        ok: false,
        reason: "cloud-cutoff",
        message: PROJECT_CUTOFF_MESSAGE,
      };
    }
    if (
      ctx.integrationCreatedAt !== undefined &&
      !isLegacyExporter(
        ctx.integrationCreatedAt,
        ctx.isCloud,
        ctx.exporterCutoff,
      )
    ) {
      return {
        ok: false,
        reason: "cloud-cutoff",
        message: exporterCutoffMessage(ctx.exporterCutoff),
      };
    }
  }
  if (isLegacyExportSource(source) && !ctx.legacyWritesActive) {
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

/**
 * The source a brand-new integration should be created with — the one default
 * shared by the settings pages, the tRPC routers and the public REST API, so a
 * create through any of them lands the same value.
 *
 * Enriched wins wherever the deployment writes it: it is the recommended source
 * and the only one that survives the v4 migration. The legacy source is only
 * chosen when the deployment cannot serve enriched at all (write mode `legacy`)
 * *and* legacy is actually selectable here — on a post-cutoff Cloud project it
 * is not, so enriched is returned even though it cannot export yet. That case
 * is a misconfigured deployment, and returning a source the caller is forbidden
 * to pick would fail the save with no selectable value left to offer.
 *
 * Callers must not substitute this for a persisted value; it answers CREATE
 * only. See the "persisted values are never silently rewritten" note above.
 */
export function defaultExportSource(
  ctx: ExportSourceContext,
): AnalyticsIntegrationExportSource {
  const legacySelectable = validateExportSource(
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    ctx,
  ).ok;
  return ctx.enrichedAvailable || !legacySelectable
    ? AnalyticsIntegrationExportSource.EVENTS
    : AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS;
}
