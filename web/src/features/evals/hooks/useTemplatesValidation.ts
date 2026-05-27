import { useState, useEffect } from "react";
import { api } from "@/src/utils/api";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";
import { isCodeEvalTemplate } from "@/src/features/evals/utils/code-eval-template-utils";

export function useTemplatesValidation({
  projectId,
  selectedTemplateIds = [],
}: {
  projectId: string;
  selectedTemplateIds?: string[];
}) {
  const [isSelectionValid, setIsSelectionValid] = useState(true);
  const { enabled: isCodeEvalEnabled } = useIsCodeEvalEnabled();

  // Fetch default model
  const { data: defaultModel, isLoading: isLoadingDefaultModel } =
    api.defaultLlmModel.fetchDefaultModel.useQuery(
      { projectId },
      { enabled: !!projectId },
    );

  // Fetch all templates
  const { data: templatesData } = api.evals.allTemplates.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  useEffect(() => {
    if (isLoadingDefaultModel) return;

    // Find selected templates
    const selectedTemplates = (templatesData?.templates || []).filter(
      (template) => selectedTemplateIds.includes(template.id),
    );

    if (
      selectedTemplates.some(
        (template) => isCodeEvalTemplate(template) && !isCodeEvalEnabled,
      )
    ) {
      setIsSelectionValid(false);
      return;
    }

    // If there's no default model, check if any of the selected templates requires one
    if (!defaultModel) {
      // Check if any LLM-as-a-judge template requires a default model (has no provider/model specified)
      const requiresDefaultModel = selectedTemplates.some(
        (template) =>
          !isCodeEvalTemplate(template) &&
          (!template.provider || !template.model),
      );
      setIsSelectionValid(!requiresDefaultModel);
    } else {
      // If there is a default model, selection is valid
      setIsSelectionValid(true);
    }
  }, [
    defaultModel,
    isLoadingDefaultModel,
    isCodeEvalEnabled,
    selectedTemplateIds,
    templatesData?.templates,
  ]);

  /**
   * Check if a specific template is valid (has a default model if needed)
   */
  const isTemplateValid = (templateId: string): boolean => {
    if (!templatesData?.templates) return true;

    // Find the template
    const template = templatesData.templates.find((t) => t.id === templateId);
    if (!template) return true;
    if (isCodeEvalTemplate(template)) return isCodeEvalEnabled;

    // If we have a default model, all LLM-as-a-judge templates are valid
    if (defaultModel) return true;

    // If template has no provider or model, it requires a default model
    return Boolean(template.provider && template.model);
  };

  return {
    isSelectionValid,
    hasDefaultModel: !!defaultModel,
    defaultModel,
    isTemplateValid,
  };
}
