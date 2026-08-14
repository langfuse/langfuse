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

export type ExportSourceFieldState = {
  options: SelectableExportSourceOption[];
  showField: boolean;
  defaultValue: AnalyticsIntegrationExportSource;
};

// Everything the three export-source fields need, derived only from deployment
// capability and the project's Cloud cutoff.
//
// A stale persisted source normally keeps the selector on screen, because
// getExportSourceOptions returns it marked unavailable and a lone unavailable
// option does not count as "no decision to make" — that is what gives the
// blocked-save alert something to point at.
//
// Post-cutoff Cloud is the one case where that does not hold: the field is
// hidden and EVENTS is pinned unconditionally, so a project whose persisted
// source is a legacy one has it silently replaced on save with no alert. That
// contradicts the rule above and is tracked separately rather than changed
// here, since it is a Cloud behaviour change in its own right.
export function getExportSourceFieldState(
  persisted: AnalyticsIntegrationExportSource | null | undefined,
  ctx: ExportSourceContext,
): ExportSourceFieldState {
  const legacyValidation = validateExportSource(
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    ctx,
  );
  const isPostCutoffCloud =
    !legacyValidation.ok && legacyValidation.reason === "cloud-cutoff";
  const options = getExportSourceOptions(persisted ?? null, ctx);
  return {
    options,
    showField: !isPostCutoffCloud && !shouldHideExportSourceSelector(options),
    defaultValue: isPostCutoffCloud
      ? AnalyticsIntegrationExportSource.EVENTS
      : getExportSourceFormValue(persisted, ctx),
  };
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
