import { type EvalFormType } from "@/src/features/evals/utils/evaluator-form-utils";
import { api } from "@/src/utils/api";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { useEvalTargetCount } from "@/src/features/evals/hooks/useEvalTargetCount";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("evaluationAnalytics.evaluations");
  const globalConfig = api.evals.globalJobConfigs.useQuery({
    projectId,
  });

  const { isLoading, totalCount, isTraceTarget } = useEvalTargetCount({
    projectId,
    item,
    filter,
    enabled: true,
  });
  const displayCount = isLoading
    ? ""
    : compactNumberFormatter(
        !globalConfig.data || (totalCount && totalCount < globalConfig.data)
          ? totalCount
          : globalConfig.data,
      );

  return (
    <>
      <span className="text-sm leading-none font-bold peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        (
        {isLoading ? (
          <span className="inline-block font-mono">...</span>
        ) : (
          t(
            isTraceTarget
              ? "executionCount.traces"
              : "executionCount.datasetRunItems",
            { count: displayCount },
          )
        )}
        )
      </span>
    </>
  );
};
