import { startCase } from "lodash";
import { type FilterState } from "@langfuse/shared";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";

// Shared widget chart configuration types
export type WidgetChartConfig = {
  type: DashboardWidgetChartType;
  row_limit?: number;
  bins?: number;
};

/**
 * Formats a metric name for display, handling special cases like count_count -> Count
 */
export function formatMetricName(metricName: string): string {
  // Handle the count_count -> Count conversion
  const cleanedName = metricName === "count_count" ? "Count" : metricName;
  return startCase(cleanedName);
}

/**
 * Formats multiple metric names for display, showing first 3 and "+ X more" if needed
 */
export function formatMultipleMetricNames(metricNames: string[]): string {
  if (metricNames.length === 0) return "No Metrics";
  if (metricNames.length === 1) return formatMetricName(metricNames[0]);

  const formattedNames = metricNames.map(formatMetricName);

  if (metricNames.length <= 3) {
    return formattedNames.join(", ");
  }

  const firstThree = formattedNames.slice(0, 3).join(", ");
  const remaining = metricNames.length - 3;
  return `${firstThree} + ${remaining} more`;
}

export function buildWidgetName({
  aggregation,
  measure,
  view,
  metrics,
  isMultiMetric = false,
  dimensions = [],
}: {
  aggregation: string;
  measure: string;
  view: string;
  metrics?: string[];
  isMultiMetric?: boolean;
  dimensions?: string[];
}) {
  let base: string;

  if (isMultiMetric && metrics && metrics.length > 0) {
    // Handle multi-metric scenarios (like pivot tables)
    const metricDisplay = formatMultipleMetricNames(metrics);
    base = metricDisplay;
  } else {
    // Handle single metric scenarios
    const meas = formatMetricName(measure);
    if (measure.toLowerCase() === "count") {
      // For count measures, ignore aggregation and only show the measure
      base = meas;
    } else {
      const agg = startCase(aggregation.toLowerCase());
      base = `${agg} ${meas}`;
    }
  }

  // Handle dimensional breakdowns using unified approach
  if (dimensions && dimensions.length > 0) {
    const dimensionLabels = dimensions
      .filter((dim) => dim && dim !== "none")
      .map((dim) => startCase(dim));

    if (dimensionLabels.length > 0) {
      if (dimensionLabels.length === 1) {
        base += ` by ${dimensionLabels[0]}`;
      } else if (dimensionLabels.length === 2) {
        base += ` by ${dimensionLabels[0]} and ${dimensionLabels[1]}`;
      } else {
        // Handle 3+ dimensions gracefully
        const lastDim = dimensionLabels.pop();
        base += ` by ${dimensionLabels.join(", ")} and ${lastDim}`;
      }
    }
  }

  base += ` (${startCase(view)})`;
  return base;
}

export function buildWidgetDescription({
  aggregation,
  measure,
  view,
  filters,
  metrics,
  isMultiMetric = false,
  dimensions = [],
}: {
  aggregation: string;
  measure: string;
  view: string;
  filters: FilterState;
  metrics?: string[];
  isMultiMetric?: boolean;
  dimensions?: string[];
}) {
  const viewLabel = startCase(view);
  let sentence: string;

  if (isMultiMetric && metrics && metrics.length > 0) {
    // Handle multi-metric scenarios
    const metricDisplay = formatMultipleMetricNames(metrics);
    sentence = `Shows ${metricDisplay.toLowerCase()} of ${viewLabel}`;
  } else {
    // Handle single metric scenarios
    const measLabel = formatMetricName(measure);

    if (measure.toLowerCase() === "count") {
      sentence = `Shows the count of ${viewLabel}`;
    } else {
      const aggLabel = startCase(aggregation.toLowerCase());
      sentence = `Shows the ${aggLabel.toLowerCase()} ${measLabel.toLowerCase()} of ${viewLabel}`;
    }
  }

  // Dimensional breakdown clause using unified approach
  if (dimensions && dimensions.length > 0) {
    const dimensionLabels = dimensions
      .filter((dim) => dim && dim !== "none")
      .map((dim) => startCase(dim).toLowerCase());

    if (dimensionLabels.length > 0) {
      if (dimensionLabels.length === 1) {
        sentence += ` broken down by ${dimensionLabels[0]}`;
      } else if (dimensionLabels.length === 2) {
        sentence += ` broken down by ${dimensionLabels[0]} and ${dimensionLabels[1]}`;
      } else {
        // Handle 3+ dimensions gracefully
        const lastDim = dimensionLabels.pop();
        sentence += ` broken down by ${dimensionLabels.join(", ")} and ${lastDim}`;
      }
    }
  }

  // Filters clause
  if (filters && filters.length > 0) {
    if (filters.length <= 2) {
      const cols = filters.map((f) => startCase(f.column)).join(" and ");
      sentence += `, filtered by ${cols}`;
    } else {
      sentence += `, filtered by ${filters.length} conditions`;
    }
  }

  return sentence;
}
