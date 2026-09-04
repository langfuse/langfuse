/**
 * Cost/usage metadata text for ObservationDetailView and the trace summary
 * strip. Muted text (measurements are typography, not chips) with a dotted
 * underline as the hover affordance; BreakdownTooltip carries the detail.
 */

import {
  BreakdownTooltip,
  type PriceSource,
} from "@/src/features/traces/components/BreakdownTooltip";
import {
  usdFormatter,
  formatTokenCounts,
  numberFormatter,
} from "@/src/utils/numbers";
import { InfoIcon } from "lucide-react";

const METRIC_TEXT_CLASSES =
  "text-muted-foreground inline-flex cursor-help items-center gap-1 text-xs";

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
      <span className={METRIC_TEXT_CLASSES} title="Cost breakdown on hover">
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

export function UsageBadge({
  inputUsage,
  outputUsage,
  totalUsage,
  usageDetails,
  compact = false,
}: {
  inputUsage: number;
  outputUsage: number;
  totalUsage: number;
  usageDetails: Record<string, number>;
  /** Total only ("259 tok"), for the trace summary strip — the in→out split
      lives in the breakdown tooltip. */
  compact?: boolean;
}) {
  const tokenText = compact
    ? totalUsage > 0
      ? `∑ ${numberFormatter(totalUsage, 0)}`
      : ""
    : formatTokenCounts(inputUsage, outputUsage, totalUsage, true);

  return (
    <BreakdownTooltip details={usageDetails} isCost={false}>
      {tokenText ? (
        <span className={METRIC_TEXT_CLASSES} title="Usage breakdown on hover">
          {tokenText}
        </span>
      ) : (
        <span className={METRIC_TEXT_CLASSES} aria-label="View usage breakdown">
          <InfoIcon aria-hidden className="size-3" />
        </span>
      )}
    </BreakdownTooltip>
  );
}
