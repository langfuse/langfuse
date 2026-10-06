import { useCallback, useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { SessionVirtualizedRow } from "@/src/features/sessions/SessionVirtualizedRow";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import {
  formatIdleGap,
  IDLE_GAP_THRESHOLD_SECONDS,
} from "@/src/features/sessions/sessionIdleGap";
import { cn } from "@/src/utils/tailwind";
import { groupConsecutiveTools } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/fns/groupConsecutiveTools";

export type SessionConversationSidebarTrace = {
  itemId?: string;
  itemIndex?: number;
  displayNumber?: string;
  threadNumber?: number;
  trace: EventSessionTrace;
  turnNumber: number;
  idleGapSeconds: number | null;
  threadCount?: number;
  hiddenThreadCount?: number;
  transcriptRows:
    | Array<{
        id: string;
        threadIndex?: number;
        observationId: string;
        label: string;
        role: "system" | "user" | "assistant" | "tool";
        toolGroupId?: string;
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
    getItemKey: (index) =>
      traces[index]?.itemId ?? traces[index]?.trace.id ?? index,
    onChange: (instance) => {
      if (props.state !== "loaded") return;
      props.onVisibleTraceIdsChange([
        ...new Set(
          instance.getVirtualItems().flatMap((item) => {
            const traceId = traces[item.index]?.trace.id;
            return traceId ? [traceId] : [];
          }),
        ),
      ]);
    },
  });
  const activeTraceIndex = activeTraceId
    ? traces.findIndex(
        ({ trace, itemId }) => (itemId ?? trace.id) === activeTraceId,
      )
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
        <div className="shrink-0 border-b px-2 py-2.5">
          <div className="relative min-w-0">
            <Search className="icon-base text-foreground-tertiary absolute top-1/2 left-2 -translate-y-1/2" />
            <Input
              disabled
              value=""
              aria-label="Search messages and tools"
              placeholder="Search messages and tools"
              className="h-7 rounded-sm bg-transparent pl-7 font-mono text-xs"
            />
          </div>
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

  const searchQuery = props.search.trim();
  const emptyLabel = (() => {
    if (props.isLoadingTranscripts) return "Loading transcripts...";
    if (props.transcriptLoadError) return "Failed to load transcripts";
    if (props.search) return "No matching turns";
    return "No turns";
  })();

  return (
    <div
      role="complementary"
      aria-label="Session messages and tools"
      className="bg-background session-review-stack:border-r-0 session-review-stack:border-b relative flex h-full min-h-0 flex-col border-r"
    >
      <div className="shrink-0 border-b px-2 py-2.5">
        <div className="relative min-w-0">
          <Search className="icon-base text-foreground-tertiary absolute top-1/2 left-2 -translate-y-1/2" />
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
        className="min-h-0 flex-1 overflow-y-auto pt-2.5 pb-4"
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
              const itemId = sidebarTrace.itemId ?? trace.id;
              const targetIndex = sidebarTrace.itemIndex ?? turnNumber - 1;
              const isCollapsed = !props.expandedTraceIds.has(itemId);
              const isActive = itemId === activeTraceId;
              const threads = new Map<
                number,
                NonNullable<SessionConversationSidebarTrace["transcriptRows"]>
              >();
              for (const row of transcriptRows ?? []) {
                const threadIndex = row.threadIndex ?? 0;
                const threadRows = threads.get(threadIndex);
                if (threadRows) threadRows.push(row);
                else threads.set(threadIndex, [row]);
              }
              const showThreadHeaders =
                !sidebarTrace.itemId &&
                (sidebarTrace.threadCount ?? threads.size) > 1;
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
                  <div className="px-2 pb-2">
                    <div
                      className={cn(
                        "group border-border/50 hover:bg-muted/60 rounded-sm border p-2 transition-colors duration-150",
                        isActive &&
                          "border-primary-accent/50 bg-background dark:bg-muted",
                      )}
                    >
                      <div className="flex w-full items-center gap-2">
                        <button
                          type="button"
                          onClick={() => props.onSelect(targetIndex)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          aria-current={isActive ? "true" : undefined}
                        >
                          <span className="border-border bg-tertiary text-foreground flex h-4 min-w-4 shrink-0 items-center justify-center rounded-sm border px-0.5 font-mono text-[10px]">
                            {sidebarTrace.displayNumber ?? turnNumber}
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
                          onClick={() => props.onToggleTraceExpanded(itemId)}
                          className="text-muted-foreground -my-2 -mr-2.5 -ml-2 flex h-8 w-8 shrink-0 items-center justify-center"
                        >
                          <ChevronDown
                            className={cn(
                              "icon-sm transition-transform duration-150",
                              isCollapsed ? "-rotate-90" : "rotate-0",
                            )}
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
                            {Array.from(threads, ([threadIndex, rows]) => (
                              <section
                                key={threadIndex}
                                aria-label={
                                  showThreadHeaders
                                    ? `Thread ${threadIndex + 1}`
                                    : undefined
                                }
                                className={cn(
                                  "flex min-w-0 flex-col",
                                  showThreadHeaders &&
                                    "border-border mt-2 border-t pt-2 first:mt-0 first:border-t-0 first:pt-0",
                                )}
                              >
                                {showThreadHeaders && (
                                  <h4 className="text-muted-foreground pb-1 text-xs font-bold">
                                    Thread {threadIndex + 1}
                                  </h4>
                                )}
                                {groupConsecutiveTools(rows, {
                                  isTool: (row) =>
                                    props.search.trim() === "" &&
                                    row.role === "tool",
                                  getBoundary: (row) => row.toolGroupId,
                                }).map((group, groupIndex, groups) => {
                                  if (group.type === "tools") {
                                    const firstTool = group.rows[0]!;
                                    return (
                                      <CustomTooltip
                                        key={firstTool.id}
                                        placement="right"
                                        delay={200}
                                        content={
                                          <div className="flex flex-col gap-2">
                                            <h4 className="text-sm font-bold">
                                              Tool calls
                                            </h4>
                                            <div className="text-muted-foreground whitespace-pre-line">
                                              {group.rows
                                                .map((row) => row.label)
                                                .join("\n")}
                                            </div>
                                          </div>
                                        }
                                      >
                                        {({ getTriggerProps }) => (
                                          <button
                                            {...getTriggerProps()}
                                            type="button"
                                            aria-label={`Tools: ${group.summary}`}
                                            onClick={() =>
                                              props.onSelect(
                                                targetIndex,
                                                firstTool.observationId,
                                                firstTool.id,
                                              )
                                            }
                                            className="ph-no-capture text-muted-foreground hover:bg-foreground/10 -mr-2 -ml-1 flex min-w-0 items-center gap-2 rounded-sm px-1 py-1 text-left text-[13px] transition-colors duration-150"
                                          >
                                            <span
                                              className="min-w-0 flex-1 truncate"
                                              title={group.summary}
                                            >
                                              {group.summary}
                                            </span>
                                          </button>
                                        )}
                                      </CustomTooltip>
                                    );
                                  }
                                  const row = group.row;
                                  const previousGroup = groups[groupIndex - 1];
                                  if (
                                    !searchQuery &&
                                    row.role !== "tool" &&
                                    previousGroup?.type === "row" &&
                                    previousGroup.row.role === row.role
                                  )
                                    return null;
                                  let messageCount = 1;
                                  if (!searchQuery && row.role !== "tool") {
                                    for (
                                      let index = groupIndex + 1;
                                      index < groups.length;
                                      index++
                                    ) {
                                      const nextGroup = groups[index]!;
                                      if (
                                        nextGroup.type !== "row" ||
                                        nextGroup.row.role !== row.role
                                      )
                                        break;
                                      messageCount++;
                                    }
                                  }
                                  const messageLabel = {
                                    user: "User message",
                                    assistant: "Assistant message",
                                    system: "System message",
                                    tool: `Tool: ${row.label}`,
                                  }[row.role];
                                  const label =
                                    messageCount === 1
                                      ? messageLabel
                                      : `${messageCount} ${messageLabel}s`;
                                  const excerpt: ReactNode[] = [];
                                  if (searchQuery) {
                                    const normalizedQuery =
                                      searchQuery.toLowerCase();
                                    const matchIndex = row.label
                                      .toLowerCase()
                                      .indexOf(normalizedQuery);
                                    const start =
                                      row.role === "tool"
                                        ? 0
                                        : Math.max(0, matchIndex - 24);
                                    const end =
                                      row.role === "tool"
                                        ? row.label.length
                                        : Math.min(
                                            row.label.length,
                                            start +
                                              Math.max(
                                                120,
                                                searchQuery.length + 48,
                                              ),
                                          );
                                    const text = row.label.slice(start, end);
                                    const normalizedText = text.toLowerCase();
                                    if (start > 0) excerpt.push("…");
                                    let position = 0;
                                    while (position < text.length) {
                                      const nextMatch = normalizedText.indexOf(
                                        normalizedQuery,
                                        position,
                                      );
                                      if (nextMatch === -1) {
                                        excerpt.push(text.slice(position));
                                        break;
                                      }
                                      excerpt.push(
                                        text.slice(position, nextMatch),
                                      );
                                      excerpt.push(
                                        <mark
                                          key={nextMatch}
                                          className="bg-find-match-background text-foreground"
                                        >
                                          {text.slice(
                                            nextMatch,
                                            nextMatch + searchQuery.length,
                                          )}
                                        </mark>,
                                      );
                                      position = nextMatch + searchQuery.length;
                                    }
                                    if (end < row.label.length)
                                      excerpt.push("…");
                                  }
                                  return (
                                    <button
                                      key={row.id}
                                      type="button"
                                      onClick={() =>
                                        props.onSelect(
                                          targetIndex,
                                          row.observationId,
                                          row.id,
                                        )
                                      }
                                      className="ph-no-capture hover:bg-foreground/10 -mr-2 -ml-1 flex min-w-0 items-center gap-2 rounded-sm px-1 py-1 text-left transition-colors duration-150"
                                      aria-label={
                                        row.role === "tool"
                                          ? `tool: ${row.label}`
                                          : label
                                      }
                                    >
                                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <span
                                          className="text-muted-foreground truncate text-[13px]"
                                          title={label}
                                        >
                                          {row.role === "tool" &&
                                          searchQuery ? (
                                            <>
                                              Tool:{" "}
                                              <span className="italic">
                                                {excerpt}
                                              </span>
                                            </>
                                          ) : (
                                            label
                                          )}
                                        </span>
                                        {searchQuery && row.role !== "tool" && (
                                          <span className="text-muted-foreground line-clamp-2 text-xs break-words whitespace-normal italic">
                                            {excerpt}
                                          </span>
                                        )}
                                      </span>
                                    </button>
                                  );
                                })}
                              </section>
                            ))}
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
