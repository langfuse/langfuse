/**
 * Cost/usage metadata pills for ObservationDetailView and the trace summary
 * strip. Rendered through the session header's pill primitive
 * (`ModernSessionHeaderPill`); `BreakdownTooltip` carries the detail on
 * hover/click and its trigger semantics are unchanged.
 */

import { ModernSessionHeaderPill } from "@/src/components/session/ModernSessionHeaderPill";
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
      <ModernSessionHeaderPill
        variant="display"
        title="Cost breakdown on hover"
      >
        cost <span className="text-foreground">{usdFormatter(totalCost)}</span>
      </ModernSessionHeaderPill>
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
 * The single number the compact `UsageBadge` shows. `totalUsage` can be 0
 * while the in→out split still carries real numbers (e.g. usage recorded
 * only per-direction) — fall back to their sum rather than showing a
 * misleadingly empty total for a generation that does have usage.
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
  if (compact) {
    // Callers gate compact rendering on getCompactUsageTotal(...) > 0, same
    // as this — see TraceSummaryStrip.
    const compactTotal = getCompactUsageTotal({
      inputUsage,
      outputUsage,
      totalUsage,
    });

    return (
      <BreakdownTooltip details={usageDetails} isCost={false}>
        <ModernSessionHeaderPill
          variant="display"
          title="Usage breakdown on hover"
        >
          tokens{" "}
          <span className="text-foreground">
            {numberFormatter(inputUsage, 0)} → {numberFormatter(outputUsage, 0)}{" "}
            (∑ {numberFormatter(compactTotal, 0)})
          </span>
        </ModernSessionHeaderPill>
      </BreakdownTooltip>
    );
  }

  const tokenText = formatTokenCounts(
    inputUsage,
    outputUsage,
    totalUsage,
    true,
  );

  return (
    <BreakdownTooltip details={usageDetails} isCost={false}>
      {tokenText ? (
        <ModernSessionHeaderPill
          variant="display"
          title="Usage breakdown on hover"
        >
          <span className="text-foreground">{tokenText}</span>
        </ModernSessionHeaderPill>
      ) : (
        <ModernSessionHeaderPill variant="display">
          <span aria-label="View usage breakdown">
            <InfoIcon aria-hidden className="size-3" />
          </span>
        </ModernSessionHeaderPill>
      )}
    </BreakdownTooltip>
  );
}
