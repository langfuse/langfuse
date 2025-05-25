import { startCase } from "lodash";
import { type FilterState } from "@langfuse/shared";

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
