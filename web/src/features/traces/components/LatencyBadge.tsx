import { Badge } from "@/src/components/design-system/Badge/Badge";
import { formatIntervalSeconds } from "@/src/utils/dates";

export function LatencyBadge({
  latencySeconds,
  interactive = false,
}: {
  latencySeconds: number;
  /** Dotted underline: the badge opens something. */
  interactive?: boolean;
}) {
  return (
    <Badge
      font="mono"
      color="ghost"
      interactive={interactive}
      text={formatIntervalSeconds(latencySeconds)}
    />
  );
}
