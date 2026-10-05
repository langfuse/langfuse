import { CircleAlert, MessageSquareOff } from "lucide-react";
import { type ReactNode } from "react";
import { renderFilterIcon } from "@/src/components/ItemBadge";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { type RouterOutputs } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { decodeUnicodeEscapesOnly } from "@/src/utils/unicode";
import { SessionTranscriptContent } from "./SessionTranscriptContent";
import { SessionTimelineCollapsibleRow } from "../SessionTimelineCollapsibleRow/SessionTimelineCollapsibleRow";
import { type SessionTraceTranscriptState } from "@/src/features/sessions/SessionConversationTimeline/useSessionTraceTranscripts";

export type PreparedSessionConversationTimelineTraceState =
  | { type: "loading" }
  | { type: "error" }
  | { type: "empty" }
  | {
      type: "transcript";
      result: Extract<SessionTraceTranscriptState, { state: "loaded" }>;
      observations: RouterOutputs["events"]["sessionAll"]["observations"];
    };

const toPreviewText = (value: unknown) => {
  const text =
    typeof value === "string"
      ? value
      : (JSON.stringify(value, undefined, 2) ?? String(value));
  return decodeUnicodeEscapesOnly(text, true);
};

const hasPreviewValue = (value: unknown) =>
  value !== null && value !== undefined && value !== "";

export function SessionTimelineToolRow({
  name,
  input,
  output,
  isExpanded,
  onExpandedChange,
  isError,
  trailingContent,
}: {
  name: string;
  input: unknown;
  output: unknown;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  isError?: boolean;
  trailingContent?: ReactNode;
}) {
  return (
    <SessionTimelineCollapsibleRow
      label={name}
      icon={renderFilterIcon("TOOL")}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
      trailingContent={
        <>
          {trailingContent}
          {isError ? (
            <CircleAlert
              className="text-destructive h-3 w-3"
              aria-label="Failed"
            />
          ) : null}
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-3 pl-[22px]">
        {hasPreviewValue(input) ? (
          <div className="relative flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[10px] font-bold uppercase">
              Input
            </span>
            <pre className="bg-muted/30 max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs break-all whitespace-pre-wrap">
              {toPreviewText(input)}
            </pre>
          </div>
        ) : null}
        {hasPreviewValue(output) ? (
          <div className="relative flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[10px] font-bold uppercase">
              Output
            </span>
            <pre className="bg-muted/30 max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs break-all whitespace-pre-wrap">
              {toPreviewText(output)}
            </pre>
          </div>
        ) : null}
        {!hasPreviewValue(input) && !hasPreviewValue(output) ? (
          <div className="relative">
            <span className="text-muted-foreground text-xs">
              No input or output
            </span>
          </div>
        ) : null}
      </div>
    </SessionTimelineCollapsibleRow>
  );
}

export function SessionConversationTimelineTrace({
  trace,
  turnNumber,
  state,
  onOpenTrace,
  onOpenObservation,
  scrollTarget,
}: {
  trace: EventSessionTrace;
  turnNumber: number;
  state: PreparedSessionConversationTimelineTraceState;
  onOpenTrace: () => void;
  onOpenObservation: (observationId: string) => void;
  scrollTarget: {
    observationId: string;
    rowId?: string;
    requestId: number;
  } | null;
}) {
  return (
    <div
      className="px-4 pb-14 sm:px-6 lg:px-10"
      data-session-trace-id={trace.id}
    >
      <div className="group/trace-header mb-6 flex items-center gap-4 pt-5">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground ph-no-capture flex shrink-0 items-center gap-2 font-mono text-xs transition-colors"
          onClick={onOpenTrace}
          title={`${trace.name ?? "Trace"} (${trace.id})`}
        >
          <span className="border-border bg-tertiary text-foreground flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border font-mono text-[10px]">
            {turnNumber}
          </span>
          <span>trace · {trace.id}</span>
        </button>
        <div className="border-border min-w-0 flex-1 border-t border-dashed" />
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hidden shrink-0 font-mono text-xs group-focus-within/trace-header:block group-hover/trace-header:block hover:underline"
          onClick={onOpenTrace}
        >
          Open trace
        </button>
        {state.type === "transcript" && state.result.cutoff && (
          <Tooltip label="This transcript may be incomplete because the observation limit was reached.">
            {({ getTriggerProps }) => (
              <button
                {...getTriggerProps()}
                type="button"
                className="bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors"
                aria-label="Transcript may be incomplete"
              >
                <MessageSquareOff className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </Tooltip>
        )}
      </div>

      {state.type === "loading" && (
        <div
          role="status"
          aria-label="Loading conversation"
          className="flex flex-col gap-1"
        >
          {[
            {
              nameWidth: "w-36",
              messages: [
                { alignment: "end", height: "h-16", width: "w-3/5" },
                { alignment: "start", height: "h-24", width: "w-4/5" },
              ],
            },
            { nameWidth: "w-24", messages: [] },
            {
              nameWidth: "w-44",
              messages: [
                { alignment: "start", height: "h-20", width: "w-2/3" },
              ],
            },
          ].map((observation, observationIndex) => (
            <div
              key={observationIndex}
              className={cn(
                "flex flex-col py-2",
                observation.messages.length > 0 && "gap-4",
              )}
            >
              <div className="flex w-full min-w-0 items-center gap-2">
                <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
                <Skeleton className={cn("h-3", observation.nameWidth)} />
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <Skeleton className="h-3 w-9" />
                  <Skeleton className="h-3 w-16" />
                </span>
              </div>
              {observation.messages.length > 0 ? (
                <div className="flex flex-col gap-5">
                  {observation.messages.map((message, messageIndex) => (
                    <div
                      key={messageIndex}
                      className={cn(
                        "flex w-full",
                        message.alignment === "end"
                          ? "justify-end"
                          : "justify-start",
                      )}
                    >
                      <Skeleton
                        className={cn(
                          "max-w-[min(85%,48rem)] rounded-2xl",
                          message.height,
                          message.width,
                        )}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {state.type === "error" && (
        <div className="border-destructive/40 bg-destructive/5 text-foreground rounded-lg border p-4 text-xs">
          Failed to load conversation.
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
        />
      )}
    </div>
  );
}
