import { SessionIO } from "@/src/components/session";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
import { Card } from "@/src/components/ui/card";
import { type RouterOutputs } from "@/src/utils/api";
import { getNumberFromMap } from "@/src/utils/map-utils";
import Link from "next/link";
import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { ItemBadge } from "@/src/components/ItemBadge";
import { NewDatasetItemFromTraceId } from "@/src/components/session/NewDatasetItemFromTrace";
import { AnnotationQueueObjectType } from "@langfuse/shared";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";

// Skeleton placeholder for trace cards
const TraceSkeleton = () => {
  return (
    <Card className="border-border shadow-none">
      <div className="flex h-64 items-center justify-center p-4">
        <JsonSkeleton className="h-full w-full" numRows={8} />
      </div>
    </Card>
  );
};

// Trace card with all the heavy content (memoized to prevent unnecessary re-renders)
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
          <div className="overflow-hidden py-4 pl-4 pr-4">
            <SessionIO
              traceId={trace.id}
              projectId={projectId}
              timestamp={new Date(trace.timestamp)}
              showCorrections={showCorrections}
            />
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
                    {trace.name} ({trace.id})&nbsp;↗
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
                      environment: trace.environment,
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
TraceRow.displayName = "TraceRow";

/**
 * Progressive hydration wrapper for trace rows in virtualized lists.
 * Renders a cheap skeleton initially, then swaps to the full TraceRow when scrolled into view.
 * This prevents layout thrashing by decoupling virtualization (positioning) from heavy content rendering.
 * The virtualizer measures the skeleton first, then remeasures once after loading completes.
 */
const listeners = new Map<Element, () => void>();
let sharedObserver: IntersectionObserver;

function observe(element: Element, callback: () => void) {
  // Lazy-init the observer only once
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const cb = listeners.get(entry.target);
            cb?.(); // Run the callback
          }
        });
      },
      { rootMargin: "400px" },
    );
  }

  listeners.set(element, callback);
  sharedObserver.observe(element);

  // Return simple cleanup function
  return () => {
    listeners.delete(element);
    sharedObserver.unobserve(element);
  };
}

export const LazyTraceRow = React.forwardRef<
  HTMLDivElement,
  {
    trace: RouterOutputs["sessions"]["byIdWithScores"]["traces"][number];
    projectId: string;
    openPeek: (id: string, row: any) => void;
    index: number;
    traceCommentCounts: Map<string, number> | undefined;
    showCorrections: boolean;
    onLoad?: (index: number) => void;
  }
>((props, measureRef) => {
  const { index, onLoad: onLoad, showCorrections, ...cardProps } = props;
  const [shouldLoad, setShouldLoad] = useState(false);
  const internalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!internalRef.current || shouldLoad) return;
    return observe(internalRef.current, () => setShouldLoad(true));
  }, [shouldLoad]);

  // Notify virtualizer when content changes (fixes height)
  useLayoutEffect(() => {
    if (shouldLoad && onLoad) {
      onLoad(index);
    }
  }, [shouldLoad, onLoad, index]);

  // Merge refs (Virtualizer + Local)
  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      internalRef.current = node;
      if (typeof measureRef === "function") measureRef(node);
      else if (measureRef) measureRef.current = node;
    },
    [measureRef],
  );

  return (
    <div ref={combinedRef} className="pb-3">
      {shouldLoad ? (
        <TraceRow showCorrections={showCorrections} {...cardProps} />
      ) : (
        <TraceSkeleton />
      )}
    </div>
  );
});

LazyTraceRow.displayName = "LazyTraceRow";
