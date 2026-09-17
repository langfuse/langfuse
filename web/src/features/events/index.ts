// The events feature's public client surface (RFC rule 8). Named re-exports
// only — exactly what other features already imported.
//
// EventsTable stays a deep import: it reaches the whole trace/peek graph, so
// re-exporting it here would make every consumer of this index part of that
// graph and turn several feature pairs into runtime cycles.
export { V4PreviewToggleRow } from "./components/V4SidebarToggle";
export {
  canReuseOutlierPlaceholder,
  formatBucketRange,
  OUTLIER_STRIP_STEP_LADDER_SECONDS,
  outlierStripResultColumn,
  pickChartGranularity,
} from "./components/outlier-strip/lib/binning";
export { observationEventsFilterConfig } from "./config/filter-config";
export { useEventsFilterOptions } from "./hooks/useEventsFilterOptions";
export { useEventsTraceData } from "./hooks/useEventsTraceData";
export { useMetadataValueOptions } from "./hooks/useMetadataValueOptions";
export { useReadPath } from "./hooks/useReadPath";
export type { ResolvedReadPath } from "./hooks/useReadPath";
export {
  buildEventsTablePathForObservationType,
  buildEventsTablePathForSpanName,
} from "./lib/eventsTablePaths";
export { V4_PREVIEW_LABEL } from "./lib/v4PreviewLabel";
// shouldAutoEnableV4 / canToggleV4 stay on the deep lib path (or a future
// server surface). Re-exporting them here would make every server consumer of
// the client door pull V4PreviewToggleRow and blow up Turbopack RSC builds.
