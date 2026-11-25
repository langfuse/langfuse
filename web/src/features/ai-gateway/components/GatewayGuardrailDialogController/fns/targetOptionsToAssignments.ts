import type { AsyncAutocompleteOption } from "@/src/components/AsyncAutocompleteInput/AsyncAutocompleteInput";
import {
  API_KEY_TARGET_PREFIX,
  EVERYONE_TARGET_VALUE,
  USER_TARGET_PREFIX,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/guardrailTargetConstants";
import type { GatewayGuardrailAssignmentInput } from "@/src/features/ai-gateway/types/gatewayGuardrail";

export function targetOptionsToAssignments(
  options: readonly AsyncAutocompleteOption[],
): GatewayGuardrailAssignmentInput[] {
  return options.flatMap<GatewayGuardrailAssignmentInput>((option) => {
    if (option.value === EVERYONE_TARGET_VALUE) {
      return [{ scope: "ORGANIZATION" }];
    }
    if (option.value.startsWith(USER_TARGET_PREFIX)) {
      return [
        {
          scope: "USER",
          userId: option.value.slice(USER_TARGET_PREFIX.length),
        },
      ];
    }
    if (option.value.startsWith(API_KEY_TARGET_PREFIX)) {
      return [
        {
          scope: "API_KEY",
          apiKeyId: option.value.slice(API_KEY_TARGET_PREFIX.length),
        },
      ];
    }
    return [];
  });
}
