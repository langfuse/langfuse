import {
  EvalTemplateSourceCodeLanguageEnum,
  type EvalTemplateSourceCodeLanguage,
} from "@langfuse/shared";

import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { SelectDropdown } from "@/src/components/design-system/SelectDropdown/SelectDropdown";
import { sourceCodeLanguageLabel } from "@/src/features/evals/v2/fns/evaluators/sourceCodeLanguageLabel";

const LANGUAGE_OPTIONS = [
  EvalTemplateSourceCodeLanguageEnum.PYTHON,
  EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT,
].map((value) => ({
  value,
  label: sourceCodeLanguageLabel(value),
}));

const triggerClassName =
  "text-foreground hover:bg-accent focus-visible:ring-ring inline-flex items-center gap-1 rounded px-1.5 py-1 text-sm focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50";

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
        <button {...getTriggerProps()} className={triggerClassName}>
          {selectedLabel}
          <DropdownIndicator />
        </button>
      )}
    </SelectDropdown>
  );
}
