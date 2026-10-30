import { Metric } from "@/src/components/design-system/Metric/Metric";
import { formatIntervalSeconds } from "@/src/utils/dates";

export function TimeToFirstTokenBadge({
  timeToFirstToken,
}: {
  timeToFirstToken: number;
}) {
  return (
    <Metric label="ttft" value={formatIntervalSeconds(timeToFirstToken)} />
  );
}
