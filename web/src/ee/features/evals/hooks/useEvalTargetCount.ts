import { api } from "@/src/utils/api";
import {
  type EvalFormType,
  isTraceTarget,
} from "@/src/ee/features/evals/utils/evaluator-form-utils";

interface UseEvalTargetCountProps {
  projectId: string;
  item: string;
  filter: EvalFormType["filter"];
  enabled?: boolean;
}

interface UseEvalTargetCountResult {
  isLoading: boolean;
  isTraceTarget: boolean;
  totalCount?: number;
}

export function useEvalTargetCount({
  projectId,
  item,
  filter,
  enabled = true,
}: UseEvalTargetCountProps): UseEvalTargetCountResult {
  const isTrace = isTraceTarget(item);

  const baseAllCountFilter = {
    projectId,
    filter,
  };

  const tracesAllCountFilter = {
    ...baseAllCountFilter,
    searchQuery: null,
    orderBy: null,
  };

  const tracesCountQuery = api.traces.countAll.useQuery(tracesAllCountFilter, {
    enabled: enabled && isTrace,
  });

  const datasetCountQuery = api.datasets.countAllDatasetItems.useQuery(
    baseAllCountFilter,
    {
      enabled: enabled && !isTrace,
    },
  );

  return {
    isLoading: isTrace
      ? tracesCountQuery.isLoading
      : datasetCountQuery.isLoading,
    totalCount: isTrace
      ? tracesCountQuery.data?.totalCount
      : datasetCountQuery.data?.totalCount,
    isTraceTarget: isTrace,
  };
}
