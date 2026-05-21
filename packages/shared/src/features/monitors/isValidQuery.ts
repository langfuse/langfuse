/** isValidQuery.ts checks that a Monitor's (view, metric, filters) tuple
 * resolves against the v2 view declaration in the query package. Consumed as
 * a zod `superRefine` from the Monitor input schemas in `./types`. */
import { type z } from "zod";

import { type singleFilter } from "../../interfaces/filters";
import { getViewDeclaration } from "../query/dataModel";
import {
  getValidAggregationsForMeasureType,
  type metric,
  type viewsV2,
} from "../query/types";

/**
 * isValidQuery ensures:
 * - The measure exists on the view's v2 declaration.
 * - The aggregation is compatible with the measure's declared type.
 * - Each filter column is either a declared dimension or the `metadata`
 *   escape hatch.
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

  const validAggs = getValidAggregationsForMeasureType(measureDef.type);
  if (!validAggs.some((a) => a === input.metric.aggregation)) {
    return {
      valid: false,
      reason:
        `Aggregation "${input.metric.aggregation}" is not valid for measure ` +
        `"${input.metric.measure}" (type: ${measureDef.type}). Valid: ${validAggs.join(", ")}`,
    };
  }

  // `histogram` returns a bucket-array (Array(Tuple(...))) at the ClickHouse
  // layer; monitor thresholds are scalars (`z.number()`) compared with
  // `gt`/`gte`/`lt`/`lte`/`eq`/`neq`. No defined comparison semantics →
  // reject at the input boundary rather than failing in the worker.
  if (input.metric.aggregation === "histogram") {
    return {
      valid: false,
      reason:
        `Aggregation "histogram" is not supported for monitors — it produces ` +
        `a bucket array, not a scalar value comparable to the threshold.`,
    };
  }

  for (const filter of input.filters) {
    if (filter.column === "metadata") {
      if (filter.type !== "stringObject") {
        return {
          valid: false,
          reason:
            `Filter on "metadata" must be type "stringObject" with a "key" property ` +
            `(got "${filter.type}"). queryBuilder rejects other metadata filter types.`,
        };
      }
      continue;
    }
    if (!Object.hasOwn(declaration.dimensions, filter.column)) {
      return {
        valid: false,
        reason:
          `Invalid filter column "${filter.column}" for view "${input.view}". ` +
          `Must be a dimension on the view or the special "metadata" column.`,
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
