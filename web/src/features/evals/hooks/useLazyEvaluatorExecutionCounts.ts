import { useMemo } from "react";
import {
  deriveEvaluatorDisplayStateFromExecutionCounts,
  type EvaluatorExecutionCountsByEvaluatorId,
  type EvaluatorExecutionStatusCount,
} from "@langfuse/shared";
import { api, type RouterOutputs } from "@/src/utils/api";

type EvaluatorExecutionStateInput = Pick<
  NonNullable<RouterOutputs["evals"]["configById"]>,
  "blockedAt" | "displayStatus" | "status" | "timeScope"
>;

const emptyExecutionCountsByEvaluatorId: EvaluatorExecutionCountsByEvaluatorId =
  {};

export const getLazyEvaluatorDisplayStatus = ({
  evaluator,
  jobExecutionCounts,
}: {
  evaluator?: EvaluatorExecutionStateInput | null;
  jobExecutionCounts?: EvaluatorExecutionStatusCount[];
}) => {
  if (!evaluator) {
    return undefined;
  }

  if (!jobExecutionCounts) {
    return evaluator.displayStatus;
  }

  return deriveEvaluatorDisplayStateFromExecutionCounts({
    status: evaluator.status,
    blockedAt: evaluator.blockedAt,
    timeScope: Array.isArray(evaluator.timeScope) ? evaluator.timeScope : [],
    executionCounts: jobExecutionCounts,
  });
};

export const useLazyEvaluatorExecutionCountsByIds = ({
  projectId,
  evaluatorIds,
  enabled = true,
}: {
  projectId: string;
  evaluatorIds: string[];
  enabled?: boolean;
}) => {
  const jobExecutionCountsQuery =
    api.evals.jobExecutionCountsByEvaluatorIds.useQuery(
      {
        projectId,
        evaluatorIds,
      },
      {
        enabled: Boolean(projectId && enabled && evaluatorIds.length > 0),
      },
    );

  return {
    isLoading: jobExecutionCountsQuery.isLoading,
    jobExecutionCountsByEvaluatorId:
      jobExecutionCountsQuery.data ?? emptyExecutionCountsByEvaluatorId,
  };
};

export const useLazyEvaluatorExecutionCounts = ({
  projectId,
  evaluatorId,
  evaluator,
}: {
  projectId: string;
  evaluatorId?: string | null;
  evaluator?: EvaluatorExecutionStateInput | null;
}) => {
  const lazyExecutionCountsByIds = useLazyEvaluatorExecutionCountsByIds({
    projectId,
    evaluatorIds: evaluatorId ? [evaluatorId] : [],
    enabled: Boolean(evaluatorId && evaluator),
  });

  const jobExecutionCounts = evaluatorId
    ? lazyExecutionCountsByIds.jobExecutionCountsByEvaluatorId[evaluatorId]
    : undefined;

  const displayStatus = useMemo(() => {
    return getLazyEvaluatorDisplayStatus({
      evaluator,
      jobExecutionCounts,
    });
  }, [evaluator, jobExecutionCounts]);

  return {
    displayStatus,
    isLoading: lazyExecutionCountsByIds.isLoading,
    jobExecutionCounts,
  };
};
