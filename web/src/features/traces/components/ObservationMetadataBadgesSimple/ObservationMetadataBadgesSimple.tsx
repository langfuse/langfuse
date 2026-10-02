import { Badge } from "@/src/components/design-system/Badge/Badge";
import { formatIntervalSeconds } from "@/src/utils/dates";

export function LatencyBadge({ latencySeconds }: { latencySeconds: number }) {
  return <Badge color="ghost" text={formatIntervalSeconds(latencySeconds)} />;
}

export function TimeToFirstTokenBadge({
  timeToFirstToken,
}: {
  timeToFirstToken: number;
}) {
  return (
    <Badge
      color="ghost"
      label="ttft"
      text={formatIntervalSeconds(timeToFirstToken)}
    />
  );
}
