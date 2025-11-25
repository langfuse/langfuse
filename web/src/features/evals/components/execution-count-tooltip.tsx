import { type EvalFormType } from "@/src/features/evals/utils/evaluator-form-utils";
import { api } from "@/src/utils/api";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { useEvalTargetCount } from "@/src/features/evals/hooks/useEvalTargetCount";

type ExecutionCountTooltipProps = {
  projectId: string;
  item: string;
  filter: EvalFormType["filter"];
};

export const ExecutionCountTooltip = ({
  projectId,
  item,
  filter,
}: ExecutionCountTooltipProps) => {
  const globalConfig = api.evals.globalJobConfigs.useQuery({
    projectId,
  });

  const { isLoading, totalCount, isTraceTarget } = useEvalTargetCount({
    projectId,
    item,
    filter,
    enabled: true,
  });

  return (
    <>
      <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        (
        {isLoading ? (
          <span className="inline-block font-mono">...</span>
        ) : (
          compactNumberFormatter(
            !globalConfig.data || (totalCount && totalCount < globalConfig.data)
              ? totalCount
              : globalConfig.data,
          )
        )}
        {isTraceTarget ? " traces" : " dataset run items"})
      </span>
    </>
  );
};
