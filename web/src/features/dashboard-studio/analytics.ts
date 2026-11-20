import {
  type DashboardWidgetChartType,
  type HomeDashboardPresetId,
} from "@langfuse/shared";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const studioEvents = {
  report_section: "dashboard_studio:report_section",
  report_open_editor: "dashboard_studio:report_open_editor",
  report_edit_note: "dashboard_studio:report_edit_note",
  report_run: "dashboard_studio:report_run",
  opened: "dashboard_studio:opened",
  add_menu_opened: "dashboard_studio:add_menu_opened",
  template_selected: "dashboard_studio:template_selected",
  chart_added: "dashboard_studio:chart_added",
  text_added: "dashboard_studio:text_added",
  editor_opened: "dashboard_studio:editor_opened",
  editor_cancelled: "dashboard_studio:editor_cancelled",
  configuration_changed: "dashboard_studio:configuration_changed",
  series_added: "dashboard_studio:series_added",
  series_removed: "dashboard_studio:series_removed",
  view_changed: "dashboard_studio:view_changed",
  legend_interacted: "dashboard_studio:legend_interacted",
  filter_applied: "dashboard_studio:filter_applied",
  widget_saved: "dashboard_studio:widget_saved",
  save_failed: "dashboard_studio:save_failed",
  widget_deleted: "dashboard_studio:widget_deleted",
  widget_duplicated: "dashboard_studio:widget_duplicated",
  widget_copied: "dashboard_studio:widget_copied",
  widget_pasted: "dashboard_studio:widget_pasted",
  widget_moved: "dashboard_studio:widget_moved",
  widget_resized: "dashboard_studio:widget_resized",
  migration_previewed: "dashboard_studio:migration_previewed",
  migration_applied: "dashboard_studio:migration_applied",
  migration_undone: "dashboard_studio:migration_undone",
  query_inspected: "dashboard_studio:query_inspected",
  date_range_changed: "dashboard_studio:date_range_changed",
  changes_saved: "dashboard_studio:changes_saved",
  changes_undone: "dashboard_studio:changes_undone",
  changes_discarded: "dashboard_studio:changes_discarded",
} as const;

export type DashboardStudioAction = keyof typeof studioEvents;

/** Structural telemetry only; chart content and filter values stay local. */
export type DashboardStudioEventProperties = {
  isV4: boolean;
  widgetKind?: "query" | "text" | "preset" | "widget";
  presetId?: HomeDashboardPresetId;
  chartType?: DashboardWidgetChartType;
  seriesCount?: number;
  queryCount?: number;
  filterCount?: number;
  expressionCount?: number;
  widgetCount?: number;
  selectedCount?: number;
  sectionIndex?: number;
  editorMode?: "current" | "multi-query" | "future";
  capability?:
    | "metadata-grouping"
    | "top-clients"
    | "score-join"
    | "custom-percentile";
  controlId?:
    | "models"
    | "scores"
    | "series"
    | "source"
    | "metric"
    | "breakdown"
    | "sort"
    | "score_target"
    | "formula";
  scoreTarget?: "all" | "trace" | "observation" | "session" | "experiment";
  durationMs?: number;
  scope?: "display" | "widget" | "dashboard";
  interaction?: "show" | "hide" | "isolate" | "reset" | "apply";
  target?:
    | "chart"
    | "chart_type"
    | "table"
    | "summary"
    | "diagnostics"
    | "configuration_data"
    | "configuration_visualization"
    | "configuration_details"
    | "calculation_formula"
    | "calculation_point"
    | "template_library"
    | "legacy_library"
    | "metadata_comparison"
    | "discard_changes";
  reason?: "validation" | "permission" | "network" | "unknown";
};

export type DashboardStudioEventMap = {
  [
    E in (typeof studioEvents)[DashboardStudioAction]
  ]: DashboardStudioEventProperties;
};

export function useDashboardStudioCapture(isV4: boolean) {
  const capture = usePostHogClientCapture();
  return (
    action: DashboardStudioAction,
    properties: Pick<
      DashboardStudioEventProperties,
      Exclude<keyof DashboardStudioEventProperties, "isV4">
    > = {},
  ) => capture(studioEvents[action], { ...properties, isV4 });
}
