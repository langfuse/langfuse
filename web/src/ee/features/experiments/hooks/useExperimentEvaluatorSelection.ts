import { api } from "@/src/utils/api";
import { useState, useCallback } from "react";

type TemplateSelectionHookProps = {
  projectId: string;
  datasetId: string;
  initialActiveTemplateIds?: string[];
  initialInactiveTemplateIds?: string[];
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
}: TemplateSelectionHookProps) {
  // Track confirmed selections
  const [activeTemplates, setActiveTemplates] = useState<string[]>(
    initialActiveTemplateIds,
  );

  const [inactiveTemplates, setInactiveTemplates] = useState<string[]>(
    initialInactiveTemplateIds,
  );

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

  // Selection status methods
  const isTemplateActive = useCallback(
    (templateId: string) => activeTemplates.includes(templateId),
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
