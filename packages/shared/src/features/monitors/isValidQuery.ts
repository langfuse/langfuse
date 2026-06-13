/** isValidQuery.ts checks that a Monitor's (view, metric, filters) tuple
 * resolves against the v2 view declaration in the query package. Consumed as
 * a zod `superRefine` from the Monitor input schemas in `./types`. */
import { type z } from "zod";

import { type singleFilter } from "../../interfaces/filters";
import { getRuntimeViewDeclaration } from "../query/greptimeDataModel";
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
 * isValidQuery partitions a monitor's metrics against the view's v2
 * declaration. A bad filter is a whole-query failure (every metric rejected);
 * otherwise each metric is partitioned by the measure-exists + aggregation
 * checks, `reason` carrying the first rejection. Filter-column-vs-view
 * alignment is intentionally NOT checked here (see LF-2181) — dimensions are
 * the group-by surface, not the filter surface, so the dimension map is the
 * wrong proxy.
 */
export function isValidQuery(input: {
  view: z.infer<typeof viewsV2>;
  metrics: z.infer<typeof metric>[];
  filters: z.infer<typeof singleFilter>[];
}): QueryValidation {
  const declaration = getRuntimeViewDeclaration(input.view, "v2");

  const filterReason = invalidFilterReason(declaration, input.filters);
  if (filterReason) {
    return {
      valid: false,
      reason: filterReason,
      accepted: [],
      rejected: input.metrics,
    };
  }

  const accepted: z.infer<typeof metric>[] = [];
  const rejected: z.infer<typeof metric>[] = [];
  let reason: string | undefined;
  for (const m of input.metrics) {
    const metricReason = invalidMetricReason(declaration, input.view, m);
    if (metricReason) {
      rejected.push(m);
      reason ??= metricReason;
    } else {
      accepted.push(m);
    }
  }

  if (reason) return { valid: false, reason, accepted, rejected };
  return { valid: true, accepted, rejected: [] };
}

/** invalidFilterReason returns why a filter makes the whole query invalid, or undefined when all filters pass. */
function invalidFilterReason(
  declaration: ReturnType<typeof getRuntimeViewDeclaration>,
  filters: z.infer<typeof singleFilter>[],
): string | undefined {
  for (const filter of filters) {
    if (disallowedMonitorFilterColumns.includes(filter.column)) {
      return (
        `Filter on "${filter.column}" is not supported for monitors — ` +
        `too expensive at evaluation cadence.`
      );
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
        return (
          `Filter on "${filter.column}" (type "${filter.type}") must have unique values; ` +
          `duplicates are not allowed for set-semantics operators.`
        );
      }
    }
  }
  return undefined;
}

/** invalidMetricReason returns why a metric doesn't resolve on the view declaration, or undefined when it is valid. */
function invalidMetricReason(
  declaration: ReturnType<typeof getRuntimeViewDeclaration>,
  view: z.infer<typeof viewsV2>,
  m: z.infer<typeof metric>,
): string | undefined {
  if (!Object.hasOwn(declaration.measures, m.measure)) {
    return (
      `Invalid measure "${m.measure}" for view "${view}". ` +
      `Must be one of: ${Object.keys(declaration.measures).join(", ")}`
    );
  }
  const measureDef = declaration.measures[m.measure];

  if (m.aggregation === "histogram") {
    return (
      `Aggregation "histogram" is not supported for monitors — it produces ` +
      `a bucket array, not a scalar value comparable to the threshold.`
    );
  }

  const validAggs = getValidMonitorAggregationsForMeasure(measureDef);
  if (!validAggs.some((a) => a === m.aggregation)) {
    return (
      `Aggregation "${m.aggregation}" is not valid for measure ` +
      `"${m.measure}" (type: ${measureDef.type}). Valid: ${validAggs.join(", ")}`
    );
  }
  return undefined;
}

/** QueryValidation is the partition isValidQuery returns: accepted/rejected metrics plus a rejection reason when invalid. */
export type QueryValidation =
  | { valid: true; accepted: z.infer<typeof metric>[]; rejected: [] }
  | {
      valid: false;
      reason: string;
      accepted: z.infer<typeof metric>[];
      rejected: z.infer<typeof metric>[];
    };
