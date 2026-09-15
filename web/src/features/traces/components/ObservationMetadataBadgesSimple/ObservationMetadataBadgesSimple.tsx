/* eslint-disable @repo/no-null-render */
/**
 * Quiet-text metadata for the trace/observation headers and the trace
 * summary strip. Pills are reserved for tags (`TagPill`) — everything here
 * renders as muted mono text with no border/box. Each element handles its
 * own null check and returns null when the underlying value is unavailable.
 */

import { Clock } from "lucide-react";
import { format } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  buildLocalIsoDatePresentation,
  formatIntervalSeconds,
} from "@/src/utils/dates";

// Metrics tier (latency, time-to-first-token): uniform muted mono text,
// matching the numeric feel of the session header without its pill box.
// Exported so the session header's own metrics (trace/span counts, latency
// percentiles) share ONE definition of the tier instead of copying it.
export const METRIC_TEXT_CLASS =
  "text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs whitespace-nowrap";

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
      {format(startTime, "MMM d HH:mm:ss")}
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
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={METRIC_TEXT_CLASS}>
            TTFT {formatIntervalSeconds(timeToFirstToken)}
          </span>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Time to first token</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Attributes tier (env/release/version, model params in the observation
// header, and the session header's pinned metadata JSONPaths): key/value
// text, key muted and value a touch stronger so the value still reads at a
// glance. Still under design discussion — kept isolated here so it stays
// cheap to restyle, and exported so the session header restyles with it.
export function KeyValueText({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;

  return (
    <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs whitespace-nowrap">
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
