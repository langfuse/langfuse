import { z } from "zod";
import {
  type JobConfiguration,
  JobConfigState,
  singleFilter,
} from "@langfuse/shared";

export const resetEvalConfigBlockFields = {
  blockedAt: null,
  blockReason: null,
  blockMessage: null,
} as const;

export const shouldValidateBeforeActivation = ({
  currentStatus,
  blockedAt,
  nextStatus,
}: {
  currentStatus: JobConfigState;
  blockedAt: Date | null;
  nextStatus?: JobConfigState;
}) =>
  nextStatus === JobConfigState.ACTIVE &&
  (currentStatus !== JobConfigState.ACTIVE || blockedAt !== null);

const evaluatorTargetsDataset = ({
  filter,
  datasetId,
}: Pick<JobConfiguration, "filter"> & {
  datasetId: string;
}) => {
  const parsedFilter = z.array(singleFilter).safeParse(filter);

  if (!parsedFilter.success) {
    return false;
  }

  return (
    parsedFilter.data.length === 0 ||
    parsedFilter.data.some(
      ({ type, value }) =>
        type === "stringOptions" && value.includes(datasetId),
    )
  );
};

export const selectDatasetEvaluatorsForStatusChange = ({
  evaluators,
  datasetId,
  newStatus,
}: {
  evaluators: Array<
    Pick<JobConfiguration, "id" | "status" | "blockedAt" | "filter">
  >;
  datasetId: string;
  newStatus: JobConfigState;
}) =>
  evaluators.filter((evaluator) => {
    if (
      !evaluatorTargetsDataset({
        filter: evaluator.filter,
        datasetId,
      })
    ) {
      return false;
    }

    return newStatus === JobConfigState.ACTIVE
      ? evaluator.status === JobConfigState.INACTIVE ||
          evaluator.blockedAt !== null
      : evaluator.status === JobConfigState.ACTIVE;
  });
