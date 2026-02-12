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
import { AnnotationQueueObjectType, type FilterState } from "@langfuse/shared";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { IOPreview } from "@/src/components/trace2/components/IOPreview/IOPreview";
import { api } from "@/src/utils/api";

const TraceSkeleton = () => {
  return (
    <Card className="border-border shadow-none">
      <div className="flex h-64 items-center justify-center p-4">
        <JsonSkeleton className="h-full w-full" numRows={8} />
      </div>
    </Card>
  );
};

export const TraceEventsRow = React.memo(
  ({
    trace,
    projectId,
    sessionId,
    openPeek,
    traceCommentCounts,
    showCorrections,
    filterState,
  }: {
    trace: RouterOutputs["sessions"]["tracesFromEvents"][number];
    projectId: string;
    sessionId: string;
    openPeek: (id: string, row: any) => void;
    traceCommentCounts: Map<string, number> | undefined;
    showCorrections: boolean;
    filterState: FilterState;
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

    return (
      <Card className="border-border shadow-none">
        <div className="grid md:grid-cols-[1fr_1px_358px] lg:grid-cols-[1fr_1px_30rem]">
          <div className="overflow-hidden py-4 pl-4 pr-4">
            {observationsQuery.isLoading ? (
              <JsonSkeleton className="h-full w-full" numRows={8} />
            ) : observationsQuery.data && observationsQuery.data.length > 0 ? (
              <div className="flex flex-col gap-4">
                {observationsQuery.data.map((observation) => (
                  <div key={observation.id} className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
            ) : (
              <div className="p-2 text-xs text-muted-foreground">
                No observations match the current filter.
              </div>
            )}
          </div>
          <div className="hidden bg-border md:block"></div>
          <div className="flex flex-col border-t py-4 pl-4 pr-4 md:border-0">
            <div className="mb-4 flex flex-col gap-2">
              <Link
                href={`/project/${projectId}/traces/${trace.id}`}
                className="flex items-start gap-2 rounded-lg border p-2 transition-colors hover:bg-accent"
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
                  <span className="text-xs text-muted-foreground">
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
                    objectType={AnnotationQueueObjectType.TRACE}
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
        </div>
      </Card>
    );
  },
);

TraceEventsRow.displayName = "TraceEventsRow";

export const LazyTraceEventsRow = React.forwardRef<
  HTMLDivElement,
  {
    trace: RouterOutputs["sessions"]["tracesFromEvents"][number];
    projectId: string;
    sessionId: string;
    openPeek: (id: string, row: any) => void;
    index: number;
    traceCommentCounts: Map<string, number> | undefined;
    showCorrections: boolean;
    filterState: FilterState;
    onLoad?: (index: number) => void;
  }
>((props, measureRef) => {
  const { index, onLoad: onLoad, ...cardProps } = props;
  const [shouldLoad, setShouldLoad] = React.useState(false);
  const internalRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!internalRef.current || shouldLoad) return;
    return observe(internalRef.current, () => setShouldLoad(true));
  }, [shouldLoad]);

  React.useLayoutEffect(() => {
    if (shouldLoad && onLoad) {
      onLoad(index);
    }
  }, [shouldLoad, onLoad, index]);

  const combinedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      internalRef.current = node;
      if (typeof measureRef === "function") measureRef(node);
      else if (measureRef) measureRef.current = node;
    },
    [measureRef],
  );

  return (
    <div ref={combinedRef} className="pb-3" data-index={index}>
      {shouldLoad ? <TraceEventsRow {...cardProps} /> : <TraceSkeleton />}
    </div>
  );
});

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
