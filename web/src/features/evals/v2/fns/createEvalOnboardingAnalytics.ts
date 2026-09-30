import type { EvalTemplateType } from "@langfuse/shared";
import type { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import type { EvalOnboardingEventMap } from "@/src/features/evals/v2/types/evalOnboardingAnalytics";

type Capture = ReturnType<typeof usePostHogClientCapture>;
type WithoutEvaluatorType<T> = T extends unknown
  ? Omit<T, "evaluatorType">
  : never;
type OnboardingStep = EvalOnboardingEventMap["eval:onboarding_step_completed"];
type ExecuteStep = Extract<OnboardingStep, { stepName: "execute" }>;
// Gallery events fire before the setup page exists and are captured directly.
type SetupEventName = Exclude<
  keyof EvalOnboardingEventMap,
  | "eval:onboarding_started"
  | "eval:onboarding_step_completed"
  | "eval:onboarding_completed"
  | "eval:onboarding_gallery_searched"
  | "eval:onboarding_gallery_section_selected"
>;

/**
 * Analytics for one evaluator setup attempt. Every event carries the evaluator
 * type at the moment of the action; each step is emitted at most once so the
 * funnel counts reaching a step, not how often it was repeated.
 */
export function createEvalOnboardingAnalytics({
  capture,
  getEvaluatorType,
}: {
  capture: Capture;
  getEvaluatorType: () => EvalTemplateType;
}) {
  const emittedKeys = new Set<string>();
  const claim = (key: string) => {
    if (emittedKeys.has(key)) return false;
    emittedKeys.add(key);
    return true;
  };

  const completeStep = (step: WithoutEvaluatorType<OnboardingStep>) => {
    if (!claim(`step:${step.stepName}`)) return;
    capture("eval:onboarding_step_completed", {
      ...step,
      evaluatorType: getEvaluatorType(),
    } as OnboardingStep);
  };

  return {
    track<E extends SetupEventName>(
      event: E,
      properties: WithoutEvaluatorType<EvalOnboardingEventMap[E]>,
      options?: { onceKey?: string },
    ) {
      if (options?.onceKey && !claim(options.onceKey)) return;
      // `properties` is checked against the event map by this method's
      // signature; TypeScript cannot relate the generic index back to the
      // registry's property map, so the hand-off is widened here.
      (capture as (event: E, properties: object) => void)(event, {
        ...properties,
        evaluatorType: getEvaluatorType(),
      });
    },
    completeStep,
    completeOnboarding(
      execution: Omit<ExecuteStep, "stepName" | "evaluatorType">,
    ) {
      if (!claim("completed")) return;
      completeStep({ stepName: "execute", ...execution });
      capture("eval:onboarding_completed", {
        ...execution,
        evaluatorType: getEvaluatorType(),
      });
    },
  };
}
