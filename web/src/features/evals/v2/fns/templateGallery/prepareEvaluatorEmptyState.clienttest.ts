import { EVALUATOR_EMPTY_STATE_DOCS_HREF } from "@/src/features/evals/v2/constants/evaluatorEmptyState";
import { prepareEvaluatorEmptyState } from "./prepareEvaluatorEmptyState";

describe("prepareEvaluatorEmptyState", () => {
  it("resolves the curated starting points from the managed catalog", () => {
    const emptyState = prepareEvaluatorEmptyState();

    expect(emptyState.docsHref).toBe(EVALUATOR_EMPTY_STATE_DOCS_HREF);
    expect(
      emptyState.startingPoints.map(({ template, action }) => ({
        key: template.key,
        action,
      })),
    ).toEqual([
      { key: "topic-classifier", action: "detect-topics" },
      { key: "user-disagreement", action: "select-template" },
      { key: "topic-decision-model", action: "select-template" },
    ]);
    expect(emptyState.startingPoints[0]).toMatchObject({
      action: "detect-topics",
      title: "Detect Topics",
      template: { key: "topic-classifier" },
    });
    expect(emptyState.startingPoints[1]).toMatchObject({
      action: "select-template",
      template: { key: "user-disagreement" },
    });
    expect(emptyState.startingPoints[1]).not.toHaveProperty("title");
  });
});
