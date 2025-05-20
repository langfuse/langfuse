import { api } from "@/src/utils/api";
import { useState, useCallback, useMemo } from "react";

type TemplateSelectionHookProps = {
  projectId: string;
  datasetId: string;
  initialActiveTemplateIds?: string[];
  initialInactiveTemplateIds?: string[];
  multiSelect?: boolean;
  onTemplateSelect?: (templateId: string) => void;
  onPendingTemplateSelect?: (templateId: string) => void;
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
  multiSelect = false,
  onTemplateSelect,
  onPendingTemplateSelect,
}: TemplateSelectionHookProps) {
  // Track pending template (awaiting configuration)
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);

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

  // Mark a template as pending configuration
  const markTemplateAsPending = useCallback(
    (templateId: string) => {
      setPendingTemplate(templateId);
      // Notify parent that a template was marked as pending
      if (onPendingTemplateSelect) {
        onPendingTemplateSelect(templateId);
      }
    },
    [onPendingTemplateSelect],
  );

  // Clear the pending template selection
  const clearPendingTemplate = useCallback(() => {
    setPendingTemplate(null);
  }, []);

  // Confirm the pending template selection and add it to confirmed selections
  const confirmPendingTemplate = useCallback(() => {
    if (pendingTemplate) {
      // Add to confirmed selections
      const newSelection = multiSelect
        ? [
            ...activeTemplates.filter((id) => id !== pendingTemplate),
            pendingTemplate,
          ]
        : [pendingTemplate];

      setActiveTemplates(newSelection);

      // Notify parent of the confirmed selection
      if (onTemplateSelect) {
        onTemplateSelect(pendingTemplate);
      }

      // Clear pending state
      setPendingTemplate(null);
    }
  }, [pendingTemplate, multiSelect, activeTemplates, onTemplateSelect]);

  // Remove a template from selections
  const removeTemplate = useCallback((templateId: string) => {
    setActiveTemplates((prev) => prev.filter((id) => id !== templateId));
    // need to actual perform the update in backend
    setInactiveTemplates((prev) => [...prev, templateId]);
  }, []);

  // Selection status methods
  const isTemplateActive = useCallback(
    (templateId: string) => activeTemplates.includes(templateId),
    [activeTemplates],
  );

  const isTemplatePending = useCallback(
    (templateId: string) => pendingTemplate === templateId,
    [pendingTemplate],
  );

  const isTemplateInactive = useCallback(
    (templateId: string) => inactiveTemplates.includes(templateId),
    [inactiveTemplates],
  );

  // Helper methods for imperative handle
  const imperativeMethods = useMemo(
    () => ({
      getPendingTemplate: () => pendingTemplate,
      confirmPendingSelection: confirmPendingTemplate,
      clearPendingSelection: clearPendingTemplate,
    }),
    [pendingTemplate, confirmPendingTemplate, clearPendingTemplate],
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
    } else if (isTemplatePending(templateId)) {
      if (onPendingTemplateSelect) {
        onPendingTemplateSelect(templateId);
      }
    } else {
      markTemplateAsPending(templateId);
    }
  };

  return {
    // State
    pendingTemplate,
    activeTemplates,

    // Action
    handleRowClick,

    // Status checks
    isTemplateActive,
    isTemplatePending,
    isTemplateInactive,

    // Loading
    isLoading: updateStatus.isLoading,

    // For useImperativeHandle
    imperativeMethods,
  };
}
