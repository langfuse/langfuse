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

  const measureDef = declaration.measures[input.metric.measure];
  if (!measureDef) {
    return {
      valid: false,
      reason:
        `Invalid measure "${input.metric.measure}" for view "${input.view}". ` +
        `Must be one of: ${Object.keys(declaration.measures).join(", ")}`,
    };
  }

  const validAggs = getValidAggregationsForMeasureType(measureDef.type);
  if (!validAggs.some((a) => a === input.metric.aggregation)) {
    return {
      valid: false,
      reason:
        `Aggregation "${input.metric.aggregation}" is not valid for measure ` +
        `"${input.metric.measure}" (type: ${measureDef.type}). Valid: ${validAggs.join(", ")}`,
    };
  }

  for (const filter of input.filters) {
    if (filter.column === "metadata") continue;
    if (!(filter.column in declaration.dimensions)) {
      return {
        valid: false,
        reason:
          `Invalid filter column "${filter.column}" for view "${input.view}". ` +
          `Must be a dimension on the view or the special "metadata" column.`,
      };
    }
  }

  return { valid: true };
}
