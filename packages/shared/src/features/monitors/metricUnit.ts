import { viewDeclarations } from "../query/dataModel";
import type { MonitorView } from "./types";

/** numericMeasureTypes are the measure types whose values carry their own unit. */
const numericMeasureTypes = new Set(["integer", "decimal", "number"]);

/** metricUnit returns the declared unit of a monitor metric's value, e.g. "millisecond" or the view's row unit for a count. */
export function metricUnit(
  view: MonitorView,
  metric: { measure: string; aggregation: string },
): string | undefined {
  const measures = viewDeclarations.v2[view]?.measures ?? {};
  const definition = measures[metric.measure];
  const isNumeric = numericMeasureTypes.has(definition?.type ?? "");
  if (metric.aggregation === "count" && isNumeric) return measures.count?.unit;
  if (metric.aggregation === "uniq" && isNumeric) return undefined;
  return definition?.unit;
}
