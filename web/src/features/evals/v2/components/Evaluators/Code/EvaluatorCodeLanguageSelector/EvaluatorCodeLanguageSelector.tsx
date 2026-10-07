import { SiPython, SiTypescript } from "react-icons/si";
import {
  EvalTemplateSourceCodeLanguageEnum,
  type EvalTemplateSourceCodeLanguage,
} from "@langfuse/shared";

import { ToggleGroup } from "@/src/components/design-system/ToggleGroup/ToggleGroup";
import { sourceCodeLanguageLabel } from "@/src/features/evals/v2/fns/evaluators/sourceCodeLanguageLabel";

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
    <ToggleGroup
      value={value}
      onValueChange={(language) =>
        onValueChange(language as EvalTemplateSourceCodeLanguage)
      }
    >
      <ToggleGroup.List variant="outline">
        <ToggleGroup.Trigger
          value={EvalTemplateSourceCodeLanguageEnum.PYTHON}
          disabled={disabled}
        >
          <SiPython className="icon-base shrink-0" />
          {sourceCodeLanguageLabel(EvalTemplateSourceCodeLanguageEnum.PYTHON)}
        </ToggleGroup.Trigger>
        <ToggleGroup.Trigger
          value={EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT}
          disabled={disabled}
        >
          <SiTypescript className="icon-base shrink-0" />
          {sourceCodeLanguageLabel(
            EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT,
          )}
        </ToggleGroup.Trigger>
      </ToggleGroup.List>
    </ToggleGroup>
  );
}
