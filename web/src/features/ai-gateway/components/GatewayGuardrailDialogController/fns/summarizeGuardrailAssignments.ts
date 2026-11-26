import type { GatewayGuardrailAssignmentScope } from "@langfuse/shared";

import type { GatewayGuardrailTargetingAnalytics } from "@/src/features/ai-gateway/types/aiGatewayAnalytics";

export function summarizeGuardrailAssignments(
  assignments: readonly { scope: GatewayGuardrailAssignmentScope }[],
): GatewayGuardrailTargetingAnalytics {
  let appliesToEveryone = false;
  let targetedUserCount = 0;
  let targetedApiKeyCount = 0;

  for (const assignment of assignments) {
    switch (assignment.scope) {
      case "ORGANIZATION":
        appliesToEveryone = true;
        break;
      case "USER":
        targetedUserCount += 1;
        break;
      case "API_KEY":
        targetedApiKeyCount += 1;
        break;
    }
  }

  if (appliesToEveryone) {
    return {
      appliesTo: "everyone",
      targetedUserCount: 0,
      targetedApiKeyCount: 0,
    };
  }

  return {
    appliesTo: "subset",
    targetedUserCount,
    targetedApiKeyCount,
  };
}
