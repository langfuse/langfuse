/* eslint-disable @repo/no-null-render */
/**
 * Simple metadata badges for ObservationDetailView
 * Each badge handles its own null checks and returns null when data is unavailable
 */

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { formatIntervalSeconds } from "@/src/utils/dates";

export function LatencyBadge({
  latencySeconds,
}: {
  latencySeconds: number | null;
}) {
  if (latencySeconds == null) return null;

  return <Badge text={`Latency: ${formatIntervalSeconds(latencySeconds)}`} />;
}

export function TimeToFirstTokenBadge({
  timeToFirstToken,
}: {
  timeToFirstToken: number | null | undefined;
}) {
  if (timeToFirstToken == null) return null;

  return (
    <Badge
      text={`Time to first token: ${formatIntervalSeconds(timeToFirstToken)}`}
    />
  );
}

export function EnvironmentBadge({
  environment,
}: {
  environment: string | null | undefined;
}) {
  if (!environment) return null;

  return <Badge text={`Env: ${environment}`} />;
}

export function ReleaseBadge({
  release,
}: {
  release: string | null | undefined;
}) {
  if (!release) return null;

  return <Badge text={`Release: ${release}`} />;
}

export function VersionBadge({
  version,
}: {
  version: string | null | undefined;
}) {
  if (!version) return null;

  return <Badge text={`Version: ${version}`} />;
}
