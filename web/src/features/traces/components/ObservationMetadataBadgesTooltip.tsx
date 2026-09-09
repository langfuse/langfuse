/**
 * Cost/usage metadata text for ObservationDetailView and the trace summary
 * strip. Quiet grammar: muted mono text, no border/box — pills are reserved
 * for tags. A small icon stands in for the word label on cost; the input →
 * output split never renders inline, only in the `BreakdownTooltip` that
 * carries the detail on hover/click (its trigger semantics are unchanged).
 */

import {
  BreakdownTooltip,
  type PriceSource,
} from "@/src/features/traces/components/BreakdownTooltip";
import { usdFormatter, numberFormatter } from "@/src/utils/numbers";
import { Coins, InfoIcon } from "lucide-react";

// Matches the metrics-tier scale in ObservationMetadataBadgesSimple.tsx —
// uniform muted mono text, no borders/boxes.
const METRIC_TEXT_CLASS =
  "text-muted-foreground inline-flex shrink-0 items-center gap-1 font-mono text-[11px] whitespace-nowrap";

export function CostBadge({
  totalCost,
  costDetails,
  priceSource,
}: {
  totalCost: number;
  costDetails: Record<string, number>;
  priceSource?: PriceSource;
}) {
  return (
    <BreakdownTooltip
      details={costDetails}
      isCost={true}
      priceSource={priceSource}
    >
      <span title="Cost breakdown on hover" className={METRIC_TEXT_CLASS}>
        <Coins className="size-3 shrink-0" aria-hidden />
        {usdFormatter(totalCost)}
      </span>
    </BreakdownTooltip>
  );
}

/**
 * Whether a usage object is worth rendering at all. Callers gate on this:
 * an all-zero usage would otherwise render a bare info icon opening a
 * breakdown of zeros.
 */
export function hasRenderableUsage({
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
 * The single number `UsageBadge` shows inline. `totalUsage` can be 0 while
 * the in→out split still carries real numbers (e.g. usage recorded only
 * per-direction) — fall back to their sum rather than showing a misleadingly
 * empty total for a generation that does have usage.
 */
export function getCompactUsageTotal({
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

export function UsageBadge({
  inputUsage,
  outputUsage,
  totalUsage,
  usageDetails,
}: {
  inputUsage: number;
  outputUsage: number;
  totalUsage: number;
  usageDetails: Record<string, number>;
}) {
  // Total only, everywhere — the input→output split lives in the breakdown
  // tooltip on hover, never inline. Falls back to a bare info icon when
  // there is no total but usage still exists only in the details map (e.g.
  // audio_seconds), so the breakdown stays reachable.
  const total = getCompactUsageTotal({ inputUsage, outputUsage, totalUsage });

  return (
    <BreakdownTooltip details={usageDetails} isCost={false}>
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
