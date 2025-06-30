import { startCase } from "lodash";
import { type FilterState } from "@langfuse/shared";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { type ChartConfigSchema } from "@langfuse/shared/src/server";
import { type z } from "zod/v4";

// Shared widget chart configuration types
export type WidgetChartConfig = {
  type: DashboardWidgetChartType;
  row_limit?: number;
  bins?: number;
  dimensions?: string[];
  metrics?: string[];
};

export type StrictChartConfig = z.infer<typeof ChartConfigSchema>;

/**
 * Transforms a generic widget chart config to the strict TRPC schema format
 * This centralizes the transformation logic and ensures consistency across the app
 */
export function transformToStrictChartConfig(
  config: WidgetChartConfig,
): StrictChartConfig {
  switch (config.type) {
    case "LINE_TIME_SERIES":
      return { type: "LINE_TIME_SERIES" as const };
    case "BAR_TIME_SERIES":
      return { type: "BAR_TIME_SERIES" as const };
    case "HORIZONTAL_BAR":
      return { type: "HORIZONTAL_BAR" as const, row_limit: config.row_limit };
    case "VERTICAL_BAR":
      return { type: "VERTICAL_BAR" as const, row_limit: config.row_limit };
    case "PIE":
      return { type: "PIE" as const, row_limit: config.row_limit };
    case "NUMBER":
      return { type: "NUMBER" as const, row_limit: config.row_limit };
    case "HISTOGRAM":
      return {
        type: "HISTOGRAM" as const,
        row_limit: config.row_limit,
        bins: config.bins ?? 10,
      };
    case "PIVOT_TABLE":
      return {
        type: "PIVOT_TABLE" as const,
        dimensions: config.dimensions ?? [],
        row_limit: config.row_limit,
      };
    default:
      throw new Error(`Unsupported chart type: ${config.type}`);
  }
}

/**
 * Transforms a strict chart config back to the generic widget format
 * Useful for editing existing widgets
 */
export function transformFromStrictChartConfig(
  config: StrictChartConfig,
): WidgetChartConfig {
  const base = {
    type: config.type,
    row_limit: "row_limit" in config ? config.row_limit : undefined,
  };

  switch (config.type) {
    case "HISTOGRAM":
      return { ...base, bins: config.bins };
    case "PIVOT_TABLE":
      return { ...base, dimensions: config.dimensions };
    default:
      return base;
  }
}

export function buildWidgetName({
  aggregation,
  measure,
  dimension,
  view,
}: {
  aggregation: string;
  measure: string;
  dimension: string;
  view: string;
}) {
  const meas = startCase(measure);
  let base: string;
  if (measure.toLowerCase() === "count") {
    // For count measures, ignore aggregation and only show the measure
    base = meas;
  } else {
    const agg = startCase(aggregation.toLowerCase());
    base = `${agg} ${meas}`;
  }
  if (dimension && dimension !== "none") {
    base += ` by ${startCase(dimension)}`;
  }
  base += ` (${startCase(view)})`;
  return base;
}

export function buildWidgetDescription({
  aggregation,
  measure,
  dimension,
  view,
  filters,
}: {
  aggregation: string;
  measure: string;
  dimension: string;
  view: string;
  filters: FilterState;
}) {
  // Base sentence: "Shows the <agg> <measure> of <view> ..."
  const measLabel = startCase(measure.toLowerCase());
  const viewLabel = startCase(view);

  let sentence: string;

  if (measure.toLowerCase() === "count") {
    sentence = `Shows the count of ${viewLabel}`;
  } else {
    const aggLabel = startCase(aggregation.toLowerCase());
    sentence = `Shows the ${aggLabel.toLowerCase()} ${measLabel.toLowerCase()} of ${viewLabel}`;
  }

  // Dimension clause
  if (dimension && dimension !== "none") {
    sentence += ` by ${startCase(dimension).toLowerCase()}`;
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
