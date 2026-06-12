import {
  AnalyticsIntegrationExportSource,
  EXPORT_SOURCE_OPTIONS,
  isEnrichedBlobExportSource,
  LEGACY_BLOB_EXPORT_SOURCES,
  type ExportSourceOption,
} from "@langfuse/shared";

export type ExportSourceAvailability = {
  // Deployment has the enriched events export path (Cloud, or self-hosted
  // with the V4 preview opt-in).
  eventsExportAvailable: boolean;
  // Legacy sources are blocked: post-cutoff Cloud project, or a Cloud
  // integration that is not a legacy exporter (new row, or created after the
  // exporter cutoff). Only the enriched EVENTS source remains selectable.
  forceEventsExport: boolean;
};

// A source must satisfy both deployment constraints, mirroring the two server
// asserts: its enriched part requires the events export path, and its legacy
// part is blocked when either Cloud cutoff applies. TRACES_OBSERVATIONS_EVENTS
// is in both lists, so it needs both checks to pass.
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

// The persisted value always wins so that initializing and then saving the
// form can never silently rewrite it (LFE-10296); when the persisted source is
// not selectable on this deployment, form validation blocks the save instead.
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

// All sources selectable on this deployment, plus the persisted source when it
// is no longer selectable — shown (marked unavailable) so the user can see the
// conflict and resolve it explicitly instead of having it rewritten silently.
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
