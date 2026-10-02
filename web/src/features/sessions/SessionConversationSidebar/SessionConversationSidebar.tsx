import { useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Bot,
  ChevronDown,
  Search,
  Settings,
  UserRound,
  Wrench,
} from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { SessionVirtualizedRow } from "@/src/features/sessions/SessionVirtualizedRow";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import {
  formatIdleGap,
  IDLE_GAP_THRESHOLD_SECONDS,
} from "@/src/features/sessions/sessionIdleGap";
import { cn } from "@/src/utils/tailwind";

export type SessionConversationSidebarTrace = {
  trace: EventSessionTrace;
  turnNumber: number;
  idleGapSeconds: number | null;
  transcriptRows:
    | Array<{
        id: string;
        observationId: string;
        label: string;
        role: "system" | "user" | "assistant" | "tool";
      }>
    | null
    | undefined;
};

const EMPTY_TRACES: SessionConversationSidebarTrace[] = [];
const SIDEBAR_AUTO_FOLLOW_IDLE_MS = 750;

export function SessionConversationSidebar(
  props:
    | { state: "loading" }
    | {
        state: "loaded";
        traces: SessionConversationSidebarTrace[];
        activeTraceId: string | undefined;
        search: string;
        onSearchChange: (search: string) => void;
        expandedTraceIds: ReadonlySet<string>;
        onToggleTraceExpanded: (traceId: string) => void;
        onSelect: (
          index: number,
          observationId?: string,
          rowId?: string,
        ) => void;
        onVisibleTraceIdsChange: (traceIds: string[]) => void;
        isLoadingTranscripts: boolean;
        transcriptLoadError: boolean;
      },
) {
  const traces = props.state === "loaded" ? props.traces : EMPTY_TRACES;
  const activeTraceId =
    props.state === "loaded" ? props.activeTraceId : undefined;
  const listRef = useRef<HTMLDivElement>(null);
  const isSidebarPointerDownRef = useRef(false);
  const autoFollowPausedUntilRef = useRef(0);
  const virtualizer = useVirtualizer({
    count: traces.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 160,
    overscan: 5,
    getItemKey: (index) => traces[index]?.trace.id ?? index,
    onChange: (instance) => {
      if (props.state !== "loaded") return;
      props.onVisibleTraceIdsChange(
        instance.getVirtualItems().flatMap((item) => {
          const traceId = traces[item.index]?.trace.id;
          return traceId ? [traceId] : [];
        }),
      );
    },
  });
  const activeTraceIndex = activeTraceId
    ? traces.findIndex(({ trace }) => trace.id === activeTraceId)
    : -1;
  const setListElement = useCallback(
    (element: HTMLDivElement | null) => {
      listRef.current = element;
      if (
        !element ||
        activeTraceIndex === -1 ||
        isSidebarPointerDownRef.current ||
        Date.now() < autoFollowPausedUntilRef.current
      )
        return;
      // `auto` preserves the viewport when the active turn is already visible.
      virtualizer.scrollToIndex(activeTraceIndex, { align: "auto" });
    },
    [activeTraceIndex, virtualizer],
  );
  const pauseAutoFollow = () => {
    autoFollowPausedUntilRef.current = Date.now() + SIDEBAR_AUTO_FOLLOW_IDLE_MS;
  };
  const handlePointerEnd = () => {
    isSidebarPointerDownRef.current = false;
    pauseAutoFollow();
  };

  if (props.state === "loading") {
    return (
      <div
        role="complementary"
        aria-label="Session messages and tools"
        aria-busy="true"
        className="bg-background session-review-stack:border-r-0 session-review-stack:border-b relative flex h-full min-h-0 flex-col border-r"
      >
        <div className="flex shrink-0 items-center border-b px-2 py-2.5">
          <div className="bg-muted h-7 flex-1 animate-pulse rounded-sm" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-1 pt-0.5 pb-4">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="flex flex-col gap-2 rounded-sm border border-transparent p-2"
            >
              <div className="bg-muted h-3 w-3/4 animate-pulse rounded-sm" />
              <div className="bg-muted h-2.5 w-1/2 animate-pulse rounded-sm" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  let emptyLabel = "No turns";
  if (props.isLoadingTranscripts) emptyLabel = "Loading transcripts...";
  else if (props.transcriptLoadError) emptyLabel = "Failed to load transcripts";
  else if (props.search) emptyLabel = "No matching turns";

  return (
    <div
      role="complementary"
      aria-label="Session messages and tools"
      className="bg-background session-review-stack:border-r-0 session-review-stack:border-b relative flex h-full min-h-0 flex-col border-r"
    >
      <div className="shrink-0 border-b px-2 py-2.5">
        <div className="relative min-w-0">
          <Search
            className="text-foreground-tertiary absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2"
            strokeWidth={1.6}
          />
          <Input
            value={props.search}
            onChange={(event) => {
              virtualizer.scrollToOffset(0);
              props.onSearchChange(event.target.value);
            }}
            aria-label="Search messages and tools"
            placeholder="Search messages and tools"
            className="h-7 rounded-sm bg-transparent pl-7 font-mono text-xs"
          />
        </div>
      </div>
      <div
        ref={setListElement}
        role="region"
        aria-label="Session turns"
        className="min-h-0 flex-1 overflow-y-auto pt-0.5 pb-4"
        onWheel={pauseAutoFollow}
        onTouchMove={pauseAutoFollow}
        onPointerDown={() => {
          isSidebarPointerDownRef.current = true;
        }}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
      >
        {traces.length === 0 ? (
          <div className="text-muted-foreground px-3 py-6 text-center text-xs">
            {emptyLabel}
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const sidebarTrace = traces[item.index];
              if (!sidebarTrace) return null;
              const { trace, turnNumber, idleGapSeconds, transcriptRows } =
                sidebarTrace;
              const isCollapsed = !props.expandedTraceIds.has(trace.id);
              const isActive = trace.id === activeTraceId;
              return (
                <SessionVirtualizedRow
                  key={item.key}
                  itemKey={String(item.key)}
                  measurementKey={`${String(item.key)}:${isCollapsed}:${props.search}`}
                  source="modern"
                  virtualItem={item}
                  virtualizer={virtualizer}
                >
                  {props.search.trim() === "" &&
                    idleGapSeconds !== null &&
                    idleGapSeconds >= IDLE_GAP_THRESHOLD_SECONDS && (
                      <div className="my-0.5 mb-2 flex items-center bg-[repeating-linear-gradient(315deg,hsl(var(--foreground)/0.07)_0_1px,transparent_1px_5px)] px-3 py-[5px]">
                        <span className="text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                          +{formatIdleGap(idleGapSeconds)} idle
                        </span>
                      </div>
                    )}
                  <div className="px-1 pb-2">
                    <div
                      className={cn(
                        "group hover:bg-muted/60 rounded-sm border border-transparent p-2 transition-colors duration-150",
                        isActive &&
                          "border-primary-accent/50 bg-background dark:bg-muted",
                      )}
                    >
                      <div className="flex w-full items-center gap-2">
                        <button
                          type="button"
                          onClick={() => props.onSelect(turnNumber - 1)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          aria-current={isActive ? "true" : undefined}
                        >
                          <span className="border-border bg-tertiary text-foreground flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border font-mono text-[10px]">
                            {turnNumber}
                          </span>
                          <span
                            className="min-w-0 flex-1 truncate text-[13px] font-bold"
                            title={trace.name ?? "Trace"}
                          >
                            {trace.name ?? "Trace"}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={
                            isCollapsed ? "Expand turn" : "Collapse turn"
                          }
                          onClick={() => props.onToggleTraceExpanded(trace.id)}
                          className="text-muted-foreground -my-2 -mr-2.5 -ml-2 flex h-8 w-8 shrink-0 items-center justify-center"
                        >
                          <ChevronDown
                            className={cn(
                              "h-3 w-3 transition-transform duration-150",
                              isCollapsed ? "-rotate-90" : "rotate-0",
                            )}
                            strokeWidth={1.6}
                          />
                        </button>
                      </div>
                      {!isCollapsed && (
                        <div
                          className={transcriptRows?.length ? "mt-2" : "-mx-1"}
                        >
                          {transcriptRows === undefined && (
                            <div className="flex flex-col gap-1 px-1 py-2">
                              <div className="bg-muted h-3 w-3/4 animate-pulse rounded-sm" />
                              <div className="bg-muted h-3 w-1/2 animate-pulse rounded-sm" />
                            </div>
                          )}
                          {transcriptRows === null && (
                            <p className="text-muted-foreground px-1 py-2 text-xs">
                              Failed to load transcript
                            </p>
                          )}
                          {transcriptRows?.length === 0 && (
                            <p className="text-muted-foreground px-1 py-2 text-xs">
                              {props.search.trim()
                                ? "No matching messages or tools"
                                : "No messages or tools"}
                            </p>
                          )}
                          <div className="flex flex-col">
                            {transcriptRows?.map((row) => {
                              const Icon = {
                                user: UserRound,
                                assistant: Bot,
                                system: Settings,
                                tool: Wrench,
                              }[row.role];
                              return (
                                <button
                                  key={row.id}
                                  type="button"
                                  onClick={() =>
                                    props.onSelect(
                                      turnNumber - 1,
                                      row.observationId,
                                      row.id,
                                    )
                                  }
                                  className="ph-no-capture hover:bg-foreground/10 -mr-2 -ml-1 flex min-w-0 items-center gap-2 rounded-sm px-1 py-1 text-left transition-colors duration-150"
                                  aria-label={`${row.role}: ${row.label}`}
                                >
                                  <Icon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                                  <span className="text-muted-foreground shrink-0 text-[11px] font-bold capitalize">
                                    {row.role}
                                  </span>
                                  <span
                                    className="text-muted-foreground min-w-0 flex-1 truncate text-[13px]"
                                    title={row.label}
                                  >
                                    {row.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </SessionVirtualizedRow>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
