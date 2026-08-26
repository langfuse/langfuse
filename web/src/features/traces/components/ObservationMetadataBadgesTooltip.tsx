/**
 * Tooltip-based metadata pills for ObservationDetailView.
 * These pills use BreakdownTooltip to show detailed cost/usage information.
 */

import { type ObservationType, isGenerationLike } from "@langfuse/shared";

import {
  HeaderPill,
  HeaderPillValue,
} from "@/src/components/layouts/header-pill";
import {
  BreakdownTooltip,
  type PriceSource,
} from "@/src/features/traces/components/BreakdownTooltip";
import {
  compactNumberFormatter,
  numberFormatter,
  usdFormatter,
} from "@/src/utils/numbers";

const compactTokenFormatter = (tokens: number) =>
  compactNumberFormatter(tokens, 0).toLowerCase();

export function CostBadge({
  totalCost,
  costDetails,
  priceSource,
}: {
  totalCost: number | null;
  costDetails: Record<string, number> | undefined;
  priceSource?: PriceSource;
}) {
  // Don't show if no cost data. Explicit 0 is a real value and should render.
  if (totalCost == null || !costDetails) return null;

  return (
    <BreakdownTooltip
      details={costDetails}
      isCost={true}
      priceSource={priceSource}
    >
      <HeaderPill variant="display" title={`exact $${totalCost.toFixed(6)}`}>
        cost <HeaderPillValue>{usdFormatter(totalCost, 2, 3)}</HeaderPillValue>
      </HeaderPill>
    </BreakdownTooltip>
  );
}

export function UsageBadge({
  type,
  inputUsage,
  outputUsage,
  totalUsage,
  usageDetails,
}: {
  type: ObservationType;
  inputUsage: number;
  outputUsage: number;
  totalUsage: number;
  usageDetails: Record<string, number> | undefined;
}) {
  if (!isGenerationLike(type) || !usageDetails || totalUsage <= 0) return null;

  const exactTokenCounts = `${numberFormatter(inputUsage, 0)} → ${numberFormatter(outputUsage, 0)} (Σ ${numberFormatter(totalUsage, 0)})`;

  return (
    <BreakdownTooltip details={usageDetails} isCost={false}>
      <HeaderPill variant="display" title={`tokens ${exactTokenCounts}`}>
        <span>
          tokens{" "}
          <HeaderPillValue>
            {compactTokenFormatter(inputUsage)} →{" "}
            {compactTokenFormatter(outputUsage)} (Σ{" "}
            {compactTokenFormatter(totalUsage)})
          </HeaderPillValue>
        </span>
      </HeaderPill>
    </BreakdownTooltip>
  );
}
