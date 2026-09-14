import type { EvalTemplateType } from "@langfuse/shared";
import type { TestResultPanelState } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultPanelView/TestResultPanelView";

export function toTestResultPanelState(params: {
  type: EvalTemplateType;
  isPending: boolean;
  result: unknown;
}): TestResultPanelState {
  if (params.isPending) return { status: "running" };
  if (!params.result) return { status: "empty" };
  if (typeof params.result !== "object") {
    return { status: "run-error", message: String(params.result) };
  }

  const response = params.result as Record<string, unknown>;
  if (typeof response.requestError === "string") {
    return { status: "request-error", message: response.requestError };
  }
  if (response.success === false) {
    const error = response.error;
    return {
      status: "run-error",
      message:
        typeof error === "object" && error && "message" in error
          ? String(error.message)
          : String(error ?? "Evaluator test failed"),
    };
  }

  if (params.type === "CODE") {
    const scores = Array.isArray(response.scores) ? response.scores : [];
    return {
      status: "code-success",
      scores: scores.map((score, index) => {
        const item = score as Record<string, unknown>;
        const value =
          item.dataType === "BOOLEAN" && typeof item.value === "number"
            ? item.value === 1
            : item.value;
        return {
          name: String(item.name ?? `Score ${index + 1}`),
          value: String(value ?? ""),
          comment: item.comment == null ? null : String(item.comment),
        };
      }),
    };
  }

  const result =
    typeof response.result === "object" && response.result
      ? (response.result as Record<string, unknown>)
      : {};
  const score = Array.isArray(result.matches)
    ? result.matches.map(String).join(", ")
    : String(result.score ?? "");

  return {
    status: "llm-success",
    score,
    reasoning: result.reasoning == null ? null : String(result.reasoning),
  };
}
