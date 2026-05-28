/** isValidQuery.ts checks that a Monitor's (view, metric, filters) tuple
 * resolves against the v2 view declaration in the query package. Consumed as
 * a zod `superRefine` from the Monitor input schemas in `./types`. */
import { type z } from "zod";

import { type singleFilter } from "../../interfaces/filters";
import { getViewDeclaration } from "../query/dataModel";
import {
  getValidAggregationsForMeasureType,
  type MeasureDefinition,
  type metric,
  type metricAggregations,
  type viewsV2,
} from "../query/types";
import { disallowedMonitorFilterColumns } from "./filterColumns";

/** getValidMonitorAggregationsForMeasure returns the aggregations valid for a monitor metric: the widget set minus `histogram`, and pinned to the measure's inner `aggs.agg` when set (e.g. observations.count is always `count`). */
export const getValidMonitorAggregationsForMeasure = (
  measure: MeasureDefinition | undefined,
): z.infer<typeof metricAggregations>[] => {
  const aggs = getValidAggregationsForMeasureType(measure?.type).filter(
    (a) => a !== "histogram",
  );
  const pinned = measure?.aggs?.agg as
    | z.infer<typeof metricAggregations>
    | undefined;
  if (pinned && pinned !== "histogram" && aggs.includes(pinned)) {
    return [pinned];
  }
  return aggs;
};

/**
 * isValidQuery ensures the measure/aggregation pair resolves on the view's v2
 * declaration, the filter column isn't in `disallowedMonitorFilterColumns`,
 * and set-semantics filter values are unique. Filter-column-vs-view alignment
 * is intentionally NOT checked here (see LF-2181) — dimensions are the
 * group-by surface, not the filter surface, so the dimension map is the wrong
 * proxy. The scheduler's ERROR_BAD_QUERY path catches unresolvable filters at
 * evaluation time.
 */
export function isValidQuery(input: {
  view: z.infer<typeof viewsV2>;
  metric: z.infer<typeof metric>;
  filters: z.infer<typeof singleFilter>[];
}): { valid: true } | { valid: false; reason: string } {
  const declaration = getViewDeclaration(input.view, "v2");

  if (!Object.hasOwn(declaration.measures, input.metric.measure)) {
    return {
      valid: false,
      reason:
        `Invalid measure "${input.metric.measure}" for view "${input.view}". ` +
        `Must be one of: ${Object.keys(declaration.measures).join(", ")}`,
    };
  }
  const measureDef = declaration.measures[input.metric.measure];

  if (input.metric.aggregation === "histogram") {
    return {
      valid: false,
      reason:
        `Aggregation "histogram" is not supported for monitors — it produces ` +
        `a bucket array, not a scalar value comparable to the threshold.`,
    };
  }

  const validAggs = getValidMonitorAggregationsForMeasure(measureDef);
  if (!validAggs.some((a) => a === input.metric.aggregation)) {
    return {
      valid: false,
      reason:
        `Aggregation "${input.metric.aggregation}" is not valid for measure ` +
        `"${input.metric.measure}" (type: ${measureDef.type}). Valid: ${validAggs.join(", ")}`,
    };
  }

  for (const filter of input.filters) {
    if (disallowedMonitorFilterColumns.includes(filter.column)) {
      return {
        valid: false,
        reason:
          `Filter on "${filter.column}" is not supported for monitors — ` +
          `too expensive at evaluation cadence.`,
      };
    }
    // Set-semantics value arrays must not contain duplicates — `any of` /
    // `none of` / `all of` are set operators, so duplicate elements produce
    // a logically identical filter that would fragment schedulerBatchId.
    if (
      filter.type === "stringOptions" ||
      filter.type === "categoryOptions" ||
      filter.type === "arrayOptions"
    ) {
      if (new Set(filter.value).size !== filter.value.length) {
        return {
          valid: false,
          reason:
            `Filter on "${filter.column}" (type "${filter.type}") must have unique values; ` +
            `duplicates are not allowed for set-semantics operators.`,
        };
      }
    }
  }

  return { valid: true };
}
