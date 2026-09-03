import { describe, expect, it } from "vitest";
import { EvalTemplateTypeEnum } from "@langfuse/shared";

import { formatEvaluatorCostCalculation } from "./formatEvaluatorCostCalculation";

describe("formatEvaluatorCostCalculation", () => {
  it("shows the individual inputs and weekly result", () => {
    expect(
      formatEvaluatorCostCalculation({
        matchingObservations: 1_840,
        sampling: 0.4,
        testRunCostUsd: 0.001,
        estimatedCostUsd: 0.736,
        evaluatorType: EvalTemplateTypeEnum.LLM_AS_JUDGE,
      }),
    ).toBe(
      "1,840 matching observations × 40% sampling × $0.001 per evaluation = ≈ $0.74 / week. Expected cost on your linked API key (not Langfuse). Matching observations are based on the last 7 days. Per-evaluation cost uses the latest cost-bearing evaluator trace from that period, or a fallback test call.",
    );
  });

  it("explains when neither a recent trace nor fallback test provides a cost", () => {
    expect(
      formatEvaluatorCostCalculation({
        matchingObservations: 318,
        sampling: 0.25,
        testRunCostUsd: null,
        estimatedCostUsd: null,
        evaluatorType: EvalTemplateTypeEnum.LLM_AS_JUDGE,
      }),
    ).toBe(
      "No cost-bearing evaluator trace was available from the last 7 days, and the fallback test call did not return a usable model cost. Expected cost would be charged to your linked API key, not Langfuse.",
    );
  });

  it("shows zero cost when no observations match", () => {
    expect(
      formatEvaluatorCostCalculation({
        matchingObservations: 0,
        sampling: 1,
        testRunCostUsd: null,
        estimatedCostUsd: 0,
        evaluatorType: EvalTemplateTypeEnum.LLM_AS_JUDGE,
      }),
    ).toBe(
      "0 matching observations × 100% sampling = ≈ $0.00 / week. Expected cost on your linked API key (not Langfuse). Matching observations are based on the last 7 days.",
    );
  });

  it("explains why code evaluators have no model-provider cost", () => {
    expect(
      formatEvaluatorCostCalculation({
        matchingObservations: 318,
        sampling: 0.25,
        testRunCostUsd: 0,
        estimatedCostUsd: 0,
        evaluatorType: EvalTemplateTypeEnum.CODE,
      }),
    ).toBe(
      "Code evaluators do not call an LLM, so they do not incur model-provider / LLM costs.",
    );
  });

  it("does not claim a 7-day window when a selection has no priced test", () => {
    expect(
      formatEvaluatorCostCalculation({
        matchingObservations: 3,
        sampling: 1,
        testRunCostUsd: null,
        estimatedCostUsd: null,
        evaluatorType: EvalTemplateTypeEnum.LLM_AS_JUDGE,
        period: "selection",
      }),
    ).toBe(
      "No cost-bearing evaluator trace was available, and the fallback test call did not return a usable model cost. Expected cost would be charged to your linked API key, not Langfuse.",
    );
  });

  it("describes a one-shot selection instead of a weekly total", () => {
    expect(
      formatEvaluatorCostCalculation({
        matchingObservations: 12,
        sampling: 1,
        testRunCostUsd: 0.01,
        estimatedCostUsd: 0.12,
        evaluatorType: EvalTemplateTypeEnum.LLM_AS_JUDGE,
        period: "selection",
      }),
    ).toBe(
      "12 observations × 100% sampling × $0.01 per evaluation = ≈ $0.12 for this run. Expected cost on your linked API key (not Langfuse). Per-evaluation cost uses the latest cost-bearing evaluator trace from that period, or a fallback test call.",
    );
  });
});
