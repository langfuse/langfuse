/**
 * Simple overview-grid rows for ObservationDetailView.
 * Each component handles its own null checks and returns null when data is
 * unavailable. Rendered inside `OverviewGrid` (see _shared/InspectorElements),
 * emitting a mono eyebrow label + mono value pair.
 */

import { OverviewRow } from "@/src/components/trace/components/_shared/InspectorElements";
import { formatIntervalSeconds } from "@/src/utils/dates";

export function LatencyBadge({
  latencySeconds,
}: {
  latencySeconds: number | null;
}) {
  if (latencySeconds == null) return null;

  return (
    <OverviewRow label="Latency">
      {formatIntervalSeconds(latencySeconds)}
    </OverviewRow>
  );
}

export function TimeToFirstTokenBadge({
  timeToFirstToken,
}: {
  timeToFirstToken: number | null | undefined;
}) {
  if (timeToFirstToken == null) return null;

  return (
    <OverviewRow label="TTFT" title="Time to first token">
      {formatIntervalSeconds(timeToFirstToken)}
    </OverviewRow>
  );
}

export function EnvironmentBadge({
  environment,
}: {
  environment: string | null | undefined;
}) {
  if (!environment) return null;

  return (
    <OverviewRow label="Env" title={environment}>
      {environment}
    </OverviewRow>
  );
}

export function VersionBadge({
  version,
}: {
  version: string | null | undefined;
}) {
  if (!version) return null;

  return (
    <OverviewRow label="Version" title={version}>
      {version}
    </OverviewRow>
  );
}

export function LevelBadge({ level }: { level: string | null | undefined }) {
  if (!level || level === "DEFAULT") return null;

  return (
    <OverviewRow
      label="Level"
      className={
        level === "ERROR"
          ? "text-destructive"
          : level === "WARNING"
            ? "text-dark-yellow"
            : undefined
      }
    >
      {level}
    </OverviewRow>
  );
}

export function StatusMessageBadge({
  statusMessage,
}: {
  statusMessage: string | null | undefined;
}) {
  if (!statusMessage) return null;

  return (
    <OverviewRow label="Status" title={statusMessage}>
      {statusMessage}
    </OverviewRow>
  );
}
