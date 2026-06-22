import { api } from "@/src/utils/api";
import { type EvalTemplate } from "@langfuse/shared";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";
import {
  isCodeEvalTemplate,
  shouldShowEvalTemplate,
} from "@/src/features/evals/utils/code-eval-template-utils";

export type TemplateValidationInput = Pick<
  EvalTemplate,
  "provider" | "model" | "type" | "sourceCodeLanguage"
>;

export function useSingleTemplateValidation({
  projectId,
  enabled = true,
}: {
  projectId: string;
  enabled?: boolean;
}) {
  const codeEvalCapabilities = useIsCodeEvalEnabled();
  const { data: defaultModel } = api.defaultLlmModel.fetchDefaultModel.useQuery(
    { projectId },
    { enabled: enabled && !!projectId },
  );

  const templateRequiresDefaultModel = (
    template: Pick<TemplateValidationInput, "provider" | "model" | "type">,
  ): boolean => {
    if (isCodeEvalTemplate(template)) return false;

    return !template.provider || !template.model;
  };

  const isTemplateInvalid = (template: TemplateValidationInput): boolean => {
    if (!enabled) return false;

    if (isCodeEvalTemplate(template)) {
      return !shouldShowEvalTemplate(template, codeEvalCapabilities);
    }

    return templateRequiresDefaultModel(template) && !defaultModel;
  };

  return {
    isTemplateInvalid,
  };
}
