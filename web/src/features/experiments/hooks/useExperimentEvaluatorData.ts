import { useState, useCallback, useMemo } from "react";
import { type EvalTemplate } from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";
import { type PartialConfig } from "@/src/features/evals/types";
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

  const activeIds = activeEvaluators.map(
    (evaluator) => evaluator.evalTemplateId,
  );
  const inactiveIds = inActiveEvaluators.map(
    (evaluator) => evaluator.evalTemplateId,
  );

  return {
    activeEvaluators: activeIds,
    inActiveEvaluators: inactiveIds,
  };
};

interface UseExperimentEvaluatorDataProps {
  datasetId: string;
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
  createDefaultEvaluator,
  evaluatorsData,
  evalTemplatesData,
  refetchEvaluators,
}: UseExperimentEvaluatorDataProps) {
  // State for evaluator data management
  const [selectedEvaluatorData, setSelectedEvaluatorData] = useState<{
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

        if (!config || !config.evalTemplate) {
          console.log(
            "Config or evalTemplate not found for editing:",
            templateId,
          );
          return null;
        }

        const evaluator = {
          ...config,
          evalTemplate: {
            ...config.evalTemplate,
            outputSchema: config.evalTemplate
              .outputSchema as EvalTemplate["outputSchema"],
          },
        } as PartialConfig & { evalTemplate: EvalTemplate };

        return {
          templateId,
          evaluator,
        };
      }

      // For new evaluators
      const template = evalTemplatesData?.templates.find(
        (t) => t.id === templateId,
      );

      if (!template) {
        return null;
      }

      const evaluator = createDefaultEvaluator(template, datasetId);

      return {
        templateId,
        evaluator,
      };
    },
    [datasetId, evaluatorsData, evalTemplatesData, createDefaultEvaluator],
  );

  // Handle when a user clicks on the cog icon for an existing evaluator
  const handleConfigureEvaluator = useCallback(
    (templateId: string) => {
      const data = prepareEvaluatorData(templateId, true);
      if (data) {
        setSelectedEvaluatorData(data);
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
    setShowEvaluatorForm(false);
    setSelectedEvaluatorData(null);
    void refetchEvaluators();
  }, [refetchEvaluators]);

  // Handle when a user selects an evaluator from the template selector
  const handleSelectEvaluator = useCallback(
    (templateId: string) => {
      const preparedData = prepareEvaluatorData(templateId, false);

      if (preparedData) {
        setSelectedEvaluatorData(preparedData);
        setShowEvaluatorForm(true);
      }
    },
    [prepareEvaluatorData],
  );

  const { activeEvaluators, inActiveEvaluators } = useMemo(() => {
    return partitionEvaluators(evaluatorsData, datasetId);
  }, [evaluatorsData, datasetId]);

  return {
    // State
    selectedEvaluatorData,
    showEvaluatorForm,
    activeEvaluators,
    inActiveEvaluators,

    // Handlers
    handleConfigureEvaluator,
    handleCloseEvaluatorForm,
    handleEvaluatorSuccess,
    handleSelectEvaluator,

    // UI state management
    setShowEvaluatorForm,
  };
}
