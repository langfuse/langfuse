import type { CreateMonitor } from "@langfuse/shared/monitors";

const evaluatorIdFilter = (evaluatorId: string) => ({
  column: "evaluatorId",
  type: "string" as const,
  operator: "=" as const,
  value: evaluatorId,
});

const anyEvaluatorIdFilter = {
  column: "evaluatorId",
  type: "string" as const,
  operator: "is not empty" as const,
  value: "",
};

const excludeEvaluatorTestsFilter = {
  column: "isEvaluatorTest",
  type: "boolean" as const,
  operator: "=" as const,
  value: false,
};

const evaluatorAlertTags = ["evaluators"];
const specificEvaluatorAlertTags = (evaluatorId: string) => [
  ...evaluatorAlertTags,
  `evaluator:${evaluatorId}`,
];

/** Returns the supported alert-form defaults encoded by the new-alert URL. */
export function getMonitorPrefill(
  query: Record<string, string | string[] | undefined>,
): Partial<CreateMonitor> | undefined {
  const alert = query.alert;

  if (alert === "allEvaluatorCost") {
    return {
      view: "observations",
      filters: [anyEvaluatorIdFilter, excludeEvaluatorTestsFilter],
      metric: { measure: "totalCost", aggregation: "sum" },
      tags: evaluatorAlertTags,
    };
  }

  const evaluatorId = query.evaluatorId;
  if (typeof evaluatorId !== "string" || evaluatorId.length === 0) {
    return undefined;
  }

  if (alert === "evaluatorCost") {
    return {
      view: "observations",
      filters: [evaluatorIdFilter(evaluatorId), excludeEvaluatorTestsFilter],
      metric: { measure: "totalCost", aggregation: "sum" },
      tags: specificEvaluatorAlertTags(evaluatorId),
    };
  }

  if (alert !== "evaluatorScore") {
    return undefined;
  }

  const filters = [evaluatorIdFilter(evaluatorId), excludeEvaluatorTestsFilter];

  switch (query.scoreDataType) {
    case "NUMERIC":
      return {
        view: "scores-numeric",
        filters,
        metric: { measure: "value", aggregation: "avg" },
        window: "1d",
        tags: specificEvaluatorAlertTags(evaluatorId),
      };
    case "BOOLEAN":
      return {
        view: "scores-boolean",
        filters,
        metric: { measure: "value", aggregation: "avg" },
        window: "1d",
        tags: specificEvaluatorAlertTags(evaluatorId),
      };
    case "CATEGORICAL":
      return {
        view: "scores-categorical",
        filters,
        metric: { measure: "count", aggregation: "count" },
        window: "1d",
        tags: specificEvaluatorAlertTags(evaluatorId),
      };
    default:
      return undefined;
  }
}
