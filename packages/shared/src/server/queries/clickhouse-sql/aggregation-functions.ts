import type { AggregationFunction } from "../field-catalog/types";
import { InvalidRequestError } from "../../../errors/InvalidRequestError";

/**
 * Translate aggregation function to ClickHouse SQL
 * Extracted from web/src/features/query/server/queryBuilder.ts
 */
export function translateAggregation(
  sqlExpression: string,
  aggregation: AggregationFunction,
  options?: { bins?: number },
): string {
  switch (aggregation) {
    case "sum":
      return `sum(${sqlExpression})`;
    case "avg":
      return `avg(${sqlExpression})`;
    case "count":
      return `count(${sqlExpression})`;
    case "max":
      return `max(${sqlExpression})`;
    case "min":
      return `min(${sqlExpression})`;
    case "p50":
      return `quantile(0.5)(${sqlExpression})`;
    case "p75":
      return `quantile(0.75)(${sqlExpression})`;
    case "p90":
      return `quantile(0.9)(${sqlExpression})`;
    case "p95":
      return `quantile(0.95)(${sqlExpression})`;
    case "p99":
      return `quantile(0.99)(${sqlExpression})`;
    case "histogram": {
      // Get histogram bins from options, fallback to 10
      const bins = options?.bins ?? 10;
      return `histogram(${bins})(toFloat64(${sqlExpression}))`;
    }
    default: {
      // eslint-disable-next-line no-unused-vars
      const exhaustiveCheck: never = aggregation;
      throw new InvalidRequestError(`Invalid aggregation: ${aggregation}`);
    }
  }
}
