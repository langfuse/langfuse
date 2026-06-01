import { api } from "@/src/utils/api";
import { type EvalTemplate } from "@langfuse/shared";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";
import { isCodeEvalTemplate } from "@/src/features/evals/utils/code-eval-template-utils";

export function useSingleTemplateValidation({
  projectId,
}: {
  projectId: string;
}) {
  const { enabled: isCodeEvalEnabled } = useIsCodeEvalEnabled();
  const { data: defaultModel } = api.defaultLlmModel.fetchDefaultModel.useQuery(
    { projectId },
  );

  const templateRequiresDefaultModel = (
    template: Partial<Pick<EvalTemplate, "provider" | "model" | "type">>,
  ): boolean => {
    if (isCodeEvalTemplate(template)) return false;

    return !template.provider || !template.model;
  };

  const isTemplateInvalid = (
    template: Partial<Pick<EvalTemplate, "provider" | "model" | "type">>,
  ): boolean => {
    if (isCodeEvalTemplate(template)) return !isCodeEvalEnabled;

    return templateRequiresDefaultModel(template) && !defaultModel;
  };

  return {
    isTemplateInvalid,
  };
}
