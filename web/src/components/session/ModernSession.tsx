import React, { useCallback, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight } from "lucide-react";
import { type FilterState } from "@langfuse/shared";

import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { ItemBadge } from "@/src/components/ItemBadge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { LazySessionTraceEventsRow } from "@/src/components/session/LazySessionTraceEventsRow";
import { SessionVirtualizedRow } from "@/src/components/session/SessionVirtualizedRow";
import { SessionTraceActionButtons } from "@/src/components/session/SessionTraceActionButtons";
import { TraceEventsRow } from "@/src/components/session/TraceEventsRow";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { cn } from "@/src/utils/tailwind";

const MODERN_SESSION_OVERSCAN = 5;
const EMPTY_FILTER_STATE: FilterState = [];

type OpenPeek = (id: string, row: any) => void;

type ModernSessionProps = {
  traces: EventSessionTrace[];
  projectId: string;
  sessionId: string;
  openPeek: OpenPeek;
  traceCommentCounts: Map<string, number> | undefined;
  filterState: FilterState;
  filterMeasurementKey: string;
  viewLabel: string | null;
  showInlineToolCalls: boolean;
  showSystemPrompt: boolean;
};

const ModernSessionMinimapItem = React.memo(
  ({
    trace,
    index,
    isActive,
    projectId,
    sessionId,
    traceCommentCounts,
    openPeek,
    onSelect,
  }: {
    trace: EventSessionTrace;
    index: number;
    isActive: boolean;
    projectId: string;
    sessionId: string;
    traceCommentCounts: Map<string, number> | undefined;
    openPeek: OpenPeek;
    onSelect: (index: number) => void;
  }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const observationCount = trace.observationCount ?? 0;
    const observationLabel = `${observationCount} observation${observationCount === 1 ? "" : "s"}`;

    return (
      <div
        className={cn(
          "group relative border-b border-l-2 transition-colors",
          isActive
            ? "border-l-primary bg-accent/60"
            : "hover:bg-muted/60 border-l-transparent",
        )}
        data-modern-session-minimap-active={isActive}
      >
        <button
          type="button"
          className="flex w-full min-w-0 flex-col gap-1.5 px-3 py-3 text-left"
          onClick={() =>
            isActive ? openPeek(trace.id, trace) : onSelect(index)
          }
          aria-current={isActive ? "true" : undefined}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <ItemBadge type="TRACE" isSmall />
            <span
              className="min-w-0 flex-1 truncate text-xs font-semibold"
              title={trace.name ?? "Trace"}
            >
              {trace.name ?? "Trace"}
            </span>
          </span>
          <time className="text-muted-foreground text-xs">
            {trace.timestamp.toLocaleString()}
          </time>
          <span
            className="text-muted-foreground truncate font-mono text-[11px]"
            title={trace.id}
          >
            {trace.id}
          </span>
          <span className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
            <span>{observationLabel}</span>
            <span>·</span>
            {trace.scores.length > 0 ? (
              <span>{trace.scores.length} scores</span>
            ) : (
              <span>no scores</span>
            )}
          </span>
          {isActive && trace.scores.length > 0 ? (
            <span className="flex max-h-10 flex-wrap gap-1 overflow-hidden">
              <GroupedScoreBadges scores={trace.scores} />
            </span>
          ) : null}
        </button>

        {isActive ? (
          <div
            className="px-3 pb-2"
            onClick={(event) => event.stopPropagation()}
          >
            <SessionTraceActionButtons
              projectId={projectId}
              traceId={trace.id}
              timestamp={trace.timestamp}
              environment={trace.environment}
              scores={trace.scores}
              traceCommentCounts={traceCommentCounts}
              density="compact"
              className="gap-1"
            />
          </div>
        ) : null}

        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1 px-3 py-2 text-left text-xs"
            >
              <ChevronRight
                className={cn(
                  "h-3 w-3 transition-transform",
                  isExpanded && "rotate-90",
                )}
              />
              <span>Tool calls &amp; data</span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="bg-muted/20 max-h-80 overflow-y-auto border-t px-3 py-3">
              <TraceEventsRow
                trace={trace}
                projectId={projectId}
                sessionId={sessionId}
                openPeek={openPeek}
                traceCommentCounts={undefined}
                showCorrections={false}
                filterState={EMPTY_FILTER_STATE}
                viewLabel={null}
                hideTracePanel
                surface="data"
                contentMode="data"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  },
);
ModernSessionMinimapItem.displayName = "ModernSessionMinimapItem";

const ModernSessionMinimap = React.memo(
  ({
    traces,
    activeTraceId,
    projectId,
    sessionId,
    traceCommentCounts,
    openPeek,
    onSelect,
  }: {
    traces: EventSessionTrace[];
    activeTraceId: string | undefined;
    projectId: string;
    sessionId: string;
    traceCommentCounts: Map<string, number> | undefined;
    openPeek: OpenPeek;
    onSelect: (index: number) => void;
  }) => (
    <aside className="bg-muted/10 min-h-0 overflow-y-auto border-r">
      <div className="bg-background sticky top-0 z-10 border-b px-3 py-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Traces · {traces.length}
        </span>
      </div>
      {traces.map((trace, index) => (
        <ModernSessionMinimapItem
          key={trace.id}
          trace={trace}
          index={index}
          isActive={trace.id === activeTraceId}
          projectId={projectId}
          sessionId={sessionId}
          traceCommentCounts={traceCommentCounts}
          openPeek={openPeek}
          onSelect={onSelect}
        />
      ))}
    </aside>
  ),
);
ModernSessionMinimap.displayName = "ModernSessionMinimap";

export function ModernSession({
  traces,
  projectId,
  sessionId,
  openPeek,
  traceCommentCounts,
  filterState,
  filterMeasurementKey,
  viewLabel,
  showInlineToolCalls,
  showSystemPrompt,
}: ModernSessionProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string>();
  const virtualizer = useVirtualizer({
    count: traces.length,
    getScrollElement: () => feedRef.current,
    estimateSize: () => 520,
    overscan: MODERN_SESSION_OVERSCAN,
    getItemKey: (index) => traces[index]?.id ?? index,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const scrollOffset = virtualizer.scrollOffset ?? 0;
  const activeVirtualItem =
    virtualItems.find(
      (item) => item.start <= scrollOffset + 1 && item.end > scrollOffset + 1,
    ) ?? virtualItems.find((item) => item.start > scrollOffset);
  const scrollSpyTraceId =
    traces[activeVirtualItem?.index ?? 0]?.id ?? traces[0]?.id;
  const activeTraceId = selectedTraceId ?? scrollSpyTraceId;

  const scrollToTrace = useCallback(
    (index: number) => {
      const feed = feedRef.current;
      const offset = virtualizer.getOffsetForIndex(index, "start")?.[0];
      if (!feed || offset === undefined) return;
      // TanStack retries smooth scrolls against dynamic row measurements and
      // can stop one row early. Native scrolling uses its measured target once
      // and preserves the requested smooth minimap navigation.
      feed.scrollTo({ top: offset, behavior: "smooth" });
    },
    [virtualizer],
  );

  const selectTrace = useCallback(
    (index: number) => {
      const trace = traces[index];
      if (!trace) return;
      setSelectedTraceId(trace.id);
      scrollToTrace(index);
    },
    [scrollToTrace, traces],
  );

  const restoreScrollSpy = () => setSelectedTraceId(undefined);

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[minmax(10rem,13rem)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-1">
      <ModernSessionMinimap
        traces={traces}
        activeTraceId={activeTraceId}
        projectId={projectId}
        sessionId={sessionId}
        traceCommentCounts={traceCommentCounts}
        openPeek={openPeek}
        onSelect={selectTrace}
      />
      <div
        ref={feedRef}
        className="min-h-0 overflow-y-auto scroll-smooth"
        onWheel={restoreScrollSpy}
        onTouchMove={restoreScrollSpy}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) restoreScrollSpy();
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((virtualItem) => {
            const trace = traces[virtualItem.index];
            if (!trace) return null;

            return (
              <SessionVirtualizedRow
                key={virtualItem.key}
                itemKey={String(virtualItem.key)}
                measurementKey={`${String(virtualItem.key)}:${showInlineToolCalls}:${showSystemPrompt}:${filterMeasurementKey}`}
                source="modern"
                virtualItem={virtualItem}
                virtualizer={virtualizer}
              >
                <LazySessionTraceEventsRow
                  trace={trace}
                  projectId={projectId}
                  sessionId={sessionId}
                  openPeek={openPeek}
                  traceCommentCounts={traceCommentCounts}
                  index={virtualItem.index}
                  filterState={filterState}
                  viewLabel={viewLabel}
                  surface="modern"
                  contentMode={showInlineToolCalls ? "all" : "conversation"}
                  showSystemPrompt={showSystemPrompt}
                  isActive={trace.id === activeTraceId}
                />
              </SessionVirtualizedRow>
            );
          })}
        </div>
      </div>
    </div>
  );
}
