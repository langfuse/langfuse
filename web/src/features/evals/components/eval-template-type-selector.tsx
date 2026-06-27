import { useRef } from "react";
import { type UseFormReturn } from "react-hook-form";
import { type z } from "zod";
import {
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
} from "@langfuse/shared";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { type templateFormSchema } from "@/src/features/evals/utils/template-form-schema";
import {
  type CodeEvalSourceCodeLanguage,
  getDefaultCodeEvalSource,
} from "@/src/features/evals/utils/code-eval-template-validation";

type EvalTemplateFormInput = z.input<typeof templateFormSchema>;
type EvalTemplateFormOutput = z.output<typeof templateFormSchema>;
type EvalTemplateFormReturn = UseFormReturn<
  EvalTemplateFormInput,
  unknown,
  EvalTemplateFormOutput
>;
type CodeEvalSourceDrafts = Partial<Record<CodeEvalSourceCodeLanguage, string>>;
type CodeEvalCapabilities = {
  enabled: boolean;
  supportedSourceCodeLanguages: EvalTemplateSourceCodeLanguage[];
};

export type EvalTemplateTypeSelectorMode = "all" | "code-only" | "hidden";

export function EvalTemplateTypeSelector({
  form,
  codeEvalCapabilities,
  mode,
  hasExistingTemplate,
  onChange,
}: {
  form: EvalTemplateFormReturn;
  codeEvalCapabilities: CodeEvalCapabilities;
  mode: EvalTemplateTypeSelectorMode;
  hasExistingTemplate: boolean;
  onChange?: () => void;
}) {
  const sourceCodeDraftsRef = useRef<CodeEvalSourceDrafts>({});
  const evalTemplateType = form.watch("type");
  const sourceCodeLanguage =
    form.watch("sourceCodeLanguage") ??
    EvalTemplateSourceCodeLanguage.TYPESCRIPT;
  const shouldShow =
    codeEvalCapabilities.enabled && !hasExistingTemplate && mode !== "hidden";

  if (!shouldShow) return null;

  const selectedValue =
    evalTemplateType === EvalTemplateType.CODE
      ? sourceCodeLanguage
      : EvalTemplateType.LLM_AS_JUDGE;

  const handleTemplateTypeSelection = (
    nextValue:
      | typeof EvalTemplateType.LLM_AS_JUDGE
      | CodeEvalSourceCodeLanguage,
  ) => {
    const currentSourceCode = form.getValues("sourceCode") ?? "";
    const currentSourceCodeLanguage =
      form.getValues("sourceCodeLanguage") ??
      EvalTemplateSourceCodeLanguage.TYPESCRIPT;

    if (evalTemplateType === EvalTemplateType.CODE) {
      sourceCodeDraftsRef.current[currentSourceCodeLanguage] =
        currentSourceCode;
    }

    if (nextValue === EvalTemplateType.LLM_AS_JUDGE) {
      form.setValue("type", EvalTemplateType.LLM_AS_JUDGE);
      onChange?.();
      return;
    }

    form.setValue("type", EvalTemplateType.CODE);
    form.setValue("sourceCodeLanguage", nextValue);
    form.setValue(
      "sourceCode",
      sourceCodeDraftsRef.current[nextValue] ??
        getDefaultCodeEvalSource(nextValue),
    );

    onChange?.();
  };

  return (
    <FormField
      control={form.control}
      name="type"
      render={() => (
        <FormItem>
          <FormLabel>Type</FormLabel>
          <FormControl>
            <Tabs
              value={selectedValue}
              onValueChange={(value) =>
                handleTemplateTypeSelection(
                  value as
                    | typeof EvalTemplateType.LLM_AS_JUDGE
                    | CodeEvalSourceCodeLanguage,
                )
              }
            >
              <TabsList className="grid w-fit max-w-fit grid-flow-col gap-4">
                {mode === "all" ? (
                  <TabsTrigger
                    value={EvalTemplateType.LLM_AS_JUDGE}
                    className="min-w-[100px]"
                  >
                    LLM-as-judge
                  </TabsTrigger>
                ) : null}
                <TabsTrigger
                  value={EvalTemplateSourceCodeLanguage.TYPESCRIPT}
                  className="min-w-[100px]"
                >
                  TypeScript
                </TabsTrigger>
                {codeEvalCapabilities.supportedSourceCodeLanguages.includes(
                  EvalTemplateSourceCodeLanguage.PYTHON,
                ) ? (
                  <TabsTrigger
                    value={EvalTemplateSourceCodeLanguage.PYTHON}
                    className="min-w-[100px]"
                  >
                    Python
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </Tabs>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
