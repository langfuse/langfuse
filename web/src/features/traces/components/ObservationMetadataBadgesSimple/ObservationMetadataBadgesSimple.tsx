/**
 * Simple metadata pills for ObservationDetailView.
 * Each pill handles its own null checks and returns null when data is unavailable.
 */

import {
  HeaderPill,
  HeaderPillValue,
} from "@/src/components/layouts/header-pill";
import { formatIntervalSeconds } from "@/src/utils/dates";

export function LatencyBadge({
  latencySeconds,
}: {
  latencySeconds: number | null;
}) {
  if (latencySeconds == null) return null;

  return (
    <HeaderPill variant="display">
      latency{" "}
      <HeaderPillValue>{formatIntervalSeconds(latencySeconds)}</HeaderPillValue>
    </HeaderPill>
  );
}

export function TimeToFirstTokenBadge({
  timeToFirstToken,
}: {
  timeToFirstToken: number | null | undefined;
}) {
  if (timeToFirstToken == null) return null;

  return (
    <HeaderPill variant="display">
      ttft{" "}
      <HeaderPillValue>
        {formatIntervalSeconds(timeToFirstToken)}
      </HeaderPillValue>
    </HeaderPill>
  );
}

export function EnvironmentBadge({
  environment,
}: {
  environment: string | null | undefined;
}) {
  if (!environment) return null;

  return (
    <HeaderPill variant="display">
      env <HeaderPillValue>{environment}</HeaderPillValue>
    </HeaderPill>
  );
}

export function ReleaseBadge({
  release,
}: {
  release: string | null | undefined;
}) {
  if (!release) return null;

  return (
    <HeaderPill variant="display">
      release <HeaderPillValue>{release}</HeaderPillValue>
    </HeaderPill>
  );
}

export function VersionBadge({
  version,
}: {
  version: string | null | undefined;
}) {
  if (!version) return null;

  return (
    <HeaderPill variant="display">
      version <HeaderPillValue>{version}</HeaderPillValue>
    </HeaderPill>
  );
}

export function LevelBadge({ level }: { level: string | null | undefined }) {
  if (!level || level === "DEFAULT") return null;

  return (
    <HeaderPill variant="display">
      {level === "ERROR" ? (
        <span className="bg-destructive h-1.5 w-1.5 shrink-0 rounded-[1px]" />
      ) : level === "WARNING" ? (
        <span className="bg-dark-yellow h-1.5 w-1.5 shrink-0 rounded-[1px]" />
      ) : null}
      <HeaderPillValue>{level}</HeaderPillValue>
    </HeaderPill>
  );
}

export function StatusMessageBadge({
  statusMessage,
}: {
  statusMessage: string | null | undefined;
}) {
  if (!statusMessage) return null;

  return (
    <HeaderPill variant="display" title={statusMessage}>
      <span className="max-w-56 truncate" title={statusMessage}>
        <HeaderPillValue>{statusMessage}</HeaderPillValue>
      </span>
    </HeaderPill>
  );
}
