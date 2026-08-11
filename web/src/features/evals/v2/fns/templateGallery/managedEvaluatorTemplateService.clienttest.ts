import { managedEvaluatorTemplateService } from "@/src/features/evals/v2/fns/templateGallery/managedEvaluatorTemplateService";

describe("managedEvaluatorTemplateService", () => {
  it("owns template lookup and filtering", () => {
    const exactMatch = managedEvaluatorTemplateService.get("exact-match");
    const codeTemplates = managedEvaluatorTemplateService.list({
      search: "exact",
      type: "CODE",
    });

    expect(exactMatch?.name).toBe("Exact Match");
    expect(codeTemplates.templates.map(({ key }) => key)).toEqual([
      "exact-match",
    ]);
    expect(codeTemplates.categories.length).toBeGreaterThan(0);
  });
});
