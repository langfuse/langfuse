import { createContext, useContext, type ReactNode } from "react";
import type { createEvalOnboardingAnalytics } from "@/src/features/evals/v2/fns/createEvalOnboardingAnalytics";

type EvalOnboardingAnalytics = ReturnType<typeof createEvalOnboardingAnalytics>;

// Null outside an evaluator creation flow (editing, rule editor), so shared
// editor components only report onboarding events while creating.
const EvalOnboardingAnalyticsContext =
  createContext<EvalOnboardingAnalytics | null>(null);

export function EvalOnboardingAnalyticsProvider({
  value,
  children,
}: {
  value: EvalOnboardingAnalytics | null;
  children: ReactNode;
}) {
  return (
    <EvalOnboardingAnalyticsContext.Provider value={value}>
      {children}
    </EvalOnboardingAnalyticsContext.Provider>
  );
}

export function useEvalOnboardingAnalytics() {
  return useContext(EvalOnboardingAnalyticsContext);
}
