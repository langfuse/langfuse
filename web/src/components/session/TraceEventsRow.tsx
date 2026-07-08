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
import { FilterX } from "lucide-react";
import isEqual from "lodash/isEqual";
import { SESSION_DETAIL_VIEW_TRIGGER_ID } from "@/src/components/session/session-detail-presets";

const hasContent = (value: unknown): boolean =>
  value !== null &&
  value !== undefined &&
  !(typeof value === "string" && value.trim() === "");

const observationHasIO = (observation: {
  input?: unknown;
  output?: unknown;
}): boolean => hasContent(observation.input) || hasContent(observation.output);

// Opens the session-detail "View" drawer by activating its trigger — the empty
// notice's action routes through the one shared View control (no per-card state).
const openSessionViewMenu = () => {
  if (typeof document === "undefined") return;
  const trigger = document.getElementById(SESSION_DETAIL_VIEW_TRIGGER_ID);
  if (trigger instanceof HTMLElement) trigger.click();
};

/**
 * LFE-10520 — replaces the silent "No observations match the current filter."
 * empty state. When the selected view (the single source of truth) matches
 * nothing in a trace, this says so explicitly instead of rendering a blank
 * card. It is purely informational: to see the trace's content the user
 * switches the view above — there is no per-card state.
 */
const ViewMismatchNotice = ({ viewLabel }: { viewLabel: string | null }) => (
  <div className="flex flex-col items-start gap-1.5 rounded-md border border-dashed border-amber-500/50 bg-amber-500/5 p-3">
    <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-500">
      <FilterX className="h-3.5 w-3.5 shrink-0" />
      {viewLabel
        ? `No observation matches the "${viewLabel}" view in this trace`
        : "No observation matches the current filter in this trace"}
    </div>
    <p className="text-muted-foreground text-xs">
      Its content is hidden by the current view, not missing.{" "}
      <button
        type="button"
        onClick={openSessionViewMenu}
        className="text-primary underline underline-offset-2 hover:no-underline"
      >
        Switch the view
      </button>{" "}
      to see it.
    </p>
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
  /** Selected view's display name, for the empty-state notice (null = custom). */
  viewLabel: string | null;
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
  previous.viewLabel === next.viewLabel &&
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
    viewLabel,
    hideTracePanel = false,
  }: {
    trace: RouterOutputs["sessions"]["tracesFromEvents"][number];
    projectId: string;
    sessionId: string;
    openPeek: (id: string, row: any) => void;
    traceCommentCounts: Map<string, number> | undefined;
    showCorrections: boolean;
    filterState: FilterState;
    viewLabel: string | null;
    hideTracePanel?: boolean;
  }) => {
    const observationsQuery =
      api.sessions.observationsForTraceFromEvents.useQuery(
        {
          projectId,
          sessionId,
          traceId: trace.id,
          filter: filterState,
        },
        {
          enabled: typeof trace.id === "string",
          trpc: { context: { skipBatch: true } },
          staleTime: 60 * 1000,
        },
      );

    // What each card shows is determined by the selected view (LFE-10520): the
    // server applies the view's FilterState (incl. the "with I/O" view's
    // Has-Input-or-Output filter). The only client-side shaping is dropping the
    // synthetic trace-level row (id `t-<traceId>`, the canonical synthetic-span
    // id — see handleEventPropagationJob). It is identified by id, NOT an empty
    // parent: OTel/internal-tracing roots also have an empty parent but are real
    // observations. It is dropped when redundant — empty, or a real observation
    // already shows its (non-empty) input OR output — so a chat turn (the
    // GENERATION carries the same assistant output) and the common auto-derived
    // case render one card, not two. It is KEPT only when it carries
    // trace-level I/O that no observation shows (a v3-migrated trace can set
    // trace I/O apart from any observation; dropping it would lose content and
    // blind the annotation queue, which hides the trace panel).
    const observations = observationsQuery.data;
    const visibleObservations = React.useMemo(() => {
      if (!observations) return undefined;
      const syntheticTraceRowId = `t-${trace.id}`;
      const syntheticRow = observations.find(
        (observation) => observation.id === syntheticTraceRowId,
      );
      const realObservations = observations.filter(
        (observation) => observation.id !== syntheticTraceRowId,
      );
      const syntheticRowIsRedundant =
        !syntheticRow ||
        !observationHasIO(syntheticRow) ||
        realObservations.some(
          (observation) =>
            (hasContent(syntheticRow.input) &&
              isEqual(observation.input, syntheticRow.input)) ||
            (hasContent(syntheticRow.output) &&
              isEqual(observation.output, syntheticRow.output)),
        );
      if (!syntheticRowIsRedundant) return observations;
      return realObservations.length > 0 ? realObservations : observations;
    }, [observations, trace.id]);

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
            ) : observations &&
              observations.length === 0 &&
              filterState.length === 0 ? (
              // No filter and the trace genuinely has no observations.
              <div className="text-muted-foreground p-2 text-xs">
                This trace has no observations.
              </div>
            ) : (
              // The selected view/filter matched nothing (or hid the only
              // observations, e.g. "with I/O" on a trace with none) — say so.
              <ViewMismatchNotice viewLabel={viewLabel} />
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
