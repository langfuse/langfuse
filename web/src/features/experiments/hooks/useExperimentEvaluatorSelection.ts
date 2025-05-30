import { api } from "@/src/utils/api";
import { useState, useCallback, useEffect } from "react";

type TemplateSelectionHookProps = {
  projectId: string;
  datasetId: string;
  initialActiveTemplateIds?: string[];
  initialInactiveTemplateIds?: string[];
  onSelectEvaluator?: (templateId: string) => void;
};

/**
 * Hook to manage the entire template selection state and lifecycle
 * Handles both pending templates (awaiting configuration) and confirmed selections
 */
export function useExperimentEvaluatorSelection({
  projectId,
  datasetId,
  initialActiveTemplateIds = [],
  initialInactiveTemplateIds = [],
  onSelectEvaluator,
}: TemplateSelectionHookProps) {
  // Track confirmed selections
  const [activeTemplates, setActiveTemplates] = useState<string[]>(
    initialActiveTemplateIds,
  );

  const [inactiveTemplates, setInactiveTemplates] = useState<string[]>(
    initialInactiveTemplateIds,
  );
  // Keep the active templates in sync with the initialActiveTemplateIds prop
  useEffect(() => {
    setActiveTemplates(initialActiveTemplateIds);
  }, [initialActiveTemplateIds]);

  // Keep the inactive templates in sync with the initialInactiveTemplateIds prop
  useEffect(() => {
    setInactiveTemplates(initialInactiveTemplateIds);
  }, [initialInactiveTemplateIds]);

  const updateStatus =
    api.evals.updateAllDatasetEvalJobStatusByTemplateId.useMutation({
      onSuccess: (_, variables) => {
        if (variables.newStatus === "INACTIVE") {
          setActiveTemplates((prev) =>
            prev.filter((id) => id !== variables.evalTemplateId),
          );
          setInactiveTemplates((prev) => [...prev, variables.evalTemplateId]);
        } else {
          setActiveTemplates((prev) => [...prev, variables.evalTemplateId]);
          setInactiveTemplates((prev) =>
            prev.filter((id) => id !== variables.evalTemplateId),
          );
        }
      },
    });

  const setTemplateSelected = useCallback(
    (templateId: string) => {
      templateId;
      // Notify parent that a template was marked as pending
      if (onSelectEvaluator) {
        onSelectEvaluator(templateId);
      }
    },
    [onSelectEvaluator],
  );

  // Selection status methods
  const isTemplateActive = useCallback(
    (templateId: string) => {
      return activeTemplates.includes(templateId);
    },
    [activeTemplates],
  );

  const isTemplateInactive = useCallback(
    (templateId: string) => inactiveTemplates.includes(templateId),
    [inactiveTemplates],
  );

  const handleRowClick = (templateId: string) => {
    if (isTemplateActive(templateId)) {
      updateStatus.mutate({
        projectId,
        evalTemplateId: templateId,
        datasetId,
        newStatus: "INACTIVE",
      });
    } else if (isTemplateInactive(templateId)) {
      updateStatus.mutate({
        projectId: projectId,
        evalTemplateId: templateId,
        datasetId,
        newStatus: "ACTIVE",
      });
    } else {
      setTemplateSelected(templateId);
    }
  };

  return {
    // State
    activeTemplates,

    // Action
    handleRowClick,

    // Status checks
    isTemplateActive,
    isTemplateInactive,

    // Loading
    isLoading: updateStatus.isLoading,
  };
}
