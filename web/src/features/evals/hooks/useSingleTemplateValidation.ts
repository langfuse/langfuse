import { api } from "@/src/utils/api";
import { type EvalTemplate } from "@langfuse/shared";

export function useSingleTemplateValidation({
  projectId,
}: {
  projectId: string;
}) {
  const { data: defaultModel } = api.defaultLlmModel.fetchDefaultModel.useQuery(
    { projectId },
  );

  const templateRequiresDefaultModel = (
    template: Partial<EvalTemplate> & Pick<EvalTemplate, "provider" | "model">,
  ): boolean => {
    return !template.provider || !template.model;
  };

  const isTemplateInvalid = (
    template: Partial<EvalTemplate> & Pick<EvalTemplate, "provider" | "model">,
  ): boolean => {
    return templateRequiresDefaultModel(template) && !defaultModel;
  };

  return {
    isTemplateInvalid,
  };
}
