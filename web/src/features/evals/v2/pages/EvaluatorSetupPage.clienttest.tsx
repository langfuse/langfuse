import { describe, expect, it, vi } from "vitest";
import {
  applyEvaluatorSuggestion,
  getEvaluatorCreateAnalyticsProperties,
  shouldOfferRuleAttachment,
} from "./EvaluatorSetupPage";

describe("shouldOfferRuleAttachment", () => {
  it("does not offer rule attachment for a blocked evaluator", () => {
    expect(shouldOfferRuleAttachment({ blockedAt: new Date() })).toBe(false);
  });

  it("offers rule attachment for an active evaluator", () => {
    expect(shouldOfferRuleAttachment({ blockedAt: null })).toBe(true);
  });
});

describe("applyEvaluatorSuggestion", () => {
  it("reports when generation returns no suggestion", () => {
    const setSuggestion = vi.fn();

    expect(applyEvaluatorSuggestion(null, setSuggestion)).toBe(false);
    expect(setSuggestion).not.toHaveBeenCalled();
  });

  it("applies a generated suggestion", () => {
    const setSuggestion = vi.fn();

    expect(applyEvaluatorSuggestion("Quality judge", setSuggestion)).toBe(true);
    expect(setSuggestion).toHaveBeenCalledWith("Quality judge");
  });
});

describe("getEvaluatorCreateAnalyticsProperties", () => {
  it("reports which managed catalog template was used", () => {
    expect(
      getEvaluatorCreateAnalyticsProperties({
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
      getEvaluatorCreateAnalyticsProperties({
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
      getEvaluatorCreateAnalyticsProperties({
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
