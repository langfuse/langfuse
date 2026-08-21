import { managedEvaluatorTemplateService } from "@/src/features/evals/v2/fns/templateGallery/managedEvaluatorTemplateService";

describe("managedEvaluatorTemplateService", () => {
  it("owns template lookup and filtering", () => {
    const allCaps = managedEvaluatorTemplateService.get("all-caps");
    const codeTemplates = managedEvaluatorTemplateService.list({
      search: "caps",
      type: "CODE",
    });
    const recommendedTemplates = managedEvaluatorTemplateService.list({
      category: "recommended",
    });

    expect(allCaps?.name).toBe("Detect User Frustration (ALL CAPS)");
    expect(codeTemplates.templates.map(({ key }) => key)).toEqual(["all-caps"]);
    expect(recommendedTemplates.templates.map(({ key }) => key)).toEqual([
      "out-of-scope-request",
      "quality-criterion",
      "topic-classifier",
    ]);
    expect(codeTemplates.categories.length).toBeGreaterThan(0);
  });
});
