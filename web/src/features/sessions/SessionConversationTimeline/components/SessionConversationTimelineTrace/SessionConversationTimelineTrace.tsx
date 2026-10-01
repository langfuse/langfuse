import { ChevronDown, CircleAlert } from "lucide-react";
import { type ReactNode } from "react";
import { renderFilterIcon } from "@/src/components/ItemBadge";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { type RouterOutputs } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { decodeUnicodeEscapesOnly } from "@/src/utils/unicode";
import { SessionTranscriptContent } from "./SessionTranscriptContent";
import { type SessionTraceTranscriptState } from "@/src/features/sessions/SessionConversationTimeline/useSessionTraceTranscripts";

type ActionObservation = Pick<
  RouterOutputs["events"]["sessionAll"]["observations"][number],
  "id" | "traceId" | "name" | "startTime" | "environment"
> & { traceId: string };

export type PreparedSessionConversationTimelineTraceState =
  | { type: "loading" }
  | { type: "error" }
  | { type: "empty" }
  | {
      type: "filtered-empty";
      viewLabel: string | null;
      onClearFilters: () => void;
    }
  | {
      type: "transcript";
      result: Extract<SessionTraceTranscriptState, { state: "loaded" }>;
      observations: RouterOutputs["events"]["sessionAll"]["observations"];
      filtered: boolean;
      observationActions?: SessionObservationActions;
    };

export type SessionObservationActions = {
  onFilterByName: (name: string, operator: "any of" | "none of") => void;
  annotate: {
    disabled: boolean;
    onSelect: (observation: ActionObservation) => void;
  };
  comment: {
    disabled: boolean;
    onSelect: (observation: ActionObservation) => void;
  };
  addToDataset: {
    disabled: boolean;
    onSelect: (observation: ActionObservation) => void;
  };
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

export function SessionObservationActionsMenuContent({
  observation,
  actions,
}: {
  observation: ActionObservation;
  actions: SessionObservationActions;
}) {
  return (
    <DropdownMenuContent align="end" sideOffset={0}>
      <DropdownMenuItem
        disabled={actions.annotate.disabled}
        onSelect={() => actions.annotate.onSelect(observation)}
      >
        Annotate
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={actions.comment.disabled}
        onSelect={() => actions.comment.onSelect(observation)}
      >
        Comments
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={actions.addToDataset.disabled}
        onSelect={() => actions.addToDataset.onSelect(observation)}
      >
        Add to dataset
      </DropdownMenuItem>
      {observation.name ? (
        <DropdownMenuItem
          onSelect={() =>
            actions.onFilterByName(observation.name as string, "any of")
          }
        >
          Only show observations with the same name
        </DropdownMenuItem>
      ) : null}
      {observation.name ? (
        <DropdownMenuItem
          onSelect={() =>
            actions.onFilterByName(observation.name as string, "none of")
          }
        >
          Exclude observations with the same name
        </DropdownMenuItem>
      ) : null}
    </DropdownMenuContent>
  );
}

export function SessionTimelineToolRow({
  name,
  input,
  output,
  isExpanded,
  onExpandedChange,
  onOpenObservation,
  isError,
  trailingContent,
}: {
  name: string;
  input: unknown;
  output: unknown;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  onOpenObservation?: () => void;
  isError?: boolean;
  trailingContent?: ReactNode;
}) {
  return (
    <section
      className={cn("flex scroll-mt-16 flex-col py-1", isExpanded && "gap-2")}
    >
      <div className="flex w-full min-w-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onOpenObservation ?? (() => onExpandedChange(!isExpanded))}
          className="group flex min-w-0 items-center gap-2 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <span className="bg-background relative z-[1] flex shrink-0 rounded-full">
            {renderFilterIcon("TOOL")}
          </span>
          <span
            className="min-w-0 truncate text-xs font-normal hover:underline"
            title={name}
          >
            {name}
          </span>
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground shrink-0 rounded-sm p-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${name}`}
          onClick={() => onExpandedChange(!isExpanded)}
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              !isExpanded && "-rotate-90",
            )}
            aria-hidden="true"
          />
        </button>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {trailingContent}
          {isError ? (
            <CircleAlert
              className="text-destructive h-3 w-3"
              aria-label="Failed"
            />
          ) : null}
        </span>
      </div>
      {isExpanded ? (
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
      ) : null}
    </section>
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
  scrollTarget: { observationId: string; requestId: number } | null;
}) {
  return (
    <div
      className="px-4 pb-14 sm:px-6 lg:px-10"
      data-session-trace-id={trace.id}
    >
      <div className="mb-6 flex items-center gap-4 pt-5">
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
      {(state.type === "empty" || state.type === "filtered-empty") && (
        <div className="text-muted-foreground flex items-center justify-between gap-4 rounded-lg border border-dashed p-4 text-xs">
          <span>
            {state.type === "empty" && "This trace has no observations."}
            {state.type === "filtered-empty" &&
              (state.viewLabel
                ? `No observation matches the “${state.viewLabel}” view in this trace.`
                : "No observation matches the current filters in this trace.")}
          </span>
          {state.type === "filtered-empty" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={state.onClearFilters}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      )}
      {state.type === "transcript" && (
        <SessionTranscriptContent
          result={state.result}
          observations={state.observations}
          filtered={state.filtered}
          observationActions={state.observationActions}
          onOpenObservation={onOpenObservation}
          scrollTarget={scrollTarget}
        />
      )}
    </div>
  );
}
