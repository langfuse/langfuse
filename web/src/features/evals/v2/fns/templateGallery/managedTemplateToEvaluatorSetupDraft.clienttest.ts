import { MANAGED_TEMPLATES_CATALOG } from "@/src/features/evals/v2/constants/managedTemplatesCatalog";
import { managedTemplateToEvaluatorSetupDraft } from "@/src/features/evals/v2/fns/templateGallery/managedTemplateToEvaluatorSetupDraft";

describe("managedTemplateToEvaluatorSetupDraft", () => {
  it("prefills an LLM evaluator without persisting a model choice", () => {
    const template = MANAGED_TEMPLATES_CATALOG.templates.find(
      ({ key }) => key === "answer-relevance",
    );
    expect(template).toBeDefined();

    expect(managedTemplateToEvaluatorSetupDraft(template!)).toMatchObject({
      name: "Check Answer Relevance",
      definition: {
        type: "LLM_AS_JUDGE",
        provider: null,
        model: null,
        vars: ["user_input", "assistant_output"],
        variableMapping: [
          { templateVariable: "user_input", selectedColumnId: "input" },
          { templateVariable: "assistant_output", selectedColumnId: "output" },
        ],
      },
    });
  });

  it("prefills the Exact Match code evaluator", () => {
    const template = MANAGED_TEMPLATES_CATALOG.templates.find(
      ({ key }) => key === "exact-match",
    );
    expect(template).toBeDefined();

    expect(managedTemplateToEvaluatorSetupDraft(template!)).toMatchObject({
      name: "Check if Output Is an Exact Match",
      definition: {
        type: "CODE",
        sourceCodeLanguage: "TYPESCRIPT",
      },
    });
  });
});
