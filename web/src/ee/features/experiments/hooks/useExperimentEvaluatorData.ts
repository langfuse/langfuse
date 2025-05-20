import { useState, useCallback, RefObject, useMemo } from "react";
import { type EvalTemplate } from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";
import { type PartialConfig } from "@/src/ee/features/evals/types";
import { type TemplateSelectorRef } from "@/src/ee/features/evals/components/template-selector";
import { partition } from "lodash";

const partitionEvaluators = (
  evaluators: RouterOutputs["evals"]["jobConfigsByTarget"] | undefined,
  datasetId: string,
): { activeEvaluators: string[]; inActiveEvaluators: string[] } => {
  const filteredEvaluators =
    evaluators?.filter(({ filter }) => {
      if (filter?.length === 0) return true;
      return filter?.some(
        ({ type, value }) =>
          type === "stringOptions" && value.includes(datasetId),
      );
    }) || [];

  const [activeEvaluators, inActiveEvaluators] = partition(
    filteredEvaluators,
    (evaluator) => evaluator.status === "ACTIVE",
  );

  return {
    activeEvaluators: activeEvaluators.map(
      (evaluator) => evaluator.evalTemplateId,
    ),
    inActiveEvaluators: inActiveEvaluators.map(
      (evaluator) => evaluator.evalTemplateId,
    ),
  };
};

interface UseExperimentEvaluatorDataProps {
  datasetId: string;
  templateSelectorRef: RefObject<TemplateSelectorRef>;
  createDefaultEvaluator: (
    template: EvalTemplate,
    datasetId: string,
  ) => PartialConfig & { evalTemplate: EvalTemplate };
  evaluatorsData?: RouterOutputs["evals"]["jobConfigsByTarget"];
  evalTemplatesData?: {
    templates: EvalTemplate[];
  };
  refetchEvaluators: () => Promise<unknown>;
}

export function useExperimentEvaluatorData({
  datasetId,
  templateSelectorRef,
  createDefaultEvaluator,
  evaluatorsData,
  evalTemplatesData,
  refetchEvaluators,
}: UseExperimentEvaluatorDataProps) {
  // State for evaluator data management
  const [pendingEvaluatorData, setPendingEvaluatorData] = useState<{
    templateId: string;
    evaluator: PartialConfig & { evalTemplate: EvalTemplate };
  } | null>(null);
  const [showEvaluatorForm, setShowEvaluatorForm] = useState(false);

  // Prepare evaluator data when a template is pending/selected
  const prepareEvaluatorData = useCallback(
    (templateId: string, isEditing: boolean) => {
      // For editing existing evaluators
      if (isEditing) {
        const config = evaluatorsData?.find(
          (config) => config.evalTemplateId === templateId,
        );

        if (!config || !config.evalTemplate) return null;

        return {
          templateId,
          evaluator: {
            ...config,
            evalTemplate: config.evalTemplate,
          } as PartialConfig & { evalTemplate: EvalTemplate },
        };
      }

      // For new evaluators
      const template = evalTemplatesData?.templates.find(
        (t) => t.id === templateId,
      );

      if (!template) return null;

      return {
        templateId,
        evaluator: createDefaultEvaluator(template, datasetId),
      };
    },
    [datasetId, evaluatorsData, evalTemplatesData, createDefaultEvaluator],
  );

  // Handle when a user explicitly selects a pending template
  const handlePendingTemplateSelect = useCallback(
    (templateId: string) => {
      const data = prepareEvaluatorData(templateId, false);
      if (data) {
        setPendingEvaluatorData(data);
        setShowEvaluatorForm(true);
      }
    },
    [prepareEvaluatorData],
  );

  // Handle when a user clicks on the cog icon for an existing evaluator
  const handleConfigureEvaluator = useCallback(
    (templateId: string) => {
      const data = prepareEvaluatorData(templateId, true);
      if (data) {
        setPendingEvaluatorData(data);
        setShowEvaluatorForm(true);
      }
    },
    [prepareEvaluatorData],
  );

  // Handle form closure
  const handleCloseEvaluatorForm = useCallback(() => {
    setShowEvaluatorForm(false);
    // Keep pendingEvaluatorData so the pending state remains
  }, []);

  // Handle successful form submission
  const handleEvaluatorSuccess = useCallback(() => {
    // Confirm the pending template selection
    templateSelectorRef.current?.confirmPendingSelection();
    setShowEvaluatorForm(false);
    setPendingEvaluatorData(null);
    void refetchEvaluators();
  }, [refetchEvaluators, templateSelectorRef]);

  const { activeEvaluators, inActiveEvaluators } = useMemo(() => {
    return partitionEvaluators(evaluatorsData, datasetId);
  }, [evaluatorsData, datasetId]);

  return {
    // State
    pendingEvaluatorData,
    showEvaluatorForm,
    activeEvaluators,
    inActiveEvaluators,

    // Handlers
    handlePendingTemplateSelect,
    handleConfigureEvaluator,
    handleCloseEvaluatorForm,
    handleEvaluatorSuccess,

    // UI state management
    setShowEvaluatorForm,

    // Alias for consistency with component code
    handleTemplateSelect: handleConfigureEvaluator,
  };
}
