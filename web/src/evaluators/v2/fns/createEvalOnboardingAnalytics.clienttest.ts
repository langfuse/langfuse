import type { EvalTemplateType } from "@langfuse/shared";
import { describe, expect, it, vi } from "vitest";

import { createEvalOnboardingAnalytics } from "./createEvalOnboardingAnalytics";

function setup() {
  const capture = vi.fn();
  let evaluatorType: EvalTemplateType = "LLM_AS_JUDGE";
  const analytics = createEvalOnboardingAnalytics({
    capture,
    getEvaluatorType: () => evaluatorType,
  });
  return {
    analytics,
    capture,
    setEvaluatorType: (type: EvalTemplateType) => {
      evaluatorType = type;
    },
  };
}

describe("createEvalOnboardingAnalytics", () => {
  it("emits each step once, stamped with the evaluator type at the time", () => {
    const { analytics, capture, setEvaluatorType } = setup();

    analytics.completeStep({ stepName: "evaluator_name_updated" });
    setEvaluatorType("CODE");
    analytics.completeStep({ stepName: "evaluator_name_updated" });
    analytics.completeStep({ stepName: "evaluator_tested" });

    expect(capture.mock.calls).toEqual([
      [
        "eval:onboarding_step_completed",
        { stepName: "evaluator_name_updated", evaluatorType: "LLM_AS_JUDGE" },
      ],
      [
        "eval:onboarding_step_completed",
        { stepName: "evaluator_tested", evaluatorType: "CODE" },
      ],
    ]);
  });

  it("fires interaction events every time unless they share a once key", () => {
    const { analytics, capture } = setup();

    analytics.track("eval:onboarding_model_picker_opened", {});
    analytics.track("eval:onboarding_model_picker_opened", {});
    analytics.track(
      "eval:onboarding_sampling_changed",
      {},
      { onceKey: "sampling_changed" },
    );
    analytics.track(
      "eval:onboarding_sampling_changed",
      {},
      { onceKey: "sampling_changed" },
    );

    expect(capture.mock.calls.map(([event]) => event)).toEqual([
      "eval:onboarding_model_picker_opened",
      "eval:onboarding_model_picker_opened",
      "eval:onboarding_sampling_changed",
    ]);
  });

  it("completes onboarding once with the execute step", () => {
    const { analytics, capture } = setup();
    const execution = {
      executionPath: "test_filters" as const,
      hasBackfill: true,
      samplingPercent: 50,
    };

    analytics.completeOnboarding(execution);
    analytics.completeOnboarding(execution);

    expect(capture.mock.calls).toEqual([
      [
        "eval:onboarding_step_completed",
        { stepName: "execute", ...execution, evaluatorType: "LLM_AS_JUDGE" },
      ],
      [
        "eval:onboarding_completed",
        { ...execution, evaluatorType: "LLM_AS_JUDGE" },
      ],
    ]);
  });
});
