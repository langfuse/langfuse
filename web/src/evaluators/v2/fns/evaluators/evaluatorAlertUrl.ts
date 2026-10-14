import { encodeFiltersGeneric } from "@langfuse/shared";

/** Builds an alerts-list URL, optionally filtered to one evaluator. */
export function evaluatorAlertsListUrl(
  projectId: string,
  evaluatorId?: string,
): string {
  const base = `/project/${encodeURIComponent(projectId)}/alerts`;
  if (!evaluatorId) return base;

  const filter = encodeFiltersGeneric([
    {
      column: "evaluatorId",
      type: "stringOptions",
      operator: "any of",
      value: [evaluatorId],
    },
  ]);
  const params = new URLSearchParams({ filter });
  return `${base}?${params.toString()}`;
}

/** Builds a new-alert URL using only evaluator alert prefill fields. */
export function evaluatorAlertUrl(
  projectId: string,
  alert:
    | {
        type: "score";
        evaluatorId: string;
        scoreDataType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL";
      }
    | { type: "cost"; evaluatorId: string }
    | { type: "allEvaluatorCost" },
): string {
  const base = `/project/${encodeURIComponent(projectId)}/alerts/new`;
  const params = new URLSearchParams();

  if (alert.type === "allEvaluatorCost") {
    params.set("alert", "allEvaluatorCost");
  } else if (alert.type === "cost") {
    params.set("alert", "evaluatorCost");
    params.set("evaluatorId", alert.evaluatorId);
  } else {
    params.set("alert", "evaluatorScore");
    params.set("evaluatorId", alert.evaluatorId);
    params.set("scoreDataType", alert.scoreDataType);
  }

  return `${base}?${params.toString()}`;
}
