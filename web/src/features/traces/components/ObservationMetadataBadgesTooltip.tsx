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
 * inline — only on hover, in the shared usage `BreakdownTooltip` (input,
 * output and every extra usage key such as cache reads or reasoning tokens,
 * grouped under Input / Output / Other). Cost is a plain number.
 */

import { Coins, InfoIcon } from "lucide-react";
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

  const tokens = (
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

  if (!hasCost) return tokens;

  return (
    <span className="inline-flex items-center gap-2">
      <span title="Cost" className={METRIC_TEXT_CLASS}>
        {usdFormatter(totalCost)}
      </span>
      {/* Tokens carry the breakdown: cost is a plain number. */}
      {hasUsage ? tokens : null}
    </span>
  );
}
