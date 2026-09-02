import { SiPython, SiTypescript } from "react-icons/si";
import {
  EvalTemplateSourceCodeLanguageEnum,
  type EvalTemplateSourceCodeLanguage,
} from "@langfuse/shared";

import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
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
      <TabsList variant="outline">
        <TabsTrigger
          value={EvalTemplateSourceCodeLanguageEnum.PYTHON}
          disabled={disabled}
        >
          <SiPython className="h-3.5 w-3.5 shrink-0" />
          {sourceCodeLanguageLabel(EvalTemplateSourceCodeLanguageEnum.PYTHON)}
        </TabsTrigger>
        <TabsTrigger
          value={EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT}
          disabled={disabled}
        >
          <SiTypescript className="h-3.5 w-3.5 shrink-0" />
          {sourceCodeLanguageLabel(
            EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT,
          )}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
