import { type ComponentProps } from "react";
import {
  SessionConversationSidebar,
  type SessionConversationSidebarTrace,
} from "../SessionConversationSidebar/SessionConversationSidebar";
import { SessionConversationTimeline } from "../SessionConversationTimeline/SessionConversationTimeline";
import { type SessionConversationTimelineController } from "../SessionConversationTimeline/useSessionConversationTimelineController";
import { getSessionTranscriptRows } from "../SessionConversationTimeline/fns/getSessionTranscriptRows";
import { computeIdleGapSeconds } from "../sessionIdleGap";

export function SessionConversationalView(
  props: (
    | { state: "loading" }
    | (Omit<
        Extract<
          ComponentProps<typeof SessionConversationSidebar>,
          { state: "loaded" }
        >,
        "traces" | "activeTraceId"
      > & {
        searchQuery: string;
        isSearchPending: boolean;
      })
  ) & {
    traces: ComponentProps<typeof SessionConversationTimeline>["traces"];
    controller: SessionConversationTimelineController;
    onLoadMoreObservations?: () => void;
  },
) {
  const sidebarTraces: SessionConversationSidebarTrace[] = [];
  if (props.state === "loaded" && !props.isSearchPending) {
    for (const [index, item] of props.traces.entries()) {
      const transcriptRows = (() => {
        if (item.state.type === "error") return null;
        if (item.state.type === "loading") return undefined;
        if (item.state.type === "empty") return [];
        return getSessionTranscriptRows(item.state.result.transcript).map(
          ({ id, row }) => {
            const label =
              row.type === "tool"
                ? (row.call?.toolName ?? row.result?.toolName ?? "Tool")
                : row.message.parts
                    .map((part) => {
                      if (part.type === "text") return part.text;
                      if (part.type === "data" || part.type === "custom")
                        return "JSON message";
                      return part.type;
                    })
                    .join(" ") ||
                  row.message.senderName ||
                  row.message.role;
            return {
              id,
              observationId: row.message.observationId,
              label,
              role: row.type === "tool" ? ("tool" as const) : row.message.role,
            };
          },
        );
      })();
      const matchingRows =
        props.searchQuery && transcriptRows
          ? transcriptRows.filter((row) =>
              `${row.role} ${row.label}`
                .toLowerCase()
                .includes(props.searchQuery.toLowerCase()),
            )
          : transcriptRows;
      if (props.searchQuery && matchingRows?.length === 0) continue;
      sidebarTraces.push({
        trace: item.trace,
        turnNumber: item.turnNumber,
        idleGapSeconds:
          index === 0
            ? null
            : computeIdleGapSeconds(props.traces[index - 1]!.trace, item.trace),
        transcriptRows: matchingRows,
      });
    }
  }
  return (
    <div className="bg-background session-review-stack:grid-rows-[minmax(7rem,9rem)_minmax(0,1fr)] session-review-stack:gap-x-0 relative grid min-h-0 flex-1 grid-rows-[minmax(10rem,13rem)_minmax(0,1fr)] gap-x-4 overflow-hidden @3xl/session-workspace:grid-cols-[clamp(200px,24cqw,296px)_minmax(0,1fr)] @3xl/session-workspace:grid-rows-1">
      {props.state === "loading" ? (
        <SessionConversationSidebar state="loading" />
      ) : (
        <SessionConversationSidebar
          {...props}
          traces={sidebarTraces}
          activeTraceId={props.controller.activeTraceId ?? undefined}
        />
      )}
      <div className="bg-card dark:bg-background session-review-stack:min-w-0 relative min-h-0 min-w-[320px]">
        <SessionConversationTimeline
          traces={props.traces}
          controller={props.controller}
          filterMeasurementKey="transcript"
          onLoadMoreObservations={props.onLoadMoreObservations}
        />
      </div>
    </div>
  );
}
