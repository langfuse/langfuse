import { describe, expect, it, vi } from "vitest";
import {
  applyEvaluatorSuggestion,
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
