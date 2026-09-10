/* eslint-disable @repo/no-null-render */
/**
 * Quiet-text metadata for the trace/observation headers and the trace
 * summary strip. Pills are reserved for tags (`TagPill`) — everything here
 * renders as muted mono text with no border/box. Each element handles its
 * own null check and returns null when the underlying value is unavailable.
 */

import { Clock } from "lucide-react";
import {
  buildLocalIsoDatePresentation,
  formatIntervalSeconds,
} from "@/src/utils/dates";

// Metrics tier (latency, time-to-first-token): uniform muted mono text,
// matching the numeric feel of the session header without its pill box.
const METRIC_TEXT_CLASS =
  "text-muted-foreground inline-flex shrink-0 items-center gap-1 font-mono text-[11px] whitespace-nowrap";

/** Absolute start time, quiet text like the other metrics; full ISO on hover. */
export function StartTimeBadge({ startTime }: { startTime: Date | null }) {
  if (!startTime) return null;
  const prepared = buildLocalIsoDatePresentation({
    date: startTime,
    accuracy: "millisecond",
  });
  if (!prepared) return null;
  return (
    <span title={prepared.title} className={METRIC_TEXT_CLASS}>
      {prepared.display}
    </span>
  );
}

export function LatencyBadge({
  latencySeconds,
}: {
  latencySeconds: number | null;
}) {
  if (latencySeconds == null) return null;

  return (
    <span title="Latency" className={METRIC_TEXT_CLASS}>
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
    <span title="Time to first token" className={METRIC_TEXT_CLASS}>
      TTFT {formatIntervalSeconds(timeToFirstToken)}
    </span>
  );
}

// Attributes tier (env/release/version, and model params in the observation
// header): key/value text, key muted and value a touch stronger so the
// value still reads at a glance. Still under design discussion — kept
// isolated here so it stays cheap to restyle.
function KeyValueText({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;

  return (
    <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 font-mono text-[11px] whitespace-nowrap">
      {label}{" "}
      <span className="text-foreground/80 max-w-40 truncate" title={value}>
        {value}
      </span>
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
