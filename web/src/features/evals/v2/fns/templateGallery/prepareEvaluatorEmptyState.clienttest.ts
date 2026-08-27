import {
  DETECT_TOPICS_ASSISTANT_PROMPT,
  EVALUATOR_EMPTY_STATE_DOCS_HREF,
} from "@/src/features/evals/v2/constants/evaluatorEmptyState";
import { MANAGED_TEMPLATES_CATALOG } from "@/src/features/evals/v2/constants/managedTemplatesCatalog";
import { prepareEvaluatorEmptyState } from "./prepareEvaluatorEmptyState";

describe("prepareEvaluatorEmptyState", () => {
  it("resolves the curated starting points from the managed catalog", () => {
    const emptyState = prepareEvaluatorEmptyState();

    expect(emptyState.docsHref).toBe(EVALUATOR_EMPTY_STATE_DOCS_HREF);
    expect(emptyState.templateCount).toBe(
      MANAGED_TEMPLATES_CATALOG.templates.length,
    );
    expect(
      emptyState.startingPoints.map(({ template, action }) => ({
        key: template.key,
        action,
      })),
    ).toEqual([
      { key: "topic-classifier", action: "detect-topics" },
      { key: "user-disagreement", action: "select-template" },
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

  it("locks the Detect Topics assistant prompt used by the empty-state experiment", () => {
    expect(DETECT_TOPICS_ASSISTANT_PROMPT).toBe(
      "Identify 5-10 common topics in my traces and create a categorical LLM as a judge evaluator running on root observations of my traces. Make sure to add an 'other' category as well",
    );
  });
});
