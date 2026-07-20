import { SessionIO } from "@/src/components/session";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
import { Card } from "@/src/components/ui/card";
import { type RouterOutputs } from "@/src/utils/api";
import { getNumberFromMap } from "@/src/utils/map-utils";
import Link from "next/link";
import React, { useEffect, useCallback, useRef } from "react";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { ItemBadge } from "@/src/components/ItemBadge";
import { NewDatasetItemFromTraceId } from "@/src/components/session/NewDatasetItemFromTrace";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { useSessionDetailStore } from "@/src/components/session/SessionDetailStoreProvider";

const TraceSkeleton = () => {
  return (
    <Card className="border-border shadow-none">
      <div className="flex h-64 items-center justify-center p-4">
        <JsonSkeleton className="h-full w-full" numRows={8} />
      </div>
    </Card>
  );
};

type LazyTraceRowProps = {
  trace: RouterOutputs["sessions"]["byIdWithScores"]["traces"][number];
  projectId: string;
  openPeek: (id: string, row: any) => void;
  index: number;
  traceCommentCounts: Map<string, number> | undefined;
};

const areLazyTraceRowPropsEqual = (
  previous: LazyTraceRowProps,
  next: LazyTraceRowProps,
) =>
  previous.trace === next.trace &&
  previous.projectId === next.projectId &&
  previous.openPeek === next.openPeek &&
  previous.index === next.index &&
  previous.traceCommentCounts === next.traceCommentCounts;

const TraceRow = React.memo(
  ({
    trace,
    projectId,
    openPeek,
    traceCommentCounts,
    showCorrections,
  }: {
    trace: RouterOutputs["sessions"]["byIdWithScores"]["traces"][number];
    projectId: string;
    openPeek: (id: string, row: any) => void;
    traceCommentCounts: Map<string, number> | undefined;
    showCorrections: boolean;
  }) => {
    return (
      <Card className="border-border shadow-none">
        <div className="grid md:grid-cols-[1fr_1px_358px] lg:grid-cols-[1fr_1px_30rem]">
          <div className="overflow-hidden py-4 pr-4 pl-4">
            <SessionIO
              traceId={trace.id}
              projectId={projectId}
              timestamp={new Date(trace.timestamp)}
              environment={trace.environment}
              showCorrections={showCorrections}
            />
          </div>
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
                {/* min-w-0 + wrap-break-word: an unbroken long trace name
                    must wrap inside the panel, not escape the card */}
                <div className="flex min-w-0 flex-col">
                  <span className="text-xs font-bold wrap-break-word">
                    {trace.name} ({trace.id})&nbsp;↗
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
                      environment: trace.environment,
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
              <p className="mb-1 font-bold">Scores</p>
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
TraceRow.displayName = "TraceRow";

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

const LazyTraceRowInner = (props: LazyTraceRowProps) => {
  const { index, ...cardProps } = props;
  const shouldLoad = useSessionDetailStore((state) =>
    Boolean(state.loadedTraceIds[props.trace.id]),
  );
  const showCorrections = useSessionDetailStore(
    (state) => state.showCorrections,
  );
  const markTraceLoaded = useSessionDetailStore(
    (state) => state.actions.markTraceLoaded,
  );
  const internalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!internalRef.current || shouldLoad) return;
    return observe(internalRef.current, () => markTraceLoaded(props.trace.id));
  }, [markTraceLoaded, shouldLoad, props.trace.id]);

  const setRowRef = useCallback((node: HTMLDivElement | null) => {
    internalRef.current = node;
  }, []);

  return (
    <div ref={setRowRef} className="pb-3" data-session-row-index={index}>
      {shouldLoad ? (
        <TraceRow showCorrections={showCorrections} {...cardProps} />
      ) : (
        <TraceSkeleton />
      )}
    </div>
  );
};

LazyTraceRowInner.displayName = "LazyTraceRowInner";
export const LazyTraceRow = React.memo(
  LazyTraceRowInner,
  areLazyTraceRowPropsEqual,
);
LazyTraceRow.displayName = "LazyTraceRow";
