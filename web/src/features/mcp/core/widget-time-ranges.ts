import { TIME_RANGES } from "@langfuse/shared";
import { DASHBOARD_AGGREGATION_OPTIONS } from "@/src/utils/date-range-utils";

/**
 * The relative time ranges `renderWidget` accepts: the dashboard's presets,
 * keyed by abbreviation ("7d"), with the preset key ("last7Days") the
 * dashboard's time range picker uses.
 */
export const WIDGET_TIME_RANGES = new Map(
  DASHBOARD_AGGREGATION_OPTIONS.map((key) => [
    TIME_RANGES[key].abbreviation,
    { ...TIME_RANGES[key], key },
  ]),
);

export const DEFAULT_WIDGET_TIME_RANGE = "7d";

/**
 * A chart's time window as `renderWidget` was asked for it: a relative range
 * by abbreviation, or a custom window as ISO 8601 timestamps.
 */
export type WidgetTimeRange = { range: string } | { from: string; to: string };
