import type { RoleHandoffTransition } from "./spielwieseRoleHandoff";

type SpielwieseOnboardingRoleNodeHandoff = {
  markupHtml: RoleHandoffTransition["markup"]["nodeHtml"];
  sourceNodeRect: RoleHandoffTransition["snapshot"]["sourceNodeRect"];
  targetNodeId: RoleHandoffTransition["snapshot"]["targetNodeId"];
};

export type SpielwieseOnboardingDashboardHandoff = {
  modelValue: string;
  roleNodeHandoff?: SpielwieseOnboardingRoleNodeHandoff;
  systemPromptValue: string;
  transitionKind?: "role-flow";
};

export const spielwieseOnboardingHandoffUserMessage =
  "Here you can type in user messages... try it out (delete me and type write something)";

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
