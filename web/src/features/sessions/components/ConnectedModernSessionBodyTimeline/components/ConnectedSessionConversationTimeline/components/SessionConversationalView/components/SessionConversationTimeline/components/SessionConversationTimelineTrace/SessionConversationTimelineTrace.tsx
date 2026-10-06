import { GitBranch, MessageSquareOff } from "lucide-react";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { type RouterOutputs } from "@/src/utils/api";
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
      observations: RouterOutputs["events"]["sessionAll"]["observations"];
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
  threadNumber,
  displayNumber,
}: {
  itemId?: string;
  threadIndex?: number;
  threadNumber?: number;
  displayNumber?: string;
  threadCount?: number;
  trace: EventSessionTrace;
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
  const hiddenThreadCount =
    state.type === "transcript"
      ? getSessionTranscriptThreads(state.result.transcript).hiddenThreadCount
      : 0;
  return (
    <div
      className="px-4 pb-14 sm:px-6 lg:px-10"
      data-session-trace-id={trace.id}
      data-session-item-id={itemId}
    >
      <div className="group/trace-header mb-6 flex items-center gap-4 pt-5">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground ph-no-capture flex min-w-0 items-center gap-2 font-mono text-xs transition-colors"
          onClick={onOpenTrace}
          title={`${trace.name ?? "Trace"} (${trace.id})`}
        >
          <span className="border-border bg-tertiary text-foreground flex h-4 min-w-4 shrink-0 items-center justify-center rounded-sm border px-0.5 font-mono text-[10px]">
            {displayNumber ?? turnNumber}
          </span>
          <span
            className="truncate"
            title={`${trace.name ?? "Trace"} · ${trace.id}`}
          >
            {trace.name ?? "Trace"} · {trace.id}
          </span>
          {threadNumber !== undefined && (
            <span className="shrink-0">(Thread {threadNumber})</span>
          )}
        </button>
        <div className="border-border min-w-0 flex-1 border-t border-dashed" />
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hidden shrink-0 font-mono text-xs group-focus-within/trace-header:block group-hover/trace-header:block hover:underline"
          onClick={onOpenTrace}
        >
          Open trace
        </button>
        {hiddenThreadCount > 0 && (
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
                <GitBranch className="icon-base" aria-hidden="true" />
              </button>
            )}
          </Tooltip>
        )}
        {state.type === "transcript" && state.result.cutoff && (
          <Tooltip label="This transcript may be incomplete because the observation limit was reached.">
            {({ getTriggerProps }) => (
              <button
                {...getTriggerProps()}
                type="button"
                className="bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors"
                aria-label="Transcript may be incomplete"
              >
                <MessageSquareOff className="icon-base" aria-hidden="true" />
              </button>
            )}
          </Tooltip>
        )}
      </div>

      {state.type === "loading" && (
        <div
          role="status"
          aria-label="Loading transcript"
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
          Failed to load transcript.
        </div>
      )}
      {state.type === "empty" && (
        <div className="text-muted-foreground flex items-center justify-between gap-4 rounded-lg border border-dashed p-4 text-xs">
          <span>This trace has no transcript messages.</span>
        </div>
      )}
      {state.type === "transcript" && (
        <SessionTranscriptContent
          {...state}
          onOpenObservation={onOpenObservation}
          scrollTarget={scrollTarget}
          threadIndex={threadIndex}
        />
      )}
    </div>
  );
}
