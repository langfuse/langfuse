import { SiPython, SiTypescript } from "react-icons/si";
import {
  EvalTemplateSourceCodeLanguageEnum,
  type EvalTemplateSourceCodeLanguage,
} from "@langfuse/shared";

import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { sourceCodeLanguageLabel } from "@/src/features/evals/v2/fns/sourceCodeLanguageLabel";

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
      <TabsList className="bg-background **:data-[state=active]:bg-muted border">
        <TabsTrigger
          value={EvalTemplateSourceCodeLanguageEnum.PYTHON}
          className="gap-1.5 leading-none"
          disabled={disabled}
        >
          <SiPython className="h-3.5 w-3.5 shrink-0" />
          {sourceCodeLanguageLabel(EvalTemplateSourceCodeLanguageEnum.PYTHON)}
        </TabsTrigger>
        <TabsTrigger
          value={EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT}
          className="gap-1.5 leading-none"
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
