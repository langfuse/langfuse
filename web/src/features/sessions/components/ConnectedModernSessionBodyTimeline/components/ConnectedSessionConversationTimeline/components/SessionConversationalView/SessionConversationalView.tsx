import { type ComponentProps, useLayoutEffect, useId, useRef } from "react";
import {
  SessionConversationSidebar,
  type SessionConversationSidebarTrace,
} from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationSidebar/SessionConversationSidebar";
import { SessionConversationTimeline } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/SessionConversationTimeline";
import { type SessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";
import { getSessionTranscriptRows } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionTranscriptRows";
import { getSessionTranscriptThreads } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionTranscriptThreads";
import { computeIdleGapSeconds } from "@/src/features/sessions/sessionIdleGap";

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
  const transcriptRef = useRef<HTMLDivElement>(null);
  const highlightName = `session-transcript-${useId().replace(/[^a-z0-9_-]/gi, "")}`;
  const searchQuery = props.state === "loaded" ? props.search.trim() : "";
  useLayoutEffect(() => {
    const container = transcriptRef.current;
    if (!container || typeof Highlight === "undefined" || !CSS.highlights)
      return;
    if (!searchQuery) {
      CSS.highlights.get(highlightName)?.clear();
      CSS.highlights.delete(highlightName);
      return;
    }
    const updateHighlights = () => {
      const ranges: Range[] = [];
      const query = new RegExp(
        searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "gi",
      );
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) =>
            node.parentElement?.closest("[data-session-search-content]") &&
            !node.parentElement.closest("style, script")
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT,
        },
      );
      while (walker.nextNode()) {
        const node = walker.currentNode;
        for (const match of (node.textContent ?? "").matchAll(query)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          ranges.push(range);
        }
      }
      CSS.highlights.set(highlightName, new Highlight(...ranges));
    };
    updateHighlights();
    const observer = new MutationObserver(updateHighlights);
    observer.observe(container, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      CSS.highlights.get(highlightName)?.clear();
      CSS.highlights.delete(highlightName);
    };
  }, [highlightName, searchQuery]);
  const sidebarTraces: SessionConversationSidebarTrace[] = [];
  if (props.state === "loaded" && !props.isSearchPending) {
    for (const [index, item] of props.traces.entries()) {
      const transcriptRows = (() => {
        if (item.state.type === "error") return null;
        if (item.state.type === "loading") return undefined;
        if (item.state.type === "empty") return [];
        let toolGroupId: string | undefined;
        return getSessionTranscriptRows(item.state.result.transcript).map(
          ({ id, threadIndex, row }) => {
            if (row.type !== "tool") toolGroupId = undefined;
            else if (toolGroupId === undefined) toolGroupId = id;
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
              threadIndex,
              toolGroupId:
                row.type === "tool"
                  ? `${id.split(":")[0]}:${toolGroupId}`
                  : undefined,
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
      const threadVisibility =
        item.state.type === "transcript"
          ? getSessionTranscriptThreads(item.state.result.transcript)
          : undefined;
      sidebarTraces.push({
        trace: item.trace,
        turnNumber: item.turnNumber,
        idleGapSeconds:
          index === 0
            ? null
            : computeIdleGapSeconds(props.traces[index - 1]!.trace, item.trace),
        transcriptRows: matchingRows,
        threadCount: threadVisibility?.visibleThreads.length,
        hiddenThreadCount: threadVisibility?.hiddenThreadCount,
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
      <div
        ref={transcriptRef}
        className="bg-card dark:bg-background session-review-stack:min-w-0 relative min-h-0 min-w-[320px]"
      >
        <style>{`::highlight(${highlightName}) { background-color: ${searchQuery ? "hsl(var(--find-match-background))" : "transparent"}; color: ${searchQuery ? "hsl(var(--foreground))" : "inherit"}; }`}</style>
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
