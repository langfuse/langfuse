import { type FilterState } from "@langfuse/shared";
import { requiresV2 } from "@langfuse/shared/query";
import { type RouterInputs } from "@/src/utils/api";
import { type ChartViewConfig } from "../types";
import {
  describeConfig,
  getDimension,
  getMetric,
  isTimeSeriesChartType,
} from "../vocab";

/** Ranked/pie widgets show a top-N slice — mirrors `buildChartQuery`. */
const CATEGORICAL_ROW_LIMIT = 20;

/** The `dashboardWidgets.create` input, minus the projectId the caller adds. */
export type ChartWidgetInput = Omit<
  RouterInputs["dashboardWidgets"]["create"],
  "projectId"
>;

/**
 * Maps a chart-view config (+ the filters the chart is showing) to the input of
 * the EXISTING `dashboardWidgets.create` mutation — the bridge that lets "Add to
 * dashboard" reuse the widget-creation flow instead of duplicating it. The
 * dimension/metric/chartConfig shaping mirrors `buildChartQuery`, and the
 * `minVersion` is derived exactly as `WidgetForm` does (`requiresV2`), so a
 * chart added this way is indistinguishable from a hand-built widget.
 *
 * The widget does not own a time range — the host dashboard supplies one — so
 * the chart's from/to are intentionally dropped here.
 */
export function chartConfigToWidgetInput({
  config,
  filters,
}: {
  config: ChartViewConfig;
  filters: FilterState;
}): ChartWidgetInput {
  const metric = getMetric(config.metric);
  const dimension = getDimension(config.breakdown);
  const isNumber = config.chartType === "NUMBER";

  const dimensions =
    !isNumber && dimension.field ? [{ field: dimension.field }] : [];
  const metrics = [{ measure: metric.measure, agg: config.aggregation }];

  const isCategoricalBreakdown =
    !isTimeSeriesChartType(config.chartType) &&
    !isNumber &&
    dimensions.length > 0;

  // The runtime shape is a valid ChartConfigSchema member; the cast just bridges
  // the broad chartType enum to the discriminated union TS can't narrow here.
  const chartConfig = (
    isCategoricalBreakdown
      ? { type: config.chartType, row_limit: CATEGORICAL_ROW_LIMIT }
      : { type: config.chartType }
  ) as ChartWidgetInput["chartConfig"];

  const minVersion = requiresV2({
    view: "observations",
    dimensions,
    measures: metrics.map((m) => ({ measure: m.measure })),
    filters,
  })
    ? 2
    : 1;

  return {
    name: describeConfig(config),
    description: "",
    view: "observations",
    dimensions,
    metrics,
    filters,
    chartType: config.chartType,
    chartConfig,
    minVersion,
  };
}
