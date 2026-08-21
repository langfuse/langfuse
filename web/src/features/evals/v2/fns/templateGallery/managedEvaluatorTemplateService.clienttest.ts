import { managedEvaluatorTemplateService } from "@/src/features/evals/v2/fns/templateGallery/managedEvaluatorTemplateService";

describe("managedEvaluatorTemplateService", () => {
  it("owns template lookup and filtering", () => {
    const exactMatch = managedEvaluatorTemplateService.get("exact-match");
    const codeTemplates = managedEvaluatorTemplateService.list({
      search: "exact",
      type: "CODE",
    });
    const recommendedTemplates = managedEvaluatorTemplateService.list({
      category: "recommended",
    });

    expect(exactMatch?.name).toBe("Check if Output Is an Exact Match");
    expect(codeTemplates.templates.map(({ key }) => key)).toEqual([
      "exact-match",
    ]);
    expect(recommendedTemplates.templates.map(({ key }) => key)).toEqual([
      "out-of-scope-request",
      "quality-criterion",
      "topic-classifier",
    ]);
    expect(codeTemplates.categories.length).toBeGreaterThan(0);
  });
});
