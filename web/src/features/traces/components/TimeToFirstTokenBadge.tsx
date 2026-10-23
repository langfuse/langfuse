import { Badge } from "@/src/components/design-system/Badge/Badge";
import { formatIntervalSeconds } from "@/src/utils/dates";

export function TimeToFirstTokenBadge({
  timeToFirstToken,
}: {
  timeToFirstToken: number;
}) {
  return (
    <Badge
      font="mono"
      color="ghost"
      label="ttft"
      text={formatIntervalSeconds(timeToFirstToken)}
    />
  );
}
