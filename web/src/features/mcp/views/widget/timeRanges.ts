import { TIME_RANGES, type TimeRange } from "@/src/utils/date-range-utils";
import {
  DEFAULT_WIDGET_TIME_RANGE,
  WIDGET_TIME_RANGES,
  type WidgetTimeRange,
} from "../../core/widget-time-ranges";
import { type WidgetPayload } from "../../core/widget-payload";

type ToolArguments = Record<string, unknown>;

/** A picker value ("last7Days" presets) as a `renderWidget` window ("7d"). */
export const toWidgetTimeRange = (timeRange: TimeRange): WidgetTimeRange =>
  "from" in timeRange
    ? { from: timeRange.from.toISOString(), to: timeRange.to.toISOString() }
    : {
        range:
          TIME_RANGES[timeRange.range as keyof typeof TIME_RANGES]
            ?.abbreviation ?? DEFAULT_WIDGET_TIME_RANGE,
      };

/** A `renderWidget` window as the dashboard's time range picker value. */
export const toPickerTimeRange = (timeRange: WidgetTimeRange): TimeRange =>
  "from" in timeRange
    ? { from: new Date(timeRange.from), to: new Date(timeRange.to) }
    : {
        range:
          WIDGET_TIME_RANGES.get(timeRange.range)?.key ??
          WIDGET_TIME_RANGES.get(DEFAULT_WIDGET_TIME_RANGE)!.key,
      };

/** The time window a `renderWidget` call asked for. */
const argumentsTimeRange = (args: ToolArguments): WidgetTimeRange => {
  const { timeRange, fromTimestamp, toTimestamp } = args;
  if (typeof fromTimestamp === "string" && typeof toTimestamp === "string") {
    return { from: fromTimestamp, to: toTimestamp };
  }
  return {
    range:
      typeof timeRange === "string" ? timeRange : DEFAULT_WIDGET_TIME_RANGE,
  };
};

/**
 * The window the chart shows or is loading: the one being loaded, else the
 * payload's, else the call's arguments'. Payloads from older versions of the
 * view may lack the window.
 */
export const currentTimeRange = (params: {
  pendingRange: WidgetTimeRange | null;
  payload: WidgetPayload | undefined;
  toolArguments: ToolArguments | null;
}): WidgetTimeRange => {
  const payloadRange = params.payload?.timeRange;
  if (params.pendingRange) return params.pendingRange;
  if (payloadRange && typeof payloadRange === "object") return payloadRange;
  if (params.toolArguments) return argumentsTimeRange(params.toolArguments);
  return { range: DEFAULT_WIDGET_TIME_RANGE };
};

/** The call's arguments with its time window replaced. */
export const withTimeRange = (
  args: ToolArguments,
  timeRange: WidgetTimeRange,
): ToolArguments => {
  const rest = { ...args };
  delete rest.timeRange;
  delete rest.fromTimestamp;
  delete rest.toTimestamp;
  return "from" in timeRange
    ? { ...rest, fromTimestamp: timeRange.from, toTimestamp: timeRange.to }
    : { ...rest, timeRange: timeRange.range };
};
