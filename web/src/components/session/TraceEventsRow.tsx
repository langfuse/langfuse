import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
import { Card } from "@/src/components/ui/card";
import { type RouterOutputs } from "@/src/utils/api";
import { getNumberFromMap } from "@/src/utils/map-utils";
import Link from "next/link";
import React from "react";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { ItemBadge } from "@/src/components/ItemBadge";
import { NewDatasetItemFromTraceId } from "@/src/components/session/NewDatasetItemFromTrace";
import { type FilterState } from "@langfuse/shared";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { IOPreview } from "@/src/components/trace/components/IOPreview/IOPreview";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { FilterX } from "lucide-react";

// LFE-10520: the "show all" escape hatch re-queries this trace with no per-item
// filter so every observation renders. Module-level so the empty-filter array
// keeps a stable identity across renders.
const SHOW_ALL_FILTER: FilterState = [];

// An observation "carries I/O" when its input or output is a non-empty value.
// The events mirror stores '' for absent payloads, so blank strings count as
// no-I/O. Used for the default view (LFE-10520), which surfaces only the
// observations a user actually wants to read.
const hasContent = (value: unknown): boolean =>
  value !== null &&
  value !== undefined &&
  !(typeof value === "string" && value.trim() === "");

const observationHasIO = (observation: {
  input?: unknown;
  output?: unknown;
}): boolean => hasContent(observation.input) || hasContent(observation.output);

/**
 * LFE-10520 — replaces the silent "No observations match the current filter."
 * empty state. When an explicit per-item filter matches nothing in a trace,
 * this makes the reason explicit and offers a one-click fallback to render the
 * trace's real observations instead of an empty card.
 */
const FilteredOutNotice = ({ onShowAll }: { onShowAll: () => void }) => (
  <div className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-2 rounded-md border border-dashed p-3">
    <div className="text-destructive flex items-center gap-2 text-xs font-medium">
      <FilterX className="h-3.5 w-3.5 shrink-0" />
      No observation in this trace matches the current filter
    </div>
    <p className="text-muted-foreground text-xs">
      The filter applies within each trace. This trace has no matching
      observation, so its content is hidden — not missing.
    </p>
    <Button variant="secondary" size="sm" onClick={onShowAll}>
      Show all observations
    </Button>
  </div>
);

export const TraceEventsSkeleton = () => {
  return (
    <Card className="border-border shadow-none">
      <div className="flex h-64 items-center justify-center p-4">
        <JsonSkeleton className="h-full w-full" numRows={8} />
      </div>
    </Card>
  );
};

type LazyTraceEventsRowProps = {
  trace: RouterOutputs["sessions"]["tracesFromEvents"][number];
  projectId: string;
  sessionId: string;
  openPeek: (id: string, row: any) => void;
  index: number;
  traceCommentCounts: Map<string, number> | undefined;
  showCorrections: boolean;
  filterState: FilterState;
  hideTracePanel?: boolean;
};

const areLazyTraceEventsRowPropsEqual = (
  previous: LazyTraceEventsRowProps,
  next: LazyTraceEventsRowProps,
) =>
  previous.trace === next.trace &&
  previous.projectId === next.projectId &&
  previous.sessionId === next.sessionId &&
  previous.openPeek === next.openPeek &&
  previous.index === next.index &&
  previous.traceCommentCounts === next.traceCommentCounts &&
  previous.showCorrections === next.showCorrections &&
  previous.filterState === next.filterState &&
  previous.hideTracePanel === next.hideTracePanel;

export const TraceEventsRow = React.memo(
  ({
    trace,
    projectId,
    sessionId,
    openPeek,
    traceCommentCounts,
    showCorrections,
    filterState,
    hideTracePanel = false,
  }: {
    trace: RouterOutputs["sessions"]["tracesFromEvents"][number];
    projectId: string;
    sessionId: string;
    openPeek: (id: string, row: any) => void;
    traceCommentCounts: Map<string, number> | undefined;
    showCorrections: boolean;
    filterState: FilterState;
    hideTracePanel?: boolean;
  }) => {
    // LFE-10520: per-card escape hatch from the view filter.
    const [showAll, setShowAll] = React.useState(false);
    const observationsQuery =
      api.sessions.observationsForTraceFromEvents.useQuery(
        {
          projectId,
          sessionId,
          traceId: trace.id,
          filter: showAll ? SHOW_ALL_FILTER : filterState,
        },
        {
          enabled: typeof trace.id === "string",
          trpc: { context: { skipBatch: true } },
          staleTime: 60 * 1000,
        },
      );
    const hasActiveFilter = filterState.length > 0;

    // Default view (no explicit filter): show the observations that actually
    // carry input/output, so chat shows the chat and an agent run shows the
    // agent + its tool calls instead of empty cards (LFE-10520). If none carry
    // I/O, fall back to all of them rather than render nothing. An explicit
    // filter (or "show all") is honored verbatim.
    const observations = observationsQuery.data;
    const applyDefaultIOFilter = !hasActiveFilter && !showAll;
    const visibleObservations = React.useMemo(() => {
      if (!observations) return undefined;
      // The synthetic trace-level row (no parent observation) just mirrors the
      // trace's own I/O, already shown by the trace panel — drop it unless it
      // is all the trace has, so the card is never needlessly empty.
      const realObservations = observations.filter((observation) =>
        Boolean(observation.parentObservationId),
      );
      const pool =
        realObservations.length > 0 ? realObservations : observations;
      if (!applyDefaultIOFilter) return pool;
      const withIO = pool.filter(observationHasIO);
      return withIO.length > 0 ? withIO : pool;
    }, [observations, applyDefaultIOFilter]);

    return (
      <Card className="border-border shadow-none">
        <div
          className={
            hideTracePanel
              ? "grid"
              : "grid md:grid-cols-[1fr_1px_358px] lg:grid-cols-[1fr_1px_30rem]"
          }
        >
          <div className="overflow-hidden py-4 pr-4 pl-4">
            {observationsQuery.isLoading ? (
              <JsonSkeleton className="h-full w-full" numRows={8} />
            ) : observationsQuery.isError ? (
              <div className="text-destructive p-2 text-xs">
                Failed to load observations.
              </div>
            ) : visibleObservations && visibleObservations.length > 0 ? (
              <div className="flex flex-col gap-4">
                {showAll && hasActiveFilter && (
                  <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                    <span>
                      Showing all observations (ignoring the view filter).
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowAll(false)}
                    >
                      Back to filtered view
                    </Button>
                  </div>
                )}
                {visibleObservations.map((observation) => (
                  <div key={observation.id} className="flex flex-col gap-2">
                    <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                      <span>{observation.name ?? "Observation"}</span>
                      <span className="-mr-1">•</span>
                      <span className="inline-flex items-center gap-1">
                        <ItemBadge
                          type={observation.type ?? "EVENT"}
                          isSmall
                          className="h-3 w-3"
                        />
                        <span>
                          {String(observation.type ?? "EVENT")
                            .toLowerCase()
                            .replace(/_/g, " ")}
                        </span>
                      </span>
                      <span>•</span>
                      <span>{observation.startTime.toLocaleString()}</span>
                    </div>
                    <IOPreview
                      input={observation.input ?? undefined}
                      output={observation.output ?? undefined}
                      metadata={observation.metadata ?? undefined}
                      observationName={observation.name ?? undefined}
                      hideIfNull
                      projectId={projectId}
                      traceId={trace.id}
                      observationId={observation.id}
                      environment={
                        observation.environment ??
                        trace.environment ??
                        undefined
                      }
                      showCorrections={showCorrections}
                    />
                  </div>
                ))}
              </div>
            ) : hasActiveFilter && !showAll ? (
              <FilteredOutNotice onShowAll={() => setShowAll(true)} />
            ) : (
              <div className="text-muted-foreground p-2 text-xs">
                This trace has no observations.
              </div>
            )}
          </div>
          {!hideTracePanel && (
            <>
              <div className="bg-border hidden md:block"></div>
              <div className="flex flex-col border-t py-4 pr-4 pl-4 md:border-0">
                <div className="mb-4 flex flex-col gap-2">
                  <Link
                    href={`/project/${projectId}/traces/${trace.id}`}
                    className="hover:bg-accent flex items-start gap-2 rounded-lg border p-2 transition-colors"
                    onClick={(e) => {
                      if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
                        e.preventDefault();
                        openPeek(trace.id, trace);
                      }
                    }}
                  >
                    <ItemBadge type="TRACE" isSmall />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">
                        {trace.name ?? "Trace"} ({trace.id})&nbsp;↗
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {trace.timestamp.toLocaleString()}
                      </span>
                    </div>
                  </Link>
                  <div className="flex flex-wrap gap-2">
                    <NewDatasetItemFromTraceId
                      projectId={projectId}
                      traceId={trace.id}
                      timestamp={new Date(trace.timestamp)}
                      buttonVariant="outline"
                    />
                    <div className="flex items-start">
                      <AnnotateDrawer
                        key={"annotation-drawer" + trace.id}
                        projectId={projectId}
                        scoreTarget={{
                          type: "trace",
                          traceId: trace.id,
                        }}
                        scores={trace.scores}
                        buttonVariant="outline"
                        analyticsData={{
                          type: "trace",
                          source: "SessionDetail",
                        }}
                        scoreMetadata={{
                          projectId: projectId,
                          environment: trace.environment ?? undefined,
                        }}
                      />
                      <CreateNewAnnotationQueueItem
                        projectId={projectId}
                        objectId={trace.id}
                        objectType="TRACE"
                        variant="outline"
                      />
                    </div>
                    <CommentDrawerButton
                      projectId={projectId}
                      variant="outline"
                      objectId={trace.id}
                      objectType="TRACE"
                      count={getNumberFromMap(traceCommentCounts, trace.id)}
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <p className="mb-1 font-medium">Scores</p>
                  <div className="flex flex-wrap content-start items-start gap-1">
                    <GroupedScoreBadges scores={trace.scores} />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
    );
  },
);

TraceEventsRow.displayName = "TraceEventsRow";

const LazyTraceEventsRowInner = (props: LazyTraceEventsRowProps) => {
  const { index, ...cardProps } = props;
  const [shouldLoad, setShouldLoad] = React.useState(false);
  const internalRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!internalRef.current || shouldLoad) return;
    return observe(internalRef.current, () => setShouldLoad(true));
  }, [shouldLoad]);

  const setRowRef = React.useCallback((node: HTMLDivElement | null) => {
    internalRef.current = node;
  }, []);

  return (
    <div ref={setRowRef} className="pb-3" data-session-row-index={index}>
      {shouldLoad ? <TraceEventsRow {...cardProps} /> : <TraceEventsSkeleton />}
    </div>
  );
};

LazyTraceEventsRowInner.displayName = "LazyTraceEventsRowInner";
export const LazyTraceEventsRow = React.memo(
  LazyTraceEventsRowInner,
  areLazyTraceEventsRowPropsEqual,
);
LazyTraceEventsRow.displayName = "LazyTraceEventsRow";

const listeners = new Map<Element, () => void>();
let sharedObserver: IntersectionObserver;

function observe(element: Element, callback: () => void) {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const cb = listeners.get(entry.target);
            cb?.();
          }
        });
      },
      { rootMargin: "400px" },
    );
  }

  listeners.set(element, callback);
  sharedObserver.observe(element);

  return () => {
    listeners.delete(element);
    sharedObserver.unobserve(element);
  };
}
