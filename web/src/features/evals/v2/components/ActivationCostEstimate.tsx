import { useMemo, useState } from "react";
import { Coins, Info } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  COMPOSER_SURFACE_CLASSES,
  COMPOSER_TEXT_CLASSES,
} from "@/src/features/search-bar/components/composer-chrome";
import { ComposerTokens } from "@/src/features/search-bar/components/ComposerTokens";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { api } from "@/src/utils/api";
import { compactNumberFormatter, costFormatter } from "@/src/utils/numbers";
import { type FilterState } from "@langfuse/shared";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ESTIMATE_WINDOW_DAYS = 7;

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
  evaluatorId?: string;
  filter: FilterState;
  sampling: number;
  testRunCostUsd: number | null;
  isCodeEvaluator: boolean;
  enabled: boolean;
}) {
  // Keep the comparison stable while the modal is open so changing
  // rules does not also move the time window underneath the estimate.
  const [since] = useState(
    () => new Date(Date.now() - ESTIMATE_WINDOW_DAYS * ONE_DAY_MS),
  );
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
    { projectId, evaluatorIds: evaluatorId ? [evaluatorId] : [] },
    {
      enabled:
        enabled &&
        !isCodeEvaluator &&
        testRunCostUsd === null &&
        Boolean(evaluatorId),
      refetchOnWindowFocus: false,
    },
  );

  const matchingObservations = matchCount.data?.totalCount ?? null;
  const historicalCostEntry = evaluatorId
    ? historicalCost.data?.[evaluatorId]
    : undefined;
  const costPerEvaluation =
    testRunCostUsd ?? historicalCostEntry?.avgCost ?? null;
  const evaluatedObservations =
    matchingObservations === null ? null : matchingObservations * sampling;
  const estimatedCostUsd =
    evaluatedObservations !== null && costPerEvaluation !== null
      ? evaluatedObservations * costPerEvaluation
      : null;
  const loading = matchCount.isLoading || historicalCost.isLoading;
  const costSource =
    testRunCostUsd !== null
      ? "the evaluator test run"
      : "average evaluator execution cost over the last 7 days";
  const filterQuery = filterStateToQueryText(filter).text;
  const matchCountLabel =
    matchingObservations === null
      ? "Calculating matching observations…"
      : `${compactNumberFormatter(matchingObservations)} matching observation${matchingObservations === 1 ? "" : "s"} in the last 7 days`;

  return (
    <div className="rounded-md border">
      <Accordion type="single" collapsible>
        <AccordionItem value="usage-and-cost" className="border-b-0">
          <AccordionTrigger className="px-3 py-3 text-left hover:no-underline">
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-3">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  <Coins className="text-muted-foreground h-4 w-4" />
                  Estimated usage &amp; cost
                </span>
                <span className="text-muted-foreground text-xs font-normal">
                  {matchCountLabel}
                </span>
              </span>
              {!loading && estimatedCostUsd !== null ? (
                <span className="flex shrink-0 items-center gap-1">
                  <span className="text-sm font-bold tabular-nums">
                    ≈ {costFormatter(estimatedCostUsd)} / 7 days
                  </span>
                  {matchingObservations !== null &&
                  costPerEvaluation !== null ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info
                          className="text-muted-foreground h-3.5 w-3.5 shrink-0 cursor-help"
                          aria-label="How this estimate is calculated"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {compactNumberFormatter(matchingObservations)} matching
                        observation
                        {matchingObservations === 1 ? "" : "s"}
                        {sampling < 1
                          ? ` × ${Math.round(sampling * 100)}% sampling`
                          : ""}{" "}
                        × {costFormatter(costPerEvaluation)} per evaluation.
                        This estimate comes from {costSource} and reflects the
                        expected cost on your linked LLM API key, not a Langfuse
                        charge.
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </span>
              ) : null}
            </div>
          </AccordionTrigger>

          <AccordionContent className="flex flex-col gap-3 px-3 pt-1 pb-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold">Filter</span>
              <div className={COMPOSER_SURFACE_CLASSES}>
                <div className={COMPOSER_TEXT_CLASSES}>
                  {filterQuery ? (
                    <ComposerTokens
                      draft={filterQuery}
                      showDiagnostics={false}
                    />
                  ) : (
                    <span className="text-muted-foreground">
                      No filters — all observations
                    </span>
                  )}
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
