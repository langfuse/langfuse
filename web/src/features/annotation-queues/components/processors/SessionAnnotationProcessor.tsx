import {
  type AnnotationQueueItem,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import { AnnotationDrawerSection } from "../shared/AnnotationDrawerSection";
import { AnnotationProcessingLayout } from "../shared/AnnotationProcessingLayout";
import { SessionIO } from "@/src/components/session";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/src/components/ui/button";
import { ItemBadge } from "@/src/components/ItemBadge";
import { CopyIdsPopover } from "@/src/components/trace2/components/_shared/CopyIdsPopover";
import { Badge } from "@/src/components/ui/badge";
import { Separator } from "@/src/components/ui/separator";
import Link from "next/link";
import { Card } from "@/src/components/ui/card";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { api } from "@/src/utils/api";
import { IOPreview } from "@/src/components/trace2/components/IOPreview/IOPreview";
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

/**
 * V4-aware component for rendering trace I/O in annotation queue session view.
 * Uses events table via observationsForTraceFromEvents instead of traces.byId.
 */
const SessionEventsIO: React.FC<{
  traceId: string;
  projectId: string;
  sessionId: string;
}> = ({ traceId, projectId, sessionId }) => {
  const observationsQuery =
    api.sessions.observationsForTraceFromEvents.useQuery(
      {
        projectId,
        sessionId,
        traceId,
        filter: null,
      },
      {
        enabled: !!traceId,
        trpc: { context: { skipBatch: true } },
        staleTime: 60 * 1000,
      },
    );

  if (observationsQuery.isLoading) {
    return (
      <JsonSkeleton
        className="h-full w-full overflow-hidden px-2 py-1"
        numRows={4}
      />
    );
  }

  if (!observationsQuery.data || observationsQuery.data.length === 0) {
    return (
      <div className="text-muted-foreground p-2 text-xs">
        This trace has no observations.
      </div>
    );
  }

  // Find root observation (no parent) or first observation for I/O display
  const rootObservation =
    observationsQuery.data.find((o) => !o.parentObservationId) ??
    observationsQuery.data[0];

  if (!rootObservation?.input && !rootObservation?.output) {
    return (
      <div className="text-muted-foreground p-2 text-xs">
        This trace has no input or output.
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 overflow-hidden p-0">
      <IOPreview
        input={rootObservation.input ?? undefined}
        output={rootObservation.output ?? undefined}
        metadata={rootObservation.metadata ?? undefined}
        hideIfNull
        projectId={projectId}
        traceId={traceId}
        observationId={rootObservation.id}
        environment={rootObservation.environment ?? undefined}
        showCorrections
      />
    </div>
  );
};

export const SessionAnnotationProcessor: React.FC<
  SessionAnnotationProcessorProps
> = ({ item, data, configs, projectId }) => {
  const [visibleTraces, setVisibleTraces] = useState(PAGE_SIZE);
  const [currentTraceIndex, setCurrentTraceIndex] = useState(1);
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

  // Unify traces from both paths:
  // - v4 beta OFF: traces come from data.traces (byIdWithScores endpoint)
  // - v4 beta ON: traces come from separate tracesFromEvents query
  const traces = useMemo(() => {
    if (isBetaEnabled) {
      return tracesFromEventsQuery.data ?? [];
    }
    return data?.traces ?? [];
  }, [isBetaEnabled, tracesFromEventsQuery.data, data?.traces]);

  // For the "X / Y" position counter, always use traces.length since that's what we're displaying
  // For the "Total traces" badge in v4 mode, we can show countTraces while traces are loading
  const totalTracesForBadge = useMemo(() => {
    if (isBetaEnabled) {
      // Show countTraces from session metadata (available immediately),
      // or fall back to loaded traces length
      return data?.countTraces ?? traces.length;
    }
    return traces.length;
  }, [isBetaEnabled, data?.countTraces, traces.length]);

  // For the position counter "Trace X / Y", use actual loaded traces count
  const loadedTracesCount = traces.length;

  // Intersection observer to track which trace is currently in view
  useEffect(() => {
    if (traces.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const index = parseInt(
              entry.target.getAttribute("data-trace-index") || "0",
            );
            setCurrentTraceIndex(index + 1);
          }
        });
      },
      {
        threshold: 0.5, // Trigger when 50% of trace is visible
        rootMargin: "-25% 0px -25% 0px", // Focus on center area
      },
    );

    // Observe all trace cards
    const traceCards = document.querySelectorAll("[data-trace-index]");
    traceCards.forEach((card) => observer.observe(card));

    return () => observer.disconnect();
  }, [traces, visibleTraces]);

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
          {!isBetaEnabled && loadedTracesCount > 0 && (
            <div className="flex items-center">
              <Badge variant="outline" className="text-xs">
                Trace {currentTraceIndex} / {loadedTracesCount}
              </Badge>
            </div>
          )}
        </div>
        <div className="mt-2 mb-4 grid w-full min-w-0 items-center justify-between px-4">
          <div className="flex max-w-full min-w-0 shrink flex-col">
            <div className="flex max-w-full min-w-0 flex-wrap items-center gap-1">
              {data?.environment && (
                <Badge variant="tertiary">Env: {data.environment}</Badge>
              )}
              <Badge variant="outline">Total traces: {totalTracesForBadge}</Badge>
            </div>
          </div>
        </div>
        <Separator />
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          {traces.slice(0, visibleTraces).map((trace: any, index: number) => (
            <Card
              className="border-border hover:border-ring group mb-2 grid gap-2 p-2 shadow-none"
              key={trace.id}
              data-trace-index={index}
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
              {isBetaEnabled ? (
                <SessionEventsIO
                  traceId={trace.id}
                  projectId={projectId}
                  sessionId={item.objectId}
                />
              ) : (
                <SessionIO
                  traceId={trace.id}
                  projectId={projectId}
                  timestamp={trace.timestamp}
                  showCorrections
                />
              )}
            </Card>
          ))}
          {loadedTracesCount > visibleTraces && (
            <div className="flex justify-center py-4">
              <Button
                onClick={() => setVisibleTraces((prev) => prev + PAGE_SIZE)}
                variant="ghost"
              >
                {`Load ${Math.min(loadedTracesCount - visibleTraces, PAGE_SIZE)} More`}
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
