/** validateQuery checks that a Monitor's (view, metric, filters) tuple resolves
 * against the v2 view declaration in the query package. Consumed as a zod
 * `superRefine` from the Monitor input schemas in `./types`. */
import { type z } from "zod";

import { type singleFilter } from "../../../interfaces/filters";
import { getViewDeclaration } from "../../../features/query/dataModel";
import {
  getValidAggregationsForMeasureType,
  type metric,
  type viewsV2,
} from "../../../features/query/types";

/**
 * QueryShapeValidationResult mirrors `validateQuery`'s contract in the query
 * package so callers can branch on `valid` and surface `reason` consistently.
 */
export type QueryShapeValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * validateQuery ensures:
 * - The measure exists on the view's v2 declaration.
 * - The aggregation is compatible with the measure's declared type.
 * - Each filter column is either a declared dimension or the `metadata`
 *   escape hatch.
 */
export function validateQuery(params: {
  view: z.infer<typeof viewsV2>;
  metric: z.infer<typeof metric>;
  filters: z.infer<typeof singleFilter>[];
}): QueryShapeValidationResult {
  const declaration = getViewDeclaration(params.view, "v2");

  const measureDef = declaration.measures[params.metric.measure];
  if (!measureDef) {
    return {
      valid: false,
      reason:
        `Invalid measure "${params.metric.measure}" for view "${params.view}". ` +
        `Must be one of: ${Object.keys(declaration.measures).join(", ")}`,
    };
  }

  const validAggs = getValidAggregationsForMeasureType(measureDef.type);
  if (!validAggs.some((a) => a === params.metric.aggregation)) {
    return {
      valid: false,
      reason:
        `Aggregation "${params.metric.aggregation}" is not valid for measure ` +
        `"${params.metric.measure}" (type: ${measureDef.type}). Valid: ${validAggs.join(", ")}`,
    };
  }

  for (const filter of params.filters) {
    if (filter.column === "metadata") continue;
    if (!(filter.column in declaration.dimensions)) {
      return {
        valid: false,
        reason:
          `Invalid filter column "${filter.column}" for view "${params.view}". ` +
          `Must be a dimension on the view or the special "metadata" column.`,
      };
    }
  }

  return { valid: true };
}
