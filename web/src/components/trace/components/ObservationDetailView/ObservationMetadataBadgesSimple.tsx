/**
 * Simple metadata badges for ObservationDetailView
 * Each badge handles its own null checks and returns null when data is unavailable
 */

import { Badge } from "@/src/components/ui/badge";
import { formatIntervalSeconds } from "@/src/utils/dates";

export function LatencyBadge({
  latencySeconds,
}: {
  latencySeconds: number | null;
}) {
  if (latencySeconds == null) return null;

  return (
    <Badge variant="tertiary">
      Latency: {formatIntervalSeconds(latencySeconds)}
    </Badge>
  );
}

export function TimeToFirstTokenBadge({
  timeToFirstToken,
}: {
  timeToFirstToken: number | null | undefined;
}) {
  if (timeToFirstToken == null) return null;

  return (
    <Badge variant="tertiary">
      Time to first token: {formatIntervalSeconds(timeToFirstToken)}
    </Badge>
  );
}

export function EnvironmentBadge({
  environment,
}: {
  environment: string | null | undefined;
}) {
  if (!environment) return null;

  return <Badge variant="tertiary">Env: {environment}</Badge>;
}

export function VersionBadge({
  version,
}: {
  version: string | null | undefined;
}) {
  if (!version) return null;

  return <Badge variant="tertiary">Version: {version}</Badge>;
}

export function LevelBadge({ level }: { level: string | null | undefined }) {
  if (!level || level === "DEFAULT") return null;

  return (
    <Badge
      variant={
        level === "ERROR"
          ? "destructive"
          : level === "WARNING"
            ? "warning"
            : "tertiary"
      }
    >
      {level}
    </Badge>
  );
}

export function StatusMessageBadge({
  statusMessage,
}: {
  statusMessage: string | null | undefined;
}) {
  if (!statusMessage) return null;

  return <Badge variant="tertiary">{statusMessage}</Badge>;
}
