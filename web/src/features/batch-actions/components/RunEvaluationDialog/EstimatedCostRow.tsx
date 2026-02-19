import { InfoIcon } from "lucide-react";
import { api } from "@/src/utils/api";
import { usdFormatter } from "@/src/utils/numbers";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

type EstimatedCostRowProps = {
  projectId: string;
  evaluators: Array<{ id: string; name: string }>;
  observationCount: number;
};

function formatCostEstimate(cost: number): string {
  if (cost > 0 && cost < 0.005) return "< $0.01";
  return `~${usdFormatter(cost, 2, 2)}`;
}

export function EstimatedCostRow(props: EstimatedCostRowProps) {
  const { projectId, evaluators, observationCount } = props;

  const evaluatorIds = evaluators.map((e) => e.id);

  const avgCostQuery = api.evals.avgCostByEvaluatorIds.useQuery(
    { projectId, evaluatorIds },
    { enabled: evaluators.length > 0 },
  );

  if (avgCostQuery.isLoading) {
    return (
      <div className="flex gap-2">
        <span className="shrink-0 text-muted-foreground">
          Est. LLM API Key Cost:
        </span>
        <Skeleton className="h-4 w-16" />
      </div>
    );
  }

  const data = avgCostQuery.data;
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="flex gap-2">
        <span className="shrink-0 text-muted-foreground">
          Est. LLM API Key Cost:
        </span>
        <span className="text-muted-foreground">No data</span>
      </div>
    );
  }

  const evaluatorsWithData = evaluatorIds.filter((id) => id in data);
  const evaluatorsWithoutData = evaluatorIds.filter((id) => !(id in data));
  const isPartial = evaluatorsWithoutData.length > 0;

  const totalEstimate = evaluatorsWithData.reduce(
    (sum, id) => sum + data[id].avgCost * observationCount,
    0,
  );

  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-muted-foreground">
        Est. LLM API Key Cost:
      </span>
      <span className="flex items-center gap-1 font-medium">
        {formatCostEstimate(totalEstimate)}
        {isPartial ? "*" : ""}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon className="h-3 w-3 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs space-y-2 p-3">
              <p className="text-xs">
                Expected cost on your linked API key (not Langfuse). Estimated
                from average evaluator execution cost over the last 7 days.
              </p>
              <div className="space-y-1">
                {evaluators.map(({ id, name }) => {
                  const entry = data[id];
                  return (
                    <div
                      key={id}
                      className="flex justify-between gap-4 text-xs"
                    >
                      <span className="truncate">{name}</span>
                      <span className="shrink-0 tabular-nums">
                        {entry
                          ? formatCostEstimate(entry.avgCost * observationCount)
                          : "No data"}
                      </span>
                    </div>
                  );
                })}
              </div>
              {isPartial ? (
                <p className="text-xs text-muted-foreground">
                  *Partial estimate. Some evaluators have no execution history.
                </p>
              ) : null}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </span>
    </div>
  );
}
