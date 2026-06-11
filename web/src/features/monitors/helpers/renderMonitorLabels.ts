import { startCase } from "lodash";
import { type z } from "zod";

import { type metricAggregations } from "@langfuse/shared";
import {
  type MonitorThresholdOperator,
  type MonitorView,
  type MonitorWindow,
} from "@langfuse/shared/monitors";

import { operatorLabels, viewLabels, windowLabels } from "./monitorLabels";

/** aggregationLabel renders an aggregation as a leading word, e.g. "Sum" or "p95". */
export const aggregationLabel = (
  aggregation: z.infer<typeof metricAggregations>,
): string =>
  // startCase mangles percentile tokens ("p95" -> "P 95"); keep them verbatim.
  /^p\d+$/.test(aggregation) ? aggregation : startCase(aggregation);

/** metricSubject renders the noun a metric measures, e.g. "Observations Latency" or "Observations" for a bare count. */
const metricSubject = (view: MonitorView, measure: string): string =>
  measure === "count"
    ? viewLabels[view]
    : `${viewLabels[view]} ${startCase(measure)}`;

/** renderMetricDescription renders a metric as prose, e.g. "Sum of Observations Latency". */
const renderMetricDescription = (
  view: MonitorView,
  metric: { measure: string; aggregation: z.infer<typeof metricAggregations> },
): string =>
  `${aggregationLabel(metric.aggregation)} of ${metricSubject(view, metric.measure)}`;

/** renderNamePlaceholder renders the auto-suggested monitor name, e.g. "Sum of Observations Latency is below 100". */
export const renderNamePlaceholder = ({
  view,
  metric,
  thresholdOperator,
  alertThreshold,
}: {
  view: MonitorView;
  metric: { measure: string; aggregation: z.infer<typeof metricAggregations> };
  thresholdOperator: MonitorThresholdOperator;
  alertThreshold?: number | null;
}): string => {
  const value =
    alertThreshold != null && Number.isFinite(alertThreshold)
      ? alertThreshold
      : 0;
  return `${renderMetricDescription(view, metric)} is ${operatorLabels[thresholdOperator]} ${value}`;
};

/** renderChartSubtitle renders the preview subtitle, e.g. "Sum of Observations Latency every 5 minutes". */
export const renderChartSubtitle = ({
  view,
  metric,
  window,
}: {
  view: MonitorView;
  metric: { measure: string; aggregation: z.infer<typeof metricAggregations> };
  window: MonitorWindow;
}): string =>
  `${renderMetricDescription(view, metric)} every ${windowLabels[window]}`;
