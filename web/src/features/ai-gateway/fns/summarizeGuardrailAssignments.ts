import type { GatewayGuardrailRow } from "@/src/features/ai-gateway/types/gatewayGuardrailRow";

export function summarizeGuardrailAssignments(
  assignments: readonly Pick<
    GatewayGuardrailRow["assignments"][number],
    "scope"
  >[],
) {
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

  const appliesTo: "everyone" | "subset" = appliesToEveryone
    ? "everyone"
    : "subset";

  return {
    appliesTo,
    targetedUserCount: appliesToEveryone ? 0 : targetedUserCount,
    targetedApiKeyCount: appliesToEveryone ? 0 : targetedApiKeyCount,
  };
}
