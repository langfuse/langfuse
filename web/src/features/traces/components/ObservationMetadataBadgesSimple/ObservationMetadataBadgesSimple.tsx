/* eslint-disable @repo/no-null-render */
/**
 * Metadata text for the trace/observation headers and the trace summary strip.
 *
 * Two visual tiers, deliberately NOT chips (chips are for user-defined tags):
 * - Measured metrics (latency, TTFT): plain muted text — measurements read as
 *   typography, importance maps to visual weight.
 * - User-supplied context (env, release, version): muted `key: value` text,
 *   rendered only when set.
 * Each element handles its own null checks and returns null when unavailable.
 */

import { Clock } from "lucide-react";
import { formatIntervalSeconds } from "@/src/utils/dates";

export function LatencyBadge({
  latencySeconds,
}: {
  latencySeconds: number | null;
}) {
  if (latencySeconds == null) return null;

  return (
    <span
      title="Latency"
      className="text-muted-foreground inline-flex items-center gap-1 text-xs"
    >
      <Clock className="size-3 shrink-0" aria-hidden />
      {formatIntervalSeconds(latencySeconds)}
    </span>
  );
}

export function TimeToFirstTokenBadge({
  timeToFirstToken,
}: {
  timeToFirstToken: number | null | undefined;
}) {
  if (timeToFirstToken == null) return null;

  return (
    <span title="Time to first token" className="text-muted-foreground text-xs">
      TTFT {formatIntervalSeconds(timeToFirstToken)}
    </span>
  );
}

function KeyValueText({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;

  return (
    <span className="text-muted-foreground text-xs">
      {label}: <span className="text-foreground/80">{value}</span>
    </span>
  );
}

export function EnvironmentBadge({
  environment,
}: {
  environment: string | null | undefined;
}) {
  return <KeyValueText label="env" value={environment} />;
}

export function ReleaseBadge({
  release,
}: {
  release: string | null | undefined;
}) {
  return <KeyValueText label="release" value={release} />;
}

export function VersionBadge({
  version,
}: {
  version: string | null | undefined;
}) {
  return <KeyValueText label="version" value={version} />;
}
