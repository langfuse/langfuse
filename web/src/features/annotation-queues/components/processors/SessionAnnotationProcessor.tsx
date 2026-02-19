import {
  type AnnotationQueueItem,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import { AnnotationDrawerSection } from "../shared/AnnotationDrawerSection";
import { AnnotationProcessingLayout } from "../shared/AnnotationProcessingLayout";
import { SessionIO } from "@/src/components/session";
import { useState, useEffect } from "react";
import { Button } from "@/src/components/ui/button";
import { ItemBadge } from "@/src/components/ItemBadge";
import { CopyIdsPopover } from "@/src/components/trace2/components/_shared/CopyIdsPopover";
import { Badge } from "@/src/components/ui/badge";
import { Separator } from "@/src/components/ui/separator";
import Link from "next/link";
import { Card } from "@/src/components/ui/card";

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

export const SessionAnnotationProcessor: React.FC<
  SessionAnnotationProcessorProps
> = ({ item, data, configs, projectId }) => {
  const [visibleTraces, setVisibleTraces] = useState(PAGE_SIZE);
  const [currentTraceIndex, setCurrentTraceIndex] = useState(1);

  // Intersection observer to which trace is currently in view
  useEffect(() => {
    if (!data?.traces) return;

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
  }, [data?.traces, visibleTraces]);

  const leftPanel = (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sticky Header */}
      <div className="flex-shrink-0 bg-background">
        <div className="mt-3 grid w-full grid-cols-[auto,auto] items-start justify-between gap-2 px-4">
          <div className="flex w-full flex-row items-start gap-1">
            <div className="mt-1.5">
              <ItemBadge type="SESSION" isSmall />
            </div>
            <span className="mb-0 ml-1 line-clamp-2 min-w-0 break-all font-medium md:break-normal md:break-words">
              {item.objectId}
            </span>
            <CopyIdsPopover
              idItems={[{ id: item.objectId, name: "Session ID" }]}
            />
          </div>
          {data?.traces && (
            <div className="flex items-center">
              <Badge variant="outline" className="text-xs">
                Trace {currentTraceIndex} / {data.traces.length}
              </Badge>
            </div>
          )}
        </div>
        <div className="mb-4 mt-2 grid w-full min-w-0 items-center justify-between px-4">
          <div className="flex min-w-0 max-w-full flex-shrink flex-col">
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
              {data.environment && (
                <Badge variant="tertiary">Env: {data.environment}</Badge>
              )}
              <Badge variant="outline">
                Total traces: {data?.traces.length}
              </Badge>
            </div>
          </div>
        </div>
        <Separator />
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          {data?.traces
            .slice(0, visibleTraces)
            .map((trace: any, index: number) => (
              <Card
                className="group mb-2 grid gap-2 border-border p-2 shadow-none hover:border-ring"
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
                  <div className="text-xs text-muted-foreground">
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
          {data?.traces && data.traces.length > visibleTraces && (
            <div className="flex justify-center py-4">
              <Button
                onClick={() => setVisibleTraces((prev) => prev + PAGE_SIZE)}
                variant="ghost"
              >
                {`Load ${Math.min(data.traces.length - visibleTraces, PAGE_SIZE)} More`}
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
