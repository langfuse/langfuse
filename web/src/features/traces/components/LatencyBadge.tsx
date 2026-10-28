import { Metric } from "@/src/components/design-system/Metric/Metric";
import { formatIntervalSeconds } from "@/src/utils/dates";

export function LatencyBadge({ latencySeconds }: { latencySeconds: number }) {
  return <Metric value={formatIntervalSeconds(latencySeconds)} />;
}
