/** tracingPageView picks what a tracing page renders, holding back the table and the onboarding until the first-trace check answers. */
export function tracingPageView(check: {
  isPending: boolean;
  hasTracingConfigured: boolean | undefined;
}): "checking" | "onboarding" | "table" {
  if (check.isPending) return "checking";
  if (!check.hasTracingConfigured) return "onboarding";
  return "table";
}
