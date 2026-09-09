/* eslint-disable @repo/no-null-render */
/**
 * Cost/usage metadata text for ObservationDetailView and the trace summary
 * strip. Quiet grammar: muted mono text, no border/box — pills are reserved
 * for tags.
 *
 * Cost and usage share ONE element (`CostUsageBadge`): cost is the primary
 * face whenever it exists (`$0.016079` — the leading `$` is the glyph, no
 * icon), tokens are the fallback face for unpriced/unlinked models
 * (`∑ 10,200` — `∑` is that glyph). The input→output split never renders
 * inline — only on hover, in a breakdown tooltip. When there is a cost,
 * hover shows a small Input/Output/Total table (tokens, cost, % of total
 * cost); when there is no cost at all, hover reuses the existing usage-only
 * `BreakdownTooltip`.
 */

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  BreakdownTooltip,
  type PriceSource,
} from "@/src/features/traces/components/BreakdownTooltip";
import { usdFormatter, numberFormatter } from "@/src/utils/numbers";

// Matches the metrics-tier scale in ObservationMetadataBadgesSimple.tsx —
// uniform muted mono text, no borders/boxes.
const METRIC_TEXT_CLASS =
  "text-muted-foreground inline-flex shrink-0 items-center gap-1 font-mono text-[11px] whitespace-nowrap";

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

const tableCellClass = "py-1 pr-3 text-right font-mono tabular-nums";

function CostUsageTable({
  inputUsage,
  outputUsage,
  totalUsage,
  totalCost,
  costDetails,
  priceSource,
}: {
  inputUsage: number;
  outputUsage: number;
  totalUsage: number;
  totalCost: number;
  costDetails: Record<string, number>;
  priceSource?: PriceSource;
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

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="font-bold">Cost & usage breakdown</span>
      {priceSource && (
        <Link
          href={`/project/${encodeURIComponent(priceSource.projectId)}/settings/models/${encodeURIComponent(priceSource.modelId)}?pricingTier=${encodeURIComponent(priceSource.pricingTierId)}`}
          className="text-muted-foreground flex min-w-0 flex-row gap-1 text-xs italic underline-offset-4 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span
            className="min-w-0 truncate"
            title={`${priceSource.pricingTierName} Tier Pricing`}
          >
            {priceSource.pricingTierName} Tier Pricing
          </span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </Link>
      )}
      <table className="text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="pr-3 text-left font-normal" />
            <th className="pr-3 text-right font-normal">Tokens</th>
            <th className="pr-3 text-right font-normal">Cost</th>
            <th className="text-right font-normal">% total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="py-1 pr-3">{row.label}</td>
              <td className={tableCellClass}>
                {numberFormatter(row.tokens, 0)}
              </td>
              <td className={tableCellClass}>
                {usdFormatter(row.cost, 2, 12)}
              </td>
              <td className="py-1 text-right font-mono tabular-nums">
                {totalCost > 0
                  ? `${((row.cost / totalCost) * 100).toFixed(0)}%`
                  : "—"}
              </td>
            </tr>
          ))}
          <tr className="border-t border-double font-bold">
            <td className="py-1 pr-3">Total</td>
            <td className={tableCellClass}>
              {numberFormatter(totalTokens, 0)}
            </td>
            <td className={tableCellClass}>{usdFormatter(totalCost, 2, 12)}</td>
            <td className="py-1 text-right font-mono tabular-nums">100%</td>
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
  priceSource,
}: {
  totalCost: number | null | undefined;
  costDetails: Record<string, number> | null | undefined;
  inputUsage: number;
  outputUsage: number;
  totalUsage: number;
  usageDetails: Record<string, number> | null | undefined;
  priceSource?: PriceSource;
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
          <span title="Usage breakdown on hover" className={METRIC_TEXT_CLASS}>
            {`∑ ${numberFormatter(total, 0)}`}
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
    <TooltipProvider>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger
          className="flex cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span title="Cost breakdown on hover" className={METRIC_TEXT_CLASS}>
            {usdFormatter(totalCost)}
          </span>
        </TooltipTrigger>
        <TooltipContent className="w-max max-w-80 min-w-52 p-4">
          <CostUsageTable
            inputUsage={inputUsage}
            outputUsage={outputUsage}
            totalUsage={totalUsage}
            totalCost={totalCost}
            costDetails={costDetails}
            priceSource={priceSource}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
