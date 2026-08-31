import { InfoIcon } from "lucide-react";

import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import { BreakdownTooltip } from "@/src/features/traces/components/BreakdownTooltip";

export type TokenUsageDetails = Record<string, number | undefined>;

type TokenUsageCounts = {
  inputUsage: number;
  outputUsage: number;
  totalUsage: number;
};

export type TokenUsageTableCellProps = TokenUsageCounts &
  (
    | {
        details: TokenUsageDetails | TokenUsageDetails[];
        pricingTierName?: string;
      }
    | {
        details?: undefined;
        pricingTierName?: undefined;
      }
  );

export function TokenUsageTableCell({
  inputUsage,
  outputUsage,
  totalUsage,
  details,
  pricingTierName,
}: TokenUsageTableCellProps) {
  const badge = (
    <TokenUsageBadge
      inputUsage={inputUsage}
      outputUsage={outputUsage}
      totalUsage={totalUsage}
      inline
    />
  );

  if (!details) return badge;

  return (
    <BreakdownTooltip details={details} pricingTierName={pricingTierName}>
      <div className="flex items-center gap-1">
        {badge}
        <InfoIcon className="h-3 w-3" />
      </div>
    </BreakdownTooltip>
  );
}
