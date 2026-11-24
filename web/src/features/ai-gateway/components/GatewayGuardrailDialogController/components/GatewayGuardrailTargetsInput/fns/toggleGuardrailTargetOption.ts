import type { AsyncAutocompleteOption } from "@/src/components/AsyncAutocompleteInput/AsyncAutocompleteInput";
import {
  EVERYONE_TARGET_OPTION,
  EVERYONE_TARGET_VALUE,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/guardrailTargetConstants";

/**
 * Enforces mutual exclusivity between Everyone (`ORGANIZATION`) and specific
 * users or API keys.
 */
export function toggleGuardrailTargetOption(
  current: readonly AsyncAutocompleteOption[],
  option: AsyncAutocompleteOption,
): AsyncAutocompleteOption[] {
  const isSelected = current.some((item) => item.value === option.value);
  if (option.value === EVERYONE_TARGET_VALUE) {
    return isSelected ? [] : [EVERYONE_TARGET_OPTION];
  }
  const withoutEveryone = current.filter(
    (item) => item.value !== EVERYONE_TARGET_VALUE,
  );
  if (isSelected) {
    return withoutEveryone.filter((item) => item.value !== option.value);
  }
  return [...withoutEveryone, option];
}
