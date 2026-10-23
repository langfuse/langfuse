import { Snail } from "@langfuse/icons";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { type LongestLeafObservation } from "@/src/features/traces/fns/longestLeafObservation";

/** Icon-only marker on the tree row of the trace's longest leaf observation. */
export function LongestObservationIndicator({
  durationMs,
  shareOfTrace,
  surface = "default",
}: Pick<LongestLeafObservation, "durationMs" | "shareOfTrace"> & {
  /** The row surface behind the chip; it flips its fill on `muted`. */
  surface?: "default" | "muted";
}) {
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
        <BadgeShell
          {...getTriggerProps()}
          aria-label={label}
          color={surface === "muted" ? "filledOnMuted" : "filled"}
          size="sm"
        >
          <Snail aria-hidden size="sm" color="muted" />
        </BadgeShell>
      )}
    </Tooltip>
  );
}
