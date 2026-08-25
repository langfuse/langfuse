import { describe, expect, it } from "vitest";

import { getEvaluatorCreationAnalyticsProperties } from "./getEvaluatorCreationAnalyticsProperties";

describe("getEvaluatorCreationAnalyticsProperties", () => {
  it("reports which managed catalog template was used", () => {
    expect(
      getEvaluatorCreationAnalyticsProperties({
        evaluatorType: "CODE",
        creationSource: { type: "managed", templateKey: "exact-match" },
      }),
    ).toEqual({
      evaluatorType: "CODE",
      managedTemplateKey: "exact-match",
      isCustomTemplate: false,
      isFromScratch: false,
    });
  });

  it("reports custom templates without exposing their identity", () => {
    expect(
      getEvaluatorCreationAnalyticsProperties({
        evaluatorType: "LLM_AS_JUDGE",
        creationSource: { type: "custom" },
      }),
    ).toEqual({
      evaluatorType: "LLM_AS_JUDGE",
      isCustomTemplate: true,
      isFromScratch: false,
    });
  });

  it("reports evaluators created from scratch", () => {
    expect(
      getEvaluatorCreationAnalyticsProperties({
        evaluatorType: "LLM_AS_JUDGE",
        creationSource: { type: "scratch" },
      }),
    ).toEqual({
      evaluatorType: "LLM_AS_JUDGE",
      isCustomTemplate: false,
      isFromScratch: true,
    });
  });
});
