import { managedTemplateExpectedOutputHint } from "@/src/features/evals/v2/fns/templateGallery/managedTemplateExpectedOutputHint";

describe("managedTemplateExpectedOutputHint", () => {
  it("returns the catalog hint for templates that declare one", () => {
    expect(managedTemplateExpectedOutputHint("keyword-match")).toEqual({
      shape:
        "expected_output must be a JSON object with an expected_keywords string array.",
      example:
        '{ "expected_keywords": ["refund", "invoice", "tracking number"] }',
    });
  });

  it("returns undefined when the template has no expected-output hint", () => {
    expect(managedTemplateExpectedOutputHint("language")).toBeUndefined();
    expect(managedTemplateExpectedOutputHint(null)).toBeUndefined();
  });

  it("ignores LLM template hints so a type switch cannot show the wrong shape", () => {
    expect(managedTemplateExpectedOutputHint("correctness")).toBeUndefined();
  });
});
