import {
  AnalyticsIntegrationExportSource,
  EXPORT_SOURCE_OPTIONS,
  isEnrichedBlobExportSource,
  LEGACY_BLOB_EXPORT_SOURCES,
  type ExportSourceOption,
} from "@langfuse/shared";

export type ExportSourceAvailability = {
  eventsExportAvailable: boolean;
  forceEventsExport: boolean;
};

// Mirrors the two server asserts: TRACES_OBSERVATIONS_EVENTS is both enriched
// and legacy, so it must clear both checks.
export function isExportSourceSelectable(
  source: AnalyticsIntegrationExportSource,
  availability: ExportSourceAvailability,
): boolean {
  if (isEnrichedBlobExportSource(source) && !availability.eventsExportAvailable)
    return false;
  const isLegacy = (
    LEGACY_BLOB_EXPORT_SOURCES as readonly AnalyticsIntegrationExportSource[]
  ).includes(source);
  return !(isLegacy && availability.forceEventsExport);
}

// The persisted value always wins so initialize+save can never silently
// rewrite it (LFE-10296); validation blocks the save if it is not selectable.
export function getExportSourceFormValue(
  persisted: AnalyticsIntegrationExportSource | null | undefined,
  availability: ExportSourceAvailability,
): AnalyticsIntegrationExportSource {
  if (persisted) return persisted;
  return availability.eventsExportAvailable || availability.forceEventsExport
    ? AnalyticsIntegrationExportSource.EVENTS
    : AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS;
}

export type SelectableExportSourceOption = ExportSourceOption & {
  unavailable: boolean;
};

// Selectable sources, plus the persisted one (marked unavailable) when it is
// no longer selectable, so the conflict is visible rather than silently rewritten.
export function getExportSourceOptions(
  persisted: AnalyticsIntegrationExportSource | null | undefined,
  availability: ExportSourceAvailability,
): SelectableExportSourceOption[] {
  return EXPORT_SOURCE_OPTIONS.flatMap((option) => {
    const selectable = isExportSourceSelectable(option.value, availability);
    if (!selectable && option.value !== persisted) return [];
    return [{ ...option, unavailable: !selectable }];
  });
}
