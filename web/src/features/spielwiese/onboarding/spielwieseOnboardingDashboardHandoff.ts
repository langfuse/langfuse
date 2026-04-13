export type SpielwieseOnboardingDashboardHandoff = {
  modelValue: string;
  systemPromptValue: string;
};

let pendingDashboardHandoff: SpielwieseOnboardingDashboardHandoff | null = null;

export function setOnboardingDashboardHandoff(
  handoff: SpielwieseOnboardingDashboardHandoff,
) {
  pendingDashboardHandoff = handoff;
}

export function consumeOnboardingDashboardHandoff() {
  const handoff = pendingDashboardHandoff;

  pendingDashboardHandoff = null;

  return handoff;
}

export function resetOnboardingDashboardHandoffForTests() {
  pendingDashboardHandoff = null;
}
