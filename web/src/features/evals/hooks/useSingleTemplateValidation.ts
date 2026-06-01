import { api } from "@/src/utils/api";
import type { EvalTemplateWithType } from "@langfuse/shared";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";
import {
  isCodeEvalTemplate,
  shouldShowEvalTemplate,
} from "@/src/features/evals/utils/code-eval-template-utils";

export type TemplateValidationInput =
  EvalTemplateWithType extends infer Template
    ? Template extends EvalTemplateWithType
      ? Pick<Template, "provider" | "model" | "type" | "sourceCodeLanguage">
      : never
    : never;

export function useSingleTemplateValidation({
  projectId,
}: {
  projectId: string;
}) {
  const codeEvalCapabilities = useIsCodeEvalEnabled();
  const { data: defaultModel } = api.defaultLlmModel.fetchDefaultModel.useQuery(
    { projectId },
  );

  const templateRequiresDefaultModel = (
    template: Pick<TemplateValidationInput, "provider" | "model" | "type">,
  ): boolean => {
    if (isCodeEvalTemplate(template)) return false;

    return !template.provider || !template.model;
  };

  const isTemplateInvalid = (template: TemplateValidationInput): boolean => {
    if (isCodeEvalTemplate(template)) {
      return !shouldShowEvalTemplate(template, codeEvalCapabilities);
    }

    return templateRequiresDefaultModel(template) && !defaultModel;
  };

  return {
    isTemplateInvalid,
  };
}
