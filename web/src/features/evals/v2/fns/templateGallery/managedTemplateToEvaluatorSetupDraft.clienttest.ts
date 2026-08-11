import { MANAGED_TEMPLATES_CATALOG } from "@/src/features/evals/v2/constants/managedTemplatesCatalog";
import { managedTemplateToEvaluatorSetupDraft } from "@/src/features/evals/v2/fns/templateGallery/managedTemplateToEvaluatorSetupDraft";

describe("managedTemplateToEvaluatorSetupDraft", () => {
  it("prefills an LLM evaluator without persisting a model choice", () => {
    const template = MANAGED_TEMPLATES_CATALOG.templates.find(
      ({ key }) => key === "hallucination",
    );
    expect(template).toBeDefined();

    expect(managedTemplateToEvaluatorSetupDraft(template!)).toMatchObject({
      name: "Hallucination",
      definition: {
        type: "LLM_AS_JUDGE",
        provider: null,
        model: null,
        vars: ["query", "generation"],
        variableMapping: [
          { templateVariable: "query", selectedColumnId: "input" },
          { templateVariable: "generation", selectedColumnId: "output" },
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
      name: "Exact Match",
      definition: {
        type: "CODE",
        sourceCodeLanguage: "TYPESCRIPT",
        variableMapping: null,
      },
    });
  });
});
