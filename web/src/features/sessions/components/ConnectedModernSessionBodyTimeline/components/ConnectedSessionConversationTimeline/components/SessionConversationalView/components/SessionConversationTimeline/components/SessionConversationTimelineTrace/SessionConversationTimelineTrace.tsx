import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  MessageSquareOff,
} from "@langfuse/icons";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";
import { SessionTranscriptContent } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/components/SessionTranscriptContent/SessionTranscriptContent";
import { type SessionTraceTranscriptState } from "@/src/features/sessions/hooks/useSessionTraceTranscripts";
import { getSessionTranscriptThreads } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionTranscriptThreads";

type PreparedSessionConversationTimelineTraceState =
  | { type: "loading" }
  | { type: "error" }
  | { type: "empty" }
  | {
      type: "transcript";
      result: Extract<SessionTraceTranscriptState, { state: "loaded" }>;
    };

export function SessionConversationTimelineTrace({
  trace,
  turnNumber,
  state,
  onOpenTrace,
  onOpenObservation,
  scrollTarget,
  itemId,
  threadIndex,
  displayNumber,
  threadCount,
  variant = "session",
  includeNestedThreads = false,
  isCollapsed = false,
  onToggleCollapsed,
}: {
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  includeNestedThreads?: boolean;
  variant?: "session" | "single-trace";
  itemId?: string;
  threadIndex?: number;
  threadNumber?: number;
  displayNumber?: string;
  threadCount?: number;
  trace: Pick<EventSessionTrace, "id" | "name">;
  turnNumber: number;
  state: PreparedSessionConversationTimelineTraceState;
  onOpenTrace: () => void;
  onOpenObservation: (observationId: string) => void;
  scrollTarget: {
    itemId?: string;
    observationId: string;
    rowId?: string;
    requestId: number;
  } | null;
}) {
  const { visibleThreads, hiddenThreadCount } =
    state.type === "transcript"
      ? getSessionTranscriptThreads(
          state.result.transcript,
          includeNestedThreads,
        )
      : { visibleThreads: [], hiddenThreadCount: 0 };
  const visibleThreadIndex = visibleThreads.findIndex(
    (thread) => thread.threadIndex === threadIndex,
  );
  const showHeader =
    variant === "session" ? visibleThreadIndex <= 0 : (threadCount ?? 0) > 1;
  const showThreadHeader =
    variant === "session" &&
    visibleThreads.length > 1 &&
    visibleThreadIndex >= 0;
  return (
    <div
      className={cn(
        variant === "single-trace" ? "p-0" : "px-4 sm:px-6 lg:px-10",
        variant === "session" && !isCollapsed && "pb-8",
      )}
      data-session-trace-id={trace.id}
      data-session-item-id={itemId}
    >
      {showHeader && (
        <div
          className={cn(
            "group/trace-header flex items-center gap-3 pt-4",
            isCollapsed && "pb-1",
            !isCollapsed && (showThreadHeader ? "mb-3" : "mb-6"),
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative shrink-0">
              <span
                className={cn(
                  "border-border bg-tertiary text-foreground flex h-4 min-w-4 items-center justify-center rounded-sm border px-0.5 font-mono text-[10px]",
                  variant === "session" &&
                    onToggleCollapsed &&
                    "group-focus-within/trace-header:invisible group-hover/trace-header:invisible",
                )}
              >
                {variant === "session"
                  ? turnNumber
                  : (displayNumber ?? turnNumber)}
              </span>
              {variant === "session" && onToggleCollapsed && (
                <button
                  type="button"
                  onClick={onToggleCollapsed}
                  aria-expanded={!isCollapsed}
                  aria-label={`${isCollapsed ? "Expand" : "Collapse"} trace ${trace.name ?? "Trace"}`}
                  className="text-muted-foreground hover:text-foreground ph-no-capture absolute -inset-1 flex items-center justify-center opacity-0 group-focus-within/trace-header:opacity-100 group-hover/trace-header:opacity-100"
                >
                  {isCollapsed ? (
                    <ChevronRight size="base" />
                  ) : (
                    <ChevronDown size="base" />
                  )}
                </button>
              )}
            </div>
            <button
              type="button"
              className="text-foreground hover:text-primary ph-no-capture flex min-w-0 items-center gap-2 text-sm font-bold transition-colors"
              onClick={onOpenTrace}
              title={`${trace.name ?? "Trace"} (${trace.id})`}
            >
              <span className="truncate" title={trace.name ?? "Trace"}>
                <span data-session-search-content>{trace.name ?? "Trace"}</span>
              </span>
            </button>
          </div>
          <div className="border-border min-w-0 flex-1 border-t border-dashed" />
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground hidden shrink-0 font-mono text-xs group-focus-within/trace-header:block group-hover/trace-header:block hover:underline"
            onClick={onOpenTrace}
          >
            Open trace
          </button>
          {variant === "session" && hiddenThreadCount > 0 && (
            <Tooltip
              label={`${hiddenThreadCount} nested ${hiddenThreadCount === 1 ? "thread" : "threads"} hidden`}
            >
              {({ getTriggerProps }) => (
                <button
                  {...getTriggerProps()}
                  type="button"
                  className="bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors"
                  aria-label={`${hiddenThreadCount} nested ${hiddenThreadCount === 1 ? "thread" : "threads"} hidden`}
                >
                  <GitBranch size="base" aria-hidden="true" />
                </button>
              )}
            </Tooltip>
          )}
          {state.type === "transcript" && state.result.cutoff && (
            <Tooltip label="Some messages may be missing because the observation limit was reached.">
              {({ getTriggerProps }) => (
                <button
                  {...getTriggerProps()}
                  type="button"
                  className="bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors"
                  aria-label="Some messages may be missing"
                >
                  <MessageSquareOff size="base" aria-hidden="true" />
                </button>
              )}
            </Tooltip>
          )}
        </div>
      )}

      {!isCollapsed && (
        <>
          {showThreadHeader && (
            <div
              className={cn(
                "group/thread-header text-muted-foreground mb-5 flex items-center gap-2 text-xs",
                !showHeader && "pt-3",
              )}
            >
              <span className="bg-muted text-muted-foreground flex h-4 min-w-4 shrink-0 items-center justify-center rounded-sm px-1 font-mono text-[10px]">
                {displayNumber ?? `${turnNumber}.${visibleThreadIndex + 1}`}
              </span>
              <h3>Thread {visibleThreadIndex + 1}</h3>
              {visibleThreadIndex > 0 && (
                <>
                  <div className="border-border min-w-0 flex-1 border-t border-dashed" />
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground shrink-0 font-mono text-xs opacity-0 group-focus-within/thread-header:opacity-100 group-hover/thread-header:opacity-100 hover:underline focus-visible:opacity-100"
                    onClick={onOpenTrace}
                  >
                    Open trace
                  </button>
                </>
              )}
            </div>
          )}

          {state.type === "loading" && (
            <div
              role="status"
              aria-label="Loading messages"
              className="flex flex-col gap-5 py-2"
            >
              <div className="flex items-center gap-2 py-1">
                <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-full" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-3 shrink-0" />
              </div>
              {(["user", "assistant"] as const).map((role) => (
                <div
                  key={role}
                  className={cn(
                    "flex w-full",
                    role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <Skeleton
                    className={cn(
                      "max-w-[min(85%,48rem)] rounded-2xl",
                      role === "user" ? "h-20 w-3/5" : "h-24 w-4/5",
                    )}
                  />
                </div>
              ))}
              <div className="flex items-center gap-2 py-1">
                <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-full" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-3 shrink-0" />
              </div>
            </div>
          )}
          {state.type === "error" && (
            <div className="border-destructive/40 bg-destructive/5 text-foreground rounded-lg border p-4 text-xs">
              Failed to load messages.
            </div>
          )}
          {state.type === "empty" && (
            <div className="text-muted-foreground flex items-center justify-between gap-4 rounded-lg border border-dashed p-4 text-xs">
              <span>This trace has no messages.</span>
            </div>
          )}
          {state.type === "transcript" && (
            <SessionTranscriptContent
              includeNestedThreads={includeNestedThreads}
              variant={variant}
              {...state}
              onOpenObservation={onOpenObservation}
              scrollTarget={scrollTarget}
              threadIndex={threadIndex}
            />
          )}
        </>
      )}
    </div>
  );
}
