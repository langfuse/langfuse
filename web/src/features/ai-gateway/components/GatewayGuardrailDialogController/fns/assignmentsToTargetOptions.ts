import { KeyRound, User } from "@langfuse/icons";

import type { AsyncAutocompleteOption } from "@/src/components/AsyncAutocompleteInput/AsyncAutocompleteInput";
import {
  API_KEY_TARGET_PREFIX,
  EVERYONE_TARGET_OPTION,
  USER_TARGET_PREFIX,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/guardrailTargetConstants";
import type { GatewayGuardrailRow } from "@/src/features/ai-gateway/types/gatewayGuardrailRow";
import { assertUnreachable } from "@/src/utils/types";

export function assignmentsToTargetOptions(
  assignments: GatewayGuardrailRow["assignments"],
): AsyncAutocompleteOption[] {
  return assignments.flatMap((assignment) => {
    switch (assignment.scope) {
      case "ORGANIZATION":
        return [EVERYONE_TARGET_OPTION];
      case "USER":
        if (assignment.userId === null) return [];
        return [
          {
            value: `${USER_TARGET_PREFIX}${assignment.userId}`,
            label: assignment.label,
            secondaryLabel: assignment.secondaryLabel,
            icon: User,
          },
        ];
      case "API_KEY":
        if (assignment.apiKeyId === null) return [];
        return [
          {
            value: `${API_KEY_TARGET_PREFIX}${assignment.apiKeyId}`,
            label: assignment.label,
            icon: KeyRound,
          },
        ];
      default:
        return assertUnreachable(assignment);
    }
  });
}
