// The events feature's public client surface (RFC rule 8). Named re-exports
// only — exactly what other features already imported.
//
// EventsTable stays a deep import: it reaches the whole trace/peek graph, so
// re-exporting it here would make every consumer of this index part of that
// graph and turn several feature pairs into runtime cycles.
export { V4PreviewToggleRow } from "@/src/features/events/components/V4SidebarToggle";
export {
  canReuseOutlierPlaceholder,
  formatBucketRange,
  OUTLIER_STRIP_STEP_LADDER_SECONDS,
  outlierStripResultColumn,
  pickChartGranularity,
} from "@/src/features/events/components/outlier-strip/lib/binning";
export { observationEventsFilterConfig } from "@/src/features/events/config/filter-config";
export { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
export { useEventsTraceData } from "@/src/features/events/hooks/useEventsTraceData";
export { useMetadataValueOptions } from "@/src/features/events/hooks/useMetadataValueOptions";
export { useReadPath } from "@/src/features/events/hooks/useReadPath";
export type { ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
export {
  buildEventsTablePathForObservationType,
  buildEventsTablePathForSpanName,
} from "@/src/features/events/lib/eventsTablePaths";
export { V4_PREVIEW_LABEL } from "@/src/features/events/lib/v4PreviewLabel";
export { shouldAutoEnableV4 } from "@/src/features/events/lib/v4Rollout";
