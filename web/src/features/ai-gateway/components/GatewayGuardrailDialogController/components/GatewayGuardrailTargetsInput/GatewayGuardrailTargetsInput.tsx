import { useMemo } from "react";

import {
  AsyncAutocompleteInput,
  type AsyncAutocompleteOption,
} from "@/src/components/AsyncAutocompleteInput/AsyncAutocompleteInput";
import { EVERYONE_TARGET_OPTION } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/guardrailTargetConstants";
import { toggleGuardrailTargetOption } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailTargetsInput/fns/toggleGuardrailTargetOption";

export type GatewayGuardrailTargetPicker = {
  options: AsyncAutocompleteOption[];
  search: string;
  onSearchChange: (value: string) => void;
  isLoading: boolean;
};

export type GatewayGuardrailTargetsInputProps = {
  id?: string;
  describedById?: string;
  value: AsyncAutocompleteOption[];
  onChange: (value: AsyncAutocompleteOption[]) => void;
  picker: GatewayGuardrailTargetPicker;
  error?: boolean;
  disabled?: boolean;
};

/**
 * Guardrail "Applies to" selector: Everyone (`ORGANIZATION`), or specific users
 * and gateway API keys. Selecting Everyone clears individual targets and vice
 * versa.
 */
export function GatewayGuardrailTargetsInput({
  id,
  describedById,
  value,
  onChange,
  picker,
  error,
  disabled,
}: GatewayGuardrailTargetsInputProps) {
  const options = useMemo(() => {
    const trimmed = picker.search.trim().toLowerCase();
    const includeEveryone =
      trimmed.length === 0 || "everyone".includes(trimmed);
    return includeEveryone
      ? [EVERYONE_TARGET_OPTION, ...picker.options]
      : picker.options;
  }, [picker.options, picker.search]);

  const handleOptionSelect = (option: AsyncAutocompleteOption) => {
    picker.onSearchChange("");
    onChange(toggleGuardrailTargetOption(value, option));
  };

  return (
    <AsyncAutocompleteInput
      id={id}
      aria-label="Applies to"
      aria-describedby={describedById}
      value={value}
      options={options}
      onValueChange={onChange}
      onOptionSelect={handleOptionSelect}
      search={{
        value: picker.search,
        onValueChange: picker.onSearchChange,
      }}
      loading={picker.isLoading ? { message: "Loading…" } : undefined}
      placeholder={
        value.length === 0
          ? "Select Everyone, users, or API keys"
          : "Add users or API keys"
      }
      emptyMessage="No matching users or gateway keys."
      clearLabel="Clear targets"
      error={error}
      disabled={disabled}
    />
  );
}
