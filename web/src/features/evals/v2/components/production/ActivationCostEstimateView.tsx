import { Coins, Info } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { compactNumberFormatter, costFormatter } from "@/src/utils/numbers";

/** Displays a completed daily evaluator cost estimate. */
export function ActivationCostEstimateView({
  matchingObservations,
  sampling,
  costPerEvaluation,
  costSource,
}: {
  matchingObservations: number;
  sampling: number;
  costPerEvaluation: number;
  costSource: string;
}) {
  const evaluatedObservations = matchingObservations * sampling;
  const dailyCostUsd = evaluatedObservations * costPerEvaluation;

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-1.5 font-bold">
          <Coins className="text-muted-foreground h-4 w-4" />
          Estimated daily cost
        </span>
        <span className="font-bold tabular-nums">
          ≈ {costFormatter(dailyCostUsd)} / day
        </span>
      </div>

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
    </div>
  );
}
