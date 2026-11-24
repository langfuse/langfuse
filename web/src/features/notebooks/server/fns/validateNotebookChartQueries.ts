import {
  getValidAggregationsForMeasureType,
  getViewDeclaration,
  validateQuery,
} from "@langfuse/shared/query";
import type { RefinementCtx } from "zod";
import type { NotebookBlock } from "../../schema";

export function validateNotebookChartQueries(
  block: NotebookBlock,
  ctx: RefinementCtx<NotebookBlock>,
  path: (string | number)[] = [],
) {
  if (block.schema === "row@1") {
    for (const [index, child] of block.props.children.entries()) {
      validateNotebookChartQueries(child, ctx, [
        ...path,
        "props",
        "children",
        index,
      ]);
    }
    return;
  }
  if (block.schema !== "chart@1") return;

  const { query } = block.props;
  const issue = (message: string) =>
    ctx.addIssue({
      code: "custom",
      message,
      path: [...path, "props", "query"],
    });

  if (!query.metrics.length) {
    return issue("Charts require at least one metric.");
  }
  const { dimensions, measures } = getViewDeclaration(query.view, "v2");
  for (const { field } of query.dimensions) {
    if (!Object.hasOwn(dimensions, field)) {
      return issue(`Unknown chart dimension: ${field}.`);
    }
  }
  for (const { measure, aggregation } of query.metrics) {
    if (!Object.hasOwn(measures, measure)) {
      return issue(`Unknown chart measure: ${measure}.`);
    }
    const definition = measures[measure];
    const supported = getValidAggregationsForMeasureType(
      definition.aggregationOverrides?.[aggregation]?.type ?? definition.type,
    );
    if (aggregation === "histogram" || !supported.includes(aggregation)) {
      return issue(
        `Unsupported chart aggregation: ${aggregation} of ${measure}.`,
      );
    }
  }
  const validation = validateQuery(query, "v2");
  if (!validation.valid) issue(validation.reason);
}
