import type { ScoreResultPredicate } from "@langfuse/shared";

export function createDefaultFreeformScoreResultPredicate(): ScoreResultPredicate {
  return {
    scoreName: "",
    dataType: "BOOLEAN",
    operator: "=",
    value: false,
  };
}
