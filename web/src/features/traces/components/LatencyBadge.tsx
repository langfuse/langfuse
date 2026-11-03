import { Badge } from "@/src/components/design-system/Badge/Badge";
import { formatIntervalSeconds } from "@/src/utils/dates";

export function LatencyBadge({ latencySeconds }: { latencySeconds: number }) {
  return (
    <Badge
      font="mono"
      color="ghost"
      text={formatIntervalSeconds(latencySeconds)}
    />
  );
}
