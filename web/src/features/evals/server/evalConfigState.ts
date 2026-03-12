import { z } from "zod/v4";
import {
  type JobConfiguration,
  JobConfigState,
  deriveEvaluatorDisplayState,
  singleFilter,
} from "@langfuse/shared";
import { type JobExecutionState } from "@/src/features/evals/utils/job-execution-utils";

export const resetEvalConfigBlockFields = {
  blockedAt: null,
  blockReason: null,
  blockMessage: null,
} as const;

export const deriveEvaluatorDisplayStatus = (
  status: string,
  blockedAt: Date | null,
  timeScope: string[],
  jobExecutionsByState: JobExecutionState[],
): string => {
  const hasPendingJobs = jobExecutionsByState.some(
    (jobExecution) => jobExecution.status === "PENDING",
  );
  const totalJobCount = jobExecutionsByState.reduce(
    (count, jobExecution) => count + jobExecution._count,
    0,
  );

  return deriveEvaluatorDisplayState({
    status: status as JobConfigState,
    blockedAt,
    timeScope,
    hasPendingJobs,
    totalJobCount,
  });
};

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
