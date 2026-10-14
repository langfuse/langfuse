// The events feature's public client surface (RFC rule 8). Named re-exports
// only — exactly what other features already imported.
//
// EventsTable stays a deep import: it reaches the whole trace/peek graph, so
// re-exporting it here would make every consumer of this index part of that
// graph and turn several feature pairs into runtime cycles.
export {
  V4PreviewToggleRow,
  V4SidebarToggle,
} from "@/src/tracing/observations/components/V4SidebarToggle";
export {
  canReuseOutlierPlaceholder,
  formatBucketRange,
  OUTLIER_STRIP_STEP_LADDER_SECONDS,
  outlierStripResultColumn,
  pickChartGranularity,
} from "@/src/tracing/observations/components/outlier-strip/lib/binning";
export { observationEventsFilterConfig } from "@/src/tracing/observations/config/filter-config";
export { useEventsFilterOptions } from "@/src/tracing/observations/hooks/useEventsFilterOptions";
export { useEventsTraceData } from "@/src/tracing/observations/hooks/useEventsTraceData";
export { useMetadataValueOptions } from "@/src/tracing/observations/hooks/useMetadataValueOptions";
export { useReadPath } from "@/src/tracing/observations/hooks/useReadPath";
export type { ResolvedReadPath } from "@/src/tracing/observations/hooks/useReadPath";
export {
  buildEventsTablePathForColumnFilter,
  buildEventsTablePathForMetadataFilter,
  buildEventsTablePathForObservationType,
  buildEventsTablePathForSpanName,
  type MetadataFilterOperator,
} from "@/src/tracing/observations/lib/eventsTablePaths";
export { V4_PREVIEW_LABEL } from "@/src/tracing/observations/lib/v4PreviewLabel";
// shouldAutoEnableV4 / canToggleV4 stay on the deep lib path (or a future
// server surface). Re-exporting them here would make every server consumer of
// the client door pull V4PreviewToggleRow and blow up Turbopack RSC builds.
