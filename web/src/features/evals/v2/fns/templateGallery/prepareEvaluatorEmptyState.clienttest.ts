import { EVALUATOR_EMPTY_STATE_DOCS_HREF } from "@/src/features/evals/v2/constants/evaluatorEmptyState";
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
      emptyState.startingPoints.map(({ template }) => template.key),
    ).toEqual(["topic-classifier", "user-disagreement"]);
    expect(
      emptyState.startingPoints.map(({ title, categoryKey }) => ({
        title,
        categoryKey,
      })),
    ).toEqual([
      { title: "Detect Topics", categoryKey: "recommended" },
      { title: "Detect User Disagreement", categoryKey: "conversation" },
    ]);
  });
});
