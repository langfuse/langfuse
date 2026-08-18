import {
  AnalyticsIntegrationExportSource,
  areEnrichedWritesActive,
  areLegacyWritesActive,
  EXPORT_SOURCE_OPTIONS,
  getAvailableExportSources,
  validateExportSource,
  type BlobExportWriteMode,
  type ExportSourceBlockedReason,
  type ExportSourceContext,
  type ExportSourceOption,
} from "@langfuse/shared";

// UI adapters over the export-source policy, shared by the blob-storage,
// PostHog, and Mixpanel settings forms. Policy and rationale live in
// packages/shared/.../export-source-policy.ts.

// The write mode is server-only, so every settings page receives it from its
// tRPC get response and derives both capabilities here.
export function buildExportSourceContext({
  writeMode,
  isCloud,
  projectCreatedAt,
  integrationCreatedAt,
}: {
  writeMode: BlobExportWriteMode;
  isCloud: boolean;
  projectCreatedAt?: Date;
  integrationCreatedAt?: Date | null;
}): ExportSourceContext {
  return {
    isCloud,
    enrichedAvailable: areEnrichedWritesActive(writeMode),
    legacyWritesActive: areLegacyWritesActive(writeMode),
    projectCreatedAt,
    integrationCreatedAt,
  };
}

export function isExportSourceSelectable(
  source: AnalyticsIntegrationExportSource,
  ctx: ExportSourceContext,
): boolean {
  return validateExportSource(source, ctx).ok;
}

// The persisted value always wins so initialize+save can never silently
// rewrite it (LFE-10296); validation blocks the save if it is not selectable.
export function getExportSourceFormValue(
  persisted: AnalyticsIntegrationExportSource | null | undefined,
  ctx: ExportSourceContext,
): AnalyticsIntegrationExportSource {
  if (persisted) return persisted;
  const legacySelectable = isExportSourceSelectable(
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    ctx,
  );
  return ctx.enrichedAvailable || !legacySelectable
    ? AnalyticsIntegrationExportSource.EVENTS
    : AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS;
}

export type SelectableExportSourceOption = ExportSourceOption & {
  unavailable: boolean;
};

// A single selectable option carries no decision, so the selector is hidden.
// When the sole option is the stale persisted source, keep the selector: the
// unavailable-source alert refers to it and hiding it would strand the user
// with a blocked save.
export function shouldHideExportSourceSelector(
  options: SelectableExportSourceOption[],
): boolean {
  return options.length === 1 && !options[0].unavailable;
}

// Selectable sources, plus the persisted one (marked unavailable) when it is
// no longer selectable, so the conflict is visible rather than silently
// rewritten (LFE-10296).
export function getExportSourceOptions(
  persisted: AnalyticsIntegrationExportSource | null | undefined,
  ctx: ExportSourceContext,
): SelectableExportSourceOption[] {
  return getAvailableExportSources(ctx).flatMap(({ source, blockedReason }) => {
    if (blockedReason && source !== persisted) return [];
    const option = EXPORT_SOURCE_OPTIONS.find((o) => o.value === source);
    if (!option) return [];
    return [{ ...option, unavailable: blockedReason !== undefined }];
  });
}

/**
 * Selector visibility and initial form value for the PostHog and Mixpanel
 * settings forms, which derive both identically. `isBetaEnabled` is the V4
 * preview opt-in; on Cloud the selector does not depend on it, because enriched
 * export is always available there.
 */

// Post-cutoff Cloud: legacy sources are off the table, so a row with no
// persisted source has no decision to make — the selector is hidden and the
// form value is pinned to EVENTS. Brand-new Cloud rows land here too; they
// follow new-customer rules.
function isPostCutoffCloud(ctx: ExportSourceContext): boolean {
  const legacyValidation = validateExportSource(
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    ctx,
  );
  return !legacyValidation.ok && legacyValidation.reason === "cloud-cutoff";
}

// A persisted source the context no longer allows must stay visible and stay in
// the form: the pin decides what a *new* row gets, never what an existing row
// silently becomes (LFE-10296). This holds for every blocked reason — including
// the Cloud cutoffs, which a row can postdate whenever it was created after the
// cutoff date but before the pin shipped.
function isPersistedBlocked(
  persisted: AnalyticsIntegrationExportSource | null | undefined,
  ctx: ExportSourceContext,
): boolean {
  return persisted != null && !isExportSourceSelectable(persisted, ctx);
}

export function shouldShowExportSourceField({
  persisted,
  ctx,
  isBetaEnabled,
  options,
}: {
  persisted: AnalyticsIntegrationExportSource | null | undefined;
  ctx: ExportSourceContext;
  isBetaEnabled: boolean;
  options: SelectableExportSourceOption[];
}): boolean {
  const pinned = isPostCutoffCloud(ctx);
  // Forces the field visible so the blocked-save alert has something to point
  // at, even where the pin would otherwise hide it.
  const persistedBlocked = isPersistedBlocked(persisted, ctx);
  return (
    (((ctx.isCloud || isBetaEnabled) && !pinned) || persistedBlocked) &&
    !shouldHideExportSourceSelector(options)
  );
}

export function getDefaultExportSource({
  persisted,
  ctx,
  isBetaEnabled,
}: {
  persisted: AnalyticsIntegrationExportSource | null | undefined;
  ctx: ExportSourceContext;
  isBetaEnabled: boolean;
}): AnalyticsIntegrationExportSource {
  if (persisted) return persisted;
  if (isPostCutoffCloud(ctx)) return AnalyticsIntegrationExportSource.EVENTS;
  return ctx.isCloud || isBetaEnabled || !ctx.legacyWritesActive
    ? AnalyticsIntegrationExportSource.EVENTS
    : AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS;
}

// Blocked-save alert body per policy reason.
const EXPORT_SOURCE_UNAVAILABLE_MESSAGES: Record<
  ExportSourceBlockedReason,
  string
> = {
  "enriched-unavailable":
    "This integration is configured to export enriched observations, but this deployment runs LANGFUSE_MIGRATION_V4_WRITE_MODE=legacy and does not write the enriched observations table. Saving is blocked until you select an available export source above.",
  "cloud-cutoff":
    "This integration is configured to export legacy traces and observations, which is no longer available for this project. Saving is blocked until you select an available export source above.",
  // Self-hosted-operator-facing: naming the env var is intentional.
  "legacy-writes-disabled":
    "This integration is configured to export legacy traces and observations, but this deployment runs LANGFUSE_MIGRATION_V4_WRITE_MODE=events_only and no longer writes the legacy traces/observations tables. Saving is blocked until you select an available export source above.",
};

export function getExportSourceUnavailableMessage(
  reason: ExportSourceBlockedReason,
): string {
  return EXPORT_SOURCE_UNAVAILABLE_MESSAGES[reason];
}
