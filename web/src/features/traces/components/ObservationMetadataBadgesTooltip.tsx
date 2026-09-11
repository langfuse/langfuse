/* eslint-disable @repo/no-null-render */
/**
 * Cost/usage metadata text for ObservationDetailView and the trace summary
 * strip. Quiet grammar: muted mono text, no border/box — pills are reserved
 * for tags.
 *
 * Cost and usage share ONE element (`CostUsageBadge`): cost first, tokens
 * face whenever it exists (`$0.016079` — the leading `$` is the glyph, no
 * icon), tokens are the fallback face for unpriced/unlinked models
 * (coin icon + `10,200`). The input→output split never renders
 * inline — only on hover, in a breakdown tooltip. When there is a cost,
 * hover shows a small Input/Output/Total table (tokens, cost, % of total
 * cost); when there is no cost at all, hover reuses the existing usage-only
 * `BreakdownTooltip`.
 */

import { useState } from "react";
import { Coins, InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { BreakdownTooltip } from "@/src/features/traces/components/BreakdownTooltip";
import { usdFormatter, numberFormatter } from "@/src/utils/numbers";

// Matches the metrics-tier scale in ObservationMetadataBadgesSimple.tsx —
// uniform muted mono text, no borders/boxes.
const METRIC_TEXT_CLASS =
  "text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs whitespace-nowrap";

// Values that own a hover breakdown get a faint underline at rest so
// they read as "more here" next to plain metrics (latency) that have nothing.
const BREAKDOWN_AFFORDANCE_CLASS = `${METRIC_TEXT_CLASS} decoration-muted-foreground/30 underline underline-offset-2`;

/**
 * Whether a usage object is worth rendering at all — `CostUsageBadge`'s own
 * null-render check.
 */
function hasRenderableUsage({
  inputUsage,
  outputUsage,
  totalUsage,
  usageDetails,
}: {
  inputUsage: number;
  outputUsage: number;
  totalUsage: number;
  usageDetails: Record<string, number>;
}): boolean {
  return (
    totalUsage > 0 ||
    inputUsage > 0 ||
    outputUsage > 0 ||
    Object.values(usageDetails).some((v) => v > 0)
  );
}

/**
 * The single number the badge shows inline when there is no cost.
 * `totalUsage` can be 0 while the in→out split still carries real numbers
 * (e.g. usage recorded only per-direction) — fall back to their sum rather
 * than showing a misleadingly empty total for a generation that does have
 * usage.
 */
function getCompactUsageTotal({
  inputUsage,
  outputUsage,
  totalUsage,
}: {
  inputUsage: number;
  outputUsage: number;
  totalUsage: number;
}): number {
  return totalUsage > 0 ? totalUsage : inputUsage + outputUsage;
}

/** Sum of the values whose key matches `filterFn` — mirrors how cost/usage
    detail maps key their input/output components (e.g. "input",
    "cache_read_input_tokens"). */
function sumMatchingKeys(
  details: Record<string, number> | null | undefined,
  filterFn: (key: string) => boolean,
): number {
  if (!details) return 0;

  return Object.entries(details).reduce(
    (sum, [key, value]) => (filterFn(key) ? sum + (value ?? 0) : sum),
    0,
  );
}

const tableCellClass = "py-1.5 pl-5 text-right tabular-nums";

function CostUsageTable({
  inputUsage,
  outputUsage,
  totalUsage,
  totalCost,
  costDetails,
}: {
  inputUsage: number;
  outputUsage: number;
  totalUsage: number;
  totalCost: number;
  costDetails: Record<string, number>;
}) {
  const inputCost = sumMatchingKeys(costDetails, (key) =>
    key.includes("input"),
  );
  const outputCost = sumMatchingKeys(costDetails, (key) =>
    key.includes("output"),
  );
  const totalTokens = getCompactUsageTotal({
    inputUsage,
    outputUsage,
    totalUsage,
  });

  const rows = [
    { label: "Input", tokens: inputUsage, cost: inputCost },
    { label: "Output", tokens: outputUsage, cost: outputCost },
    // A side with neither tokens nor cost isn't a real row (e.g. an
    // embedding-only call has no output) — omit it rather than show zeros.
  ].filter((row) => row.tokens > 0 || row.cost > 0);
  // Sessions and traces aggregate cost without an input/output split; the
  // cost columns would only read $0.00 there, so they are dropped.
  const showCostColumns = inputCost > 0 || outputCost > 0;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="font-bold">Token breakdown</span>
      <table className="mt-1 w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="pb-1 text-left font-normal" />
            <th className="pb-1 pl-5 text-right font-normal">Tokens</th>
            {showCostColumns ? (
              <>
                <th className="pb-1 pl-5 text-right font-normal">Cost</th>
                <th className="pb-1 pl-5 text-right font-normal">% of cost</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="text-muted-foreground py-1.5 text-left">
                {row.label}
              </td>
              <td className={tableCellClass}>
                {numberFormatter(row.tokens, 0)}
              </td>
              {showCostColumns ? (
                <>
                  <td className={tableCellClass}>{usdFormatter(row.cost)}</td>
                  <td className={tableCellClass}>
                    {totalCost > 0
                      ? `${((row.cost / totalCost) * 100).toFixed(0)}%`
                      : "—"}
                  </td>
                </>
              ) : null}
            </tr>
          ))}
          <tr className="border-border/60 border-t">
            <td className="pt-2 pb-0.5 text-left font-bold">Total</td>
            <td className="pt-2 pb-0.5 pl-5 text-right font-bold tabular-nums">
              {numberFormatter(totalTokens, 0)}
            </td>
            {showCostColumns ? (
              <>
                <td className="pt-2 pb-0.5 pl-5 text-right font-bold tabular-nums">
                  {usdFormatter(totalCost)}
                </td>
                <td className="pt-2 pb-0.5 pl-5 text-right font-bold tabular-nums">
                  100%
                </td>
              </>
            ) : null}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function CostUsageBadge({
  totalCost,
  costDetails,
  inputUsage,
  outputUsage,
  totalUsage,
  usageDetails,
}: {
  totalCost: number | null | undefined;
  costDetails: Record<string, number> | null | undefined;
  inputUsage: number;
  outputUsage: number;
  totalUsage: number;
  usageDetails: Record<string, number> | null | undefined;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const hasCost = totalCost != null && !!costDetails;
  const usage = usageDetails ?? {};
  const total = getCompactUsageTotal({ inputUsage, outputUsage, totalUsage });
  const hasUsage = hasRenderableUsage({
    inputUsage,
    outputUsage,
    totalUsage,
    usageDetails: usage,
  });

  if (!hasCost && !hasUsage) return null;

  // No cost at all: reuse the plain usage-only breakdown tooltip unchanged.
  if (!hasCost) {
    return (
      <BreakdownTooltip details={usage} isCost={false}>
        {total > 0 ? (
          <span
            title="Usage breakdown on hover"
            className={BREAKDOWN_AFFORDANCE_CLASS}
          >
            <Coins className="size-3 shrink-0" aria-hidden />
            {numberFormatter(total, 0)}
          </span>
        ) : (
          <span className={METRIC_TEXT_CLASS}>
            <span aria-label="View usage breakdown">
              <InfoIcon aria-hidden className="size-3" />
            </span>
          </span>
        )}
      </BreakdownTooltip>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span title="Cost" className={METRIC_TEXT_CLASS}>
        {usdFormatter(totalCost)}
      </span>
      {/* Tokens carry the breakdown: cost is a plain number, the token
          count is where the input/output split (and its cost) is explained. */}
      {total > 0 ? (
        <TooltipProvider delayDuration={100}>
          <Tooltip open={isOpen} onOpenChange={setIsOpen}>
            <TooltipTrigger
              className="flex cursor-pointer"
              onClick={() => setIsOpen(!isOpen)}
            >
              <span
                title="Usage breakdown on hover"
                className={BREAKDOWN_AFFORDANCE_CLASS}
              >
                <Coins className="size-3 shrink-0" aria-hidden />
                {numberFormatter(total, 0)}
              </span>
            </TooltipTrigger>
            <TooltipContent className="w-max max-w-80 min-w-52 p-4">
              <CostUsageTable
                inputUsage={inputUsage}
                outputUsage={outputUsage}
                totalUsage={totalUsage}
                totalCost={totalCost}
                costDetails={costDetails}
              />
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </span>
  );
}
