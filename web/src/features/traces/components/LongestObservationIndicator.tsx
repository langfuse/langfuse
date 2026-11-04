import { Snail } from "@langfuse/icons";

import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { type LongestLeafObservation } from "@/src/features/traces/fns/longestLeafObservation";

/** Icon-only marker rendered after the duration of the trace's longest leaf. */
export function LongestObservationIndicator({
  durationMs,
  shareOfTrace,
}: Pick<LongestLeafObservation, "durationMs" | "shareOfTrace">) {
  const label = [
    "Longest observation",
    formatIntervalSeconds(durationMs / 1000),
    shareOfTrace != null ? `${Math.round(shareOfTrace * 100)}% of trace` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Tooltip label={label} hoverableContent={false}>
      {({ getTriggerProps }) => (
        <span
          {...getTriggerProps()}
          aria-label={label}
          className="inline-flex items-center"
        >
          <Snail
            aria-hidden
            size="sm"
            color="inherit"
            __rawClassName="text-dark-yellow"
          />
        </span>
      )}
    </Tooltip>
  );
}
