import { useState, useEffect } from "react";
import { api } from "@/src/utils/api";

export function useTemplatesValidation({
  projectId,
  selectedTemplateIds = [],
}: {
  projectId: string;
  selectedTemplateIds?: string[];
}) {
  const [isSelectionValid, setIsSelectionValid] = useState(true);

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

    // If there's no default model, check if any of the selected templates requires one
    if (!defaultModel) {
      // Find selected templates
      const selectedTemplates = (templatesData?.templates || []).filter(
        (template) => selectedTemplateIds.includes(template.id),
      );

      // Check if any template requires a default model (has no provider/model specified)
      const requiresDefaultModel = selectedTemplates.some(
        (template) => !template.provider || !template.model,
      );

      setIsSelectionValid(!requiresDefaultModel);
    } else {
      // If there is a default model, selection is valid
      setIsSelectionValid(true);
    }
  }, [
    defaultModel,
    isLoadingDefaultModel,
    selectedTemplateIds,
    templatesData?.templates,
  ]);

  /**
   * Check if a specific template is valid (has a default model if needed)
   */
  const isTemplateValid = (templateId: string): boolean => {
    if (!templatesData?.templates) return true;

    // If we have a default model, all templates are valid
    if (defaultModel) return true;

    // Find the template
    const template = templatesData.templates.find((t) => t.id === templateId);
    if (!template) return true;

    // If template has no provider or model, it requires a default model
    return !(template.provider === undefined || template.model === undefined);
  };

  return {
    isSelectionValid,
    hasDefaultModel: !!defaultModel,
    defaultModel,
    isTemplateValid,
  };
}
