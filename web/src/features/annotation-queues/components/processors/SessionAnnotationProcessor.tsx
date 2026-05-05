import {
  type AnnotationQueueItem,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import { AnnotationDrawerSection } from "../shared/AnnotationDrawerSection";
import { AnnotationProcessingLayout } from "../shared/AnnotationProcessingLayout";
import { SessionIO } from "@/src/components/session";
import { LazyTraceEventsRow } from "@/src/components/session/TraceEventsRow";
import { useState, useMemo, useCallback } from "react";
import { Button } from "@/src/components/ui/button";
import { ItemBadge } from "@/src/components/ItemBadge";
import { CopyIdsPopover } from "@/src/components/trace2/components/_shared/CopyIdsPopover";
import { Badge } from "@/src/components/ui/badge";
import { Separator } from "@/src/components/ui/separator";
import Link from "next/link";
import { Card } from "@/src/components/ui/card";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { api } from "@/src/utils/api";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";

interface SessionAnnotationProcessorProps {
  item: AnnotationQueueItem & {
    parentTraceId?: string | null;
    lockedByUser: { name: string | null | undefined } | null;
  };
  data: any; // // Session data with scores
  configs: ScoreConfigDomain[];
  projectId: string;
}

// some projects have thousands of traces in a session, paginate to avoid rendering all at once
const PAGE_SIZE = 10;

// Stable empty array to avoid creating new references on every render (defeats React.memo)
const EMPTY_FILTER_STATE: [] = [];

export const SessionAnnotationProcessor: React.FC<
  SessionAnnotationProcessorProps
> = ({ item, data, configs, projectId }) => {
  const [visibleTraces, setVisibleTraces] = useState(PAGE_SIZE);
  const { isBetaEnabled } = useV4Beta();

  // Fetch traces separately when v4 beta is enabled (events table path)
  // The byIdWithScoresFromEvents endpoint doesn't include traces array
  const tracesFromEventsQuery = api.sessions.tracesFromEvents.useQuery(
    { projectId, sessionId: item.objectId },
    {
      enabled: isBetaEnabled,
      retry(failureCount, error) {
        if (
          error.data?.code === "UNAUTHORIZED" ||
          error.data?.code === "NOT_FOUND"
        )
          return false;
        return failureCount < 3;
      },
    },
  );

  const traceCommentCounts =
    api.comments.getTraceCommentCountsBySessionId.useQuery(
      {
        projectId,
        sessionId: item.objectId,
      },
      { enabled: isBetaEnabled },
    );

  // Unify traces from both paths:
  // - v4 beta OFF: traces come from data.traces (byIdWithScores endpoint)
  // - v4 beta ON: traces come from separate tracesFromEvents query
  const traces = useMemo(() => {
    if (isBetaEnabled) {
      return tracesFromEventsQuery.data ?? [];
    }
    return data?.traces ?? [];
  }, [isBetaEnabled, tracesFromEventsQuery.data, data?.traces]);

  // For the "Total traces" badge, show countTraces from session metadata when available (v4),
  // or fall back to loaded traces length
  const totalTracesForBadge = useMemo(() => {
    if (isBetaEnabled) {
      return data?.countTraces ?? traces.length;
    }
    return traces.length;
  }, [isBetaEnabled, data?.countTraces, traces.length]);

  // Stable callback to avoid creating new function reference on every render (defeats React.memo)
  const openPeek = useCallback(
    (traceId: string) => {
      window.open(`/project/${projectId}/traces/${traceId}`, "_blank");
    },
    [projectId],
  );

  const leftPanel = (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sticky Header */}
      <div className="bg-background shrink-0">
        <div className="mt-3 grid w-full grid-cols-[auto_auto] items-start justify-between gap-2 px-4">
          <div className="flex w-full flex-row items-start gap-1">
            <div className="mt-1.5">
              <ItemBadge type="SESSION" isSmall />
            </div>
            <span className="mb-0 ml-1 line-clamp-2 min-w-0 font-medium break-all md:break-normal md:wrap-break-word">
              {item.objectId}
            </span>
            <CopyIdsPopover
              idItems={[{ id: item.objectId, name: "Session ID" }]}
            />
          </div>
        </div>
        <div className="mt-2 mb-4 grid w-full min-w-0 items-center justify-between px-4">
          <div className="flex max-w-full min-w-0 shrink flex-col">
            <div className="flex max-w-full min-w-0 flex-wrap items-center gap-1">
              {data?.environment && (
                <Badge variant="tertiary">Env: {data.environment}</Badge>
              )}
              <Badge variant="outline">
                Total traces: {totalTracesForBadge}
              </Badge>
            </div>
          </div>
        </div>
        <Separator />
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          {/* Loading state for v4 beta traces */}
          {isBetaEnabled && tracesFromEventsQuery.isLoading && (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card
                  key={i}
                  className="border-border mb-2 grid gap-2 p-2 shadow-none"
                >
                  <JsonSkeleton
                    className="h-full w-full overflow-hidden"
                    numRows={4}
                  />
                </Card>
              ))}
            </div>
          )}
          {/* Error state for v4 beta traces */}
          {isBetaEnabled && tracesFromEventsQuery.isError && (
            <div className="text-destructive p-2 text-sm">
              Failed to load traces for this session.
            </div>
          )}
          {/* Trace list - v4 path uses LazyTraceEventsRow for deferred loading */}
          {isBetaEnabled &&
            tracesFromEventsQuery.isSuccess &&
            traces
              .slice(0, visibleTraces)
              .map((trace: any, index: number) => (
                <LazyTraceEventsRow
                  key={trace.id}
                  trace={trace}
                  projectId={projectId}
                  sessionId={item.objectId}
                  openPeek={openPeek}
                  traceCommentCounts={traceCommentCounts.data ?? undefined}
                  showCorrections
                  filterState={EMPTY_FILTER_STATE}
                  hideTracePanel
                  index={index}
                />
              ))}
          {/* Trace list - v3 path uses SessionIO */}
          {!isBetaEnabled &&
            traces.slice(0, visibleTraces).map((trace: any) => (
              <Card
                className="border-border hover:border-ring group mb-2 grid gap-2 p-2 shadow-none"
                key={trace.id}
              >
                <div className="-mt-1 p-1 pt-0 opacity-50 transition-opacity group-hover:opacity-100">
                  <Link
                    href={`/project/${projectId}/traces/${trace.id}`}
                    className="text-xs hover:underline"
                  >
                    Trace: {trace.name} ({trace.id})&nbsp;↗
                  </Link>
                  <div className="text-muted-foreground text-xs">
                    {trace.timestamp.toLocaleString()}
                  </div>
                </div>
                <SessionIO
                  traceId={trace.id}
                  projectId={projectId}
                  timestamp={trace.timestamp}
                  showCorrections
                />
              </Card>
            ))}
          {(!isBetaEnabled || tracesFromEventsQuery.isSuccess) &&
            traces.length > visibleTraces && (
              <div className="flex justify-center py-4">
                <Button
                  onClick={() => setVisibleTraces((prev) => prev + PAGE_SIZE)}
                  variant="ghost"
                >
                  {`Load ${Math.min(traces.length - visibleTraces, PAGE_SIZE)} More`}
                </Button>
              </div>
            )}
        </div>
      </div>
    </div>
  );

  const rightPanel = (
    <AnnotationDrawerSection
      item={item}
      scoreTarget={{
        type: "session",
        sessionId: item.objectId,
      }}
      scores={data?.scores ?? []}
      configs={configs}
      environment={data?.environment}
    />
  );

  return (
    <AnnotationProcessingLayout
      leftPanel={leftPanel}
      rightPanel={rightPanel}
      projectId={projectId}
    />
  );
};
