import { InfoIcon, Loader } from "lucide-react";
import {
  type EvalFormType,
  isTraceTarget,
} from "@/src/ee/features/evals/utils/evaluator-form-utils";
import { api } from "@/src/utils/api";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { compactNumberFormatter } from "@/src/utils/numbers";

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

  const baseAllCountFilter = {
    projectId,
    filter,
  };

  const tracesAllCountFilter = {
    ...baseAllCountFilter,
    searchQuery: null,
    orderBy: null,
  };

  // utilize `isOpen` to only query if user hovers over tooltip to avoid unnecessary queries
  const totalCountQuery = api.traces.countAll.useQuery(tracesAllCountFilter, {
    enabled: isOpen && isTraceTarget(item),
  });

  const datasetCountQuery = api.datasets.countAllDatasetItems.useQuery(
    baseAllCountFilter,
    {
      enabled: isOpen && !isTraceTarget(item),
    },
  );

  const loading = isTraceTarget(item)
    ? totalCountQuery.isLoading
    : datasetCountQuery.isLoading;

  const totalCount = isTraceTarget(item)
    ? totalCountQuery.data?.totalCount
    : datasetCountQuery.data?.totalCount;

  return (
    <Tooltip open={isOpen} onOpenChange={setIsOpen}>
      <TooltipTrigger>
        <InfoIcon className="h-4 w-4" />
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-sm">
          We execute the evaluation on{" "}
          {loading ? (
            <Loader className="inline-block h-4 w-4 animate-spin" />
          ) : (
            compactNumberFormatter(
              !globalConfig.data ||
                (totalCount && totalCount < globalConfig.data)
                ? totalCount
                : globalConfig.data,
            )
          )}{" "}
          {isTraceTarget(item) ? "traces" : "dataset run items"}.
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
