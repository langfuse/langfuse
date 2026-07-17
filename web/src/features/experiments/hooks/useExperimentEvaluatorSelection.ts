import { api, type RouterOutputs } from "@/src/utils/api";
import { useMemo } from "react";
import { isJobConfigExecutable } from "@langfuse/shared";
import { getEvalTemplateFamilyKey } from "@/src/features/evals/utils/eval-template-family";

/**
 * One entry per evaluator family that already has a job config for this
 * dataset. A non-executable config (deactivated or blocked) renders as
 * "paused"; an active config wins if a family has several configs.
 */
export const getExistingEvaluators = (
  jobConfigs: RouterOutputs["evals"]["jobConfigsByTarget"] | undefined,
  datasetId: string,
) => {
  const result: Record<
    string,
    {
      evalTemplateId: string;
      targetObject: string;
      templateName: string;
      isActive: boolean;
    }
  > = {};

  for (const jobConfig of jobConfigs ?? []) {
    const matchesDataset =
      jobConfig.filter?.length === 0 ||
      jobConfig.filter?.some(
        ({ type, value }) =>
          type === "stringOptions" && value.includes(datasetId),
      );
    if (!matchesDataset || !jobConfig.evalTemplate) continue;

    const familyKey = getEvalTemplateFamilyKey(jobConfig.evalTemplate);
    const isActive = isJobConfigExecutable({
      status: jobConfig.status,
      blockedAt: jobConfig.blockedAt,
    });
    if (result[familyKey]?.isActive && !isActive) continue;

    result[familyKey] = {
      evalTemplateId: jobConfig.evalTemplate.id,
      targetObject: jobConfig.targetObject,
      templateName: jobConfig.evalTemplate.name,
      isActive,
    };
  }

  return result;
};

/**
 * Owns the existing-evaluator state for the template selector: fetches the
 * dataset's job configs, derives per-family selection state, and toggles
 * existing configs. Selecting a family without a config is delegated to
 * `onSelectEvaluator` (opens the create form).
 */
export function useExperimentEvaluatorSelection({
  projectId,
  datasetId,
  onSelectEvaluator,
}: {
  projectId: string;
  datasetId: string;
  onSelectEvaluator?: (templateId: string) => void;
}) {
  const utils = api.useUtils();
  const jobConfigs = api.evals.jobConfigsByTarget.useQuery(
    { projectId, targetObject: ["dataset", "experiment"] },
    { enabled: !!datasetId },
  );

  const existingEvaluators = useMemo(
    () => getExistingEvaluators(jobConfigs.data, datasetId),
    [jobConfigs.data, datasetId],
  );

  const updateStatus =
    api.evals.updateAllDatasetEvalJobStatusByTemplateId.useMutation({
      // Refreshes every consumer of the query, incl. the parent forms.
      onSuccess: () => utils.evals.jobConfigsByTarget.invalidate(),
    });

  const isTemplateActive = (familyKey: string) =>
    Boolean(existingEvaluators[familyKey]?.isActive);

  const isTemplateInactive = (familyKey: string) => {
    const evaluator = existingEvaluators[familyKey];
    return Boolean(evaluator && !evaluator.isActive);
  };

  const handleRowClick = (templateId: string, familyKey: string) => {
    const existingEvaluator = existingEvaluators[familyKey];

    if (!existingEvaluator) {
      onSelectEvaluator?.(templateId);
      return;
    }

    updateStatus.mutate({
      projectId,
      evalTemplateId: existingEvaluator.evalTemplateId,
      datasetId,
      newStatus: existingEvaluator.isActive ? "INACTIVE" : "ACTIVE",
    });
  };

  return {
    // State
    existingEvaluators,

    // Action
    handleRowClick,

    // Status checks
    isTemplateActive,
    isTemplateInactive,

    // Loading
    isLoading: updateStatus.isPending,
  };
}
