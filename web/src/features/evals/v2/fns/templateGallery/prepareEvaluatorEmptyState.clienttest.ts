import { EVALUATOR_EMPTY_STATE_DOCS_HREF } from "@/src/features/evals/v2/constants/evaluatorEmptyState";
import { prepareEvaluatorEmptyState } from "./prepareEvaluatorEmptyState";

describe("prepareEvaluatorEmptyState", () => {
  it("resolves the curated starting points from the managed catalog", () => {
    const emptyState = prepareEvaluatorEmptyState();

    expect(emptyState.docsHref).toBe(EVALUATOR_EMPTY_STATE_DOCS_HREF);
    expect(emptyState.startingPoints.map(({ key }) => key)).toEqual([
      "topic-decision-model",
      "correctness",
      "frustration-decision-model",
    ]);
  });
});
