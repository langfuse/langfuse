import { SiPython, SiTypescript } from "@langfuse/icons/si";
import {
  EvalTemplateSourceCodeLanguageEnum,
  type EvalTemplateSourceCodeLanguage,
} from "@langfuse/shared";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
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
    <Tabs
      value={value}
      onValueChange={(language) =>
        onValueChange(language as EvalTemplateSourceCodeLanguage)
      }
    >
      <Tabs.List variant="inset" size="md">
        <Tabs.Trigger
          value={EvalTemplateSourceCodeLanguageEnum.PYTHON}
          disabled={disabled}
        >
          <SiPython size="base" />
          {sourceCodeLanguageLabel(EvalTemplateSourceCodeLanguageEnum.PYTHON)}
        </Tabs.Trigger>
        <Tabs.Trigger
          value={EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT}
          disabled={disabled}
        >
          <SiTypescript size="base" />
          {sourceCodeLanguageLabel(
            EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT,
          )}
        </Tabs.Trigger>
      </Tabs.List>
    </Tabs>
  );
}
