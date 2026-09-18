/* eslint-disable @repo/no-null-render */
/**
 * Simple metadata badges for ObservationDetailView
 * Each badge handles its own null checks and returns null when data is unavailable
 */

import { Clock } from "lucide-react";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { formatIntervalSeconds } from "@/src/utils/dates";

export function LatencyBadge({
  latencySeconds,
}: {
  latencySeconds: number | null;
}) {
  if (latencySeconds == null) return null;

  return (
    <Badge
      color="ghost"
      leadingIcon={Clock}
      text={formatIntervalSeconds(latencySeconds)}
      title="Latency"
    />
  );
}

export function TimeToFirstTokenBadge({
  timeToFirstToken,
}: {
  timeToFirstToken: number | null | undefined;
}) {
  if (timeToFirstToken == null) return null;

  return (
    <Badge
      color="ghost"
      label="ttft"
      text={formatIntervalSeconds(timeToFirstToken)}
    />
  );
}
