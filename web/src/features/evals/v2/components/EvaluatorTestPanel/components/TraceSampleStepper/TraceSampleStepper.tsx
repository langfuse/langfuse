import { ChevronLeft, ChevronRight, Maximize2 } from "@langfuse/icons";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Skeleton } from "@/src/components/ui/skeleton";
import type {
  SampleObservation,
  SampleObservationMatches,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";

/** First matching observation per trace, in match order. */
function matchingTraces(observations: SampleObservation[]) {
  const seen = new Set<string>();
  return observations.filter((observation) => {
    if (!observation.traceId || seen.has(observation.traceId)) return false;
    seen.add(observation.traceId);
    return true;
  });
}

/** Steps through matching traces one at a time instead of listing them. */
export function TraceSampleStepper({
  matches,
  selectedTraceId,
  onSelect,
  onOpenTrace,
}: {
  matches: SampleObservationMatches;
  selectedTraceId: string | null;
  onSelect: (observation: SampleObservation) => void;
  onOpenTrace: (observation: SampleObservation) => void;
}) {
  if (matches.pending && matches.observations.length === 0) {
    return <Skeleton className="h-12 w-full" />;
  }
  if (matches.error) {
    return <p className="text-destructive text-sm">{matches.error}</p>;
  }

  const traces = matchingTraces(matches.observations);
  const index = traces.findIndex(
    (observation) => observation.traceId === selectedTraceId,
  );
  const current = traces[index];
  if (!current) {
    return (
      <p className="text-muted-foreground rounded-md border p-3 text-sm">
        No traces match the current filters and time range.
      </p>
    );
  }
  const traceLabel = current.traceName ?? current.traceId ?? "";
  const startTimeLabel = current.startTime.toLocaleString();
  const next = traces[index + 1];
  const canGoNext = Boolean(next) || matches.hasNextPage;

  return (
    <div className="flex items-center gap-2 rounded-md border p-2 pl-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium" title={traceLabel}>
          {traceLabel}
        </span>
        <span
          className="text-muted-foreground truncate text-xs"
          title={startTimeLabel}
        >
          {startTimeLabel}
        </span>
      </div>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {`${index + 1} of ${traces.length}${matches.hasNextPage ? "+" : ""}`}
      </span>
      <IconButton
        icon={ChevronLeft}
        label="Previous trace"
        size="sm"
        disabled={index === 0}
        onClick={() => {
          const previous = traces[index - 1];
          if (previous) onSelect(previous);
        }}
      />
      <IconButton
        icon={ChevronRight}
        label="Next trace"
        size="sm"
        disabled={!canGoNext || matches.fetchingNextPage}
        onClick={() => {
          if (next) onSelect(next);
          else matches.fetchNextPage();
        }}
      />
      <IconButton
        icon={Maximize2}
        label="Open trace"
        size="sm"
        onClick={() => onOpenTrace(current)}
      />
    </div>
  );
}
