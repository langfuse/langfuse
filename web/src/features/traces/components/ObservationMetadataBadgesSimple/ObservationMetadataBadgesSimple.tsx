/* eslint-disable @repo/no-null-render */
/**
 * Metadata pills for the trace/observation headers and the trace summary
 * strip. Rendered through the session header's pill primitive
 * (`ModernSessionHeaderPill`) so trace and session chips share one style.
 * Each element handles its own null checks and returns null when the
 * underlying value is unavailable.
 */

import { ModernSessionHeaderPill } from "@/src/components/session/ModernSessionHeaderPill";
import { formatIntervalSeconds } from "@/src/utils/dates";

export function LatencyBadge({
  latencySeconds,
}: {
  latencySeconds: number | null;
}) {
  if (latencySeconds == null) return null;

  return (
    <ModernSessionHeaderPill variant="display" title="Latency">
      <span className="text-foreground">
        {formatIntervalSeconds(latencySeconds)}
      </span>
    </ModernSessionHeaderPill>
  );
}

export function TimeToFirstTokenBadge({
  timeToFirstToken,
}: {
  timeToFirstToken: number | null | undefined;
}) {
  if (timeToFirstToken == null) return null;

  return (
    <ModernSessionHeaderPill variant="display" title="Time to first token">
      ttft{" "}
      <span className="text-foreground">
        {formatIntervalSeconds(timeToFirstToken)}
      </span>
    </ModernSessionHeaderPill>
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
    <ModernSessionHeaderPill variant="display">
      {label}{" "}
      <span className="text-foreground max-w-40 truncate" title={value}>
        {value}
      </span>
    </ModernSessionHeaderPill>
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
