import { z } from "zod";
import { dashboardBlockContentSchema } from "./blocks";
import { persistedWidgetViewToQueryView } from "../query/types";
import type { FilterState } from "../../types";

export type WidgetDefinition = z.infer<typeof dashboardBlockContentSchema>;

/** Interpret a classic saved widget as one tab without changing its stored record. */
export function toWidgetDefinition(widget: {
  name: string;
  description: string;
  view: string;
  metrics: { measure: string; agg: string }[];
  dimensions: { field: string }[];
  filters: FilterState;
  chartType: string;
  chartConfig?: {
    type?: string;
    row_limit?: number;
    bins?: number;
    show_value_labels?: boolean;
    defaultSort?: { column: string; order: "ASC" | "DESC" };
  };
  definition?: unknown;
}): WidgetDefinition {
  if (widget.definition != null)
    return dashboardBlockContentSchema.parse(widget.definition);
  const view =
    persistedWidgetViewToQueryView[
      widget.view as keyof typeof persistedWidgetViewToQueryView
    ] ?? widget.view;
  return dashboardBlockContentSchema.parse({
    kind: "multiQuery",
    config: {
      version: 2,
      title: widget.name,
      description: widget.description,
      tabs: [
        {
          id: "main",
          label: widget.name.slice(0, 100),
          queries: [
            {
              id: "a",
              label: widget.name.slice(0, 100),
              view,
              metrics: widget.metrics.map((metric, index) => ({
                id: `m${index}`,
                measure: metric.measure,
                aggregation: metric.agg,
              })),
              dimensions: widget.dimensions,
              filters: widget.filters,
            },
          ],
          display: {
            chartType: widget.chartType,
            rowLimit: widget.chartConfig?.row_limit,
            bins: widget.chartConfig?.bins,
            defaultSort: widget.chartConfig?.defaultSort,
            showValueLabels: widget.chartConfig?.show_value_labels,
          },
        },
      ],
    },
  });
}
