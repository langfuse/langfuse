import { InfoIcon, Loader } from "lucide-react";
import { type EvalFormType } from "@/src/ee/features/evals/utils/evaluator-form-utils";
import { api } from "@/src/utils/api";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { useEvalTargetCount } from "@/src/ee/features/evals/hooks/useEvalTargetCount";

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
  const [isOpen, setIsOpen] = useState(false);

  const globalConfig = api.evals.globalJobConfigs.useQuery({
    projectId,
  });

  const { isLoading, totalCount, isTraceTarget } = useEvalTargetCount({
    projectId,
    item,
    filter,
    enabled: isOpen, // utilize `isOpen` to only query if user hovers over tooltip to avoid unnecessary queries
  });

  return (
    <Tooltip open={isOpen} onOpenChange={setIsOpen}>
      <TooltipTrigger>
        <InfoIcon className="h-4 w-4" />
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-sm">
          We execute the evaluation on{" "}
          {isLoading ? (
            <Loader className="inline-block h-4 w-4 animate-spin" />
          ) : (
            compactNumberFormatter(
              !globalConfig.data ||
                (totalCount && totalCount < globalConfig.data)
                ? totalCount
                : globalConfig.data,
            )
          )}{" "}
          {isTraceTarget ? "traces" : "dataset run items"}.
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
