// Metric values render in mono; `contents` keeps the wrapper out of layout.
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { formatIntervalSeconds } from "@/src/utils/dates";

export function LatencyBadge({ latencySeconds }: { latencySeconds: number }) {
  return (
    <span className="contents font-mono">
      <Badge color="ghost" text={formatIntervalSeconds(latencySeconds)} />
    </span>
  );
}

export function TimeToFirstTokenBadge({
  timeToFirstToken,
}: {
  timeToFirstToken: number;
}) {
  return (
    <span className="contents font-mono">
      <Badge
        color="ghost"
        label="ttft"
        text={formatIntervalSeconds(timeToFirstToken)}
      />
    </span>
  );
}
