import { useMemo, useState } from "react";
import { Coins, Info, Loader2 } from "lucide-react";

import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { api } from "@/src/utils/api";
import { compactNumberFormatter, costFormatter } from "@/src/utils/numbers";
import { type FilterState } from "@langfuse/shared";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function ActivationCostEstimate({
  projectId,
  evaluatorId,
  filter,
  sampling,
  testRunCostUsd,
  isCodeEvaluator,
  enabled,
}: {
  projectId: string;
  evaluatorId: string;
  filter: FilterState;
  sampling: number;
  testRunCostUsd: number | null;
  isCodeEvaluator: boolean;
  enabled: boolean;
}) {
  // Keep the 24-hour comparison stable while the modal is open so changing
  // scopes does not also move the time window underneath the estimate.
  const [since] = useState(() => new Date(Date.now() - ONE_DAY_MS));
  const countFilter = useMemo<FilterState>(
    () => [
      ...filter,
      { column: "startTime", type: "datetime", operator: ">=", value: since },
    ],
    [filter, since],
  );

  const matchCount = api.events.countAll.useQuery(
    {
      projectId,
      filter: countFilter,
      searchQuery: null,
      searchType: [],
      orderBy: null,
    },
    { enabled, refetchOnWindowFocus: false },
  );
  const historicalCost = api.evals.avgCostByEvaluatorIds.useQuery(
    { projectId, evaluatorIds: [evaluatorId] },
    {
      enabled: enabled && !isCodeEvaluator && testRunCostUsd === null,
      refetchOnWindowFocus: false,
    },
  );

  const matchingObservations = matchCount.data?.totalCount ?? null;
  const historicalCostEntry = historicalCost.data?.[evaluatorId];
  const costPerEvaluation = isCodeEvaluator
    ? 0
    : (testRunCostUsd ?? historicalCostEntry?.avgCost ?? null);
  const evaluatedObservations =
    matchingObservations === null ? null : matchingObservations * sampling;
  const dailyCostUsd =
    evaluatedObservations !== null && costPerEvaluation !== null
      ? evaluatedObservations * costPerEvaluation
      : null;
  const loading = matchCount.isLoading || historicalCost.isLoading;
  const costSource =
    testRunCostUsd !== null
      ? "the evaluator test run"
      : "average evaluator execution cost over the last 7 days";

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-1.5 font-bold">
          <Coins className="text-muted-foreground h-4 w-4" />
          Estimated daily cost
        </span>
        {loading ? (
          <Skeleton className="h-5 w-24" />
        ) : isCodeEvaluator ? (
          <span className="text-muted-foreground">No LLM API cost</span>
        ) : dailyCostUsd !== null ? (
          <span className="font-bold tabular-nums">
            ≈ {costFormatter(dailyCostUsd)} / day
          </span>
        ) : (
          <span className="text-muted-foreground">Unavailable</span>
        )}
      </div>

      {loading ? (
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Calculating from matches in the last 24 hours…
        </div>
      ) : matchingObservations === null ? (
        <p className="text-muted-foreground text-xs">
          Matching observation volume could not be loaded.
        </p>
      ) : isCodeEvaluator ? (
        <p className="text-muted-foreground text-xs">
          Code evaluators do not call an LLM model.
        </p>
      ) : costPerEvaluation === null ? (
        <p className="text-muted-foreground text-xs">
          Run a test or collect execution history to estimate the LLM API cost.
        </p>
      ) : (
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <span>
            {`${compactNumberFormatter(matchingObservations)} matching observation${matchingObservations === 1 ? "" : "s"} in the last 24h`}
            {sampling < 1 ? ` × ${Math.round(sampling * 100)}% sampling` : ""}
            {` × ${costFormatter(costPerEvaluation)} per evaluation`}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info
                className="h-3.5 w-3.5 shrink-0 cursor-help"
                aria-label="How this estimate is calculated"
              />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              The per-evaluation estimate comes from {costSource}. This is the
              expected cost on your linked LLM API key, not a Langfuse charge.
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
