import {
  EvalTemplateSourceCodeLanguageEnum,
  type EvalTemplateSourceCodeLanguage,
} from "@langfuse/shared";

import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { SelectDropdown } from "@/src/components/design-system/SelectDropdown/SelectDropdown";
import { selectTriggerClassName } from "@/src/components/ui/select";
import { sourceCodeLanguageLabel } from "@/src/features/evals/v2/fns/evaluators/sourceCodeLanguageLabel";
import { cn } from "@/src/utils/tailwind";

const LANGUAGE_OPTIONS = [
  EvalTemplateSourceCodeLanguageEnum.PYTHON,
  EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT,
].map((value) => ({
  value,
  label: sourceCodeLanguageLabel(value),
}));

/** Selects the runtime language for a code evaluator. */
export function EvaluatorCodeLanguageSelector({
  value,
  onValueChange,
  disabled = false,
}: {
  value: EvalTemplateSourceCodeLanguage;
  onValueChange: (value: EvalTemplateSourceCodeLanguage) => void;
  disabled?: boolean;
}) {
  return (
    <SelectDropdown
      aria-label="Code language"
      value={value}
      options={LANGUAGE_OPTIONS}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      {({ getTriggerProps, selectedLabel }) => (
        <button
          {...getTriggerProps()}
          className={cn(selectTriggerClassName, "w-auto")}
        >
          {selectedLabel}
          <DropdownIndicator />
        </button>
      )}
    </SelectDropdown>
  );
}
