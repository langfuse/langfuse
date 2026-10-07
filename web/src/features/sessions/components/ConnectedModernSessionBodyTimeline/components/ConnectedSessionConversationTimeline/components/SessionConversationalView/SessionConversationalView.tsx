import { type ComponentProps, useLayoutEffect, useId, useRef } from "react";
import { Search } from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Trigger as DialogTrigger } from "@radix-ui/react-dialog";
import {
  SessionConversationSidebar,
  type SessionConversationSidebarTrace,
} from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationSidebar/SessionConversationSidebar";
import { SessionConversationTimeline } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/SessionConversationTimeline";
import { type SessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";
import { getSessionTranscriptRows } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionTranscriptRows";
import { getSessionTranscriptThreads } from "../../fns/getSessionTranscriptThreads";
import { getSessionConversationEntries } from "../../fns/getSessionConversationEntries";
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
      const query = searchQuery.toLowerCase();
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
        const text = node.textContent ?? "";
        const normalizedText = text.toLowerCase();
        // Case folding can expand characters; ranges use original UTF-16 offsets.
        const offsets: number[] = [];
        if (normalizedText.length !== text.length) {
          let offset = 0;
          for (const character of text) {
            for (const normalizedCharacter of character.toLowerCase()) {
              offsets.push(offset);
              if (normalizedCharacter.length === 2) offsets.push(offset + 1);
            }
            offset += character.length;
          }
        }
        let index = normalizedText.indexOf(query);
        while (index !== -1) {
          const range = document.createRange();
          range.setStart(node, offsets[index] ?? index);
          range.setEnd(
            node,
            offsets.length
              ? offsets[index + query.length - 1]! + 1
              : index + query.length,
          );
          ranges.push(range);
          index = normalizedText.indexOf(query, index + query.length);
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
  const entries = getSessionConversationEntries(
    props.traces.map((item) => ({
      trace: item.trace,
      transcript:
        item.state.type === "transcript"
          ? item.state.result.transcript
          : undefined,
    })),
  );
  const timelineItems = entries.map((entry) => {
    const item = props.traces[entry.traceIndex]!;
    return {
      ...item,
      ...entry,
      scrollTarget:
        item.scrollTarget?.itemId && item.scrollTarget.itemId !== entry.itemId
          ? null
          : item.scrollTarget,
    };
  });
  if (props.state === "loaded" && !props.isSearchPending) {
    for (const [itemIndex, item] of timelineItems.entries()) {
      const transcriptRows = (() => {
        if (item.state.type === "error") return null;
        if (item.state.type === "loading") return undefined;
        if (item.state.type === "empty") return [];
        let toolGroupId: string | undefined;
        return getSessionTranscriptRows(item.state.result.transcript)
          .filter((row) => row.threadIndex === item.threadIndex)
          .map(({ id, threadIndex, row }) => {
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
          });
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
        itemId: item.itemId,
        itemIndex,
        displayNumber: item.displayNumber,
        threadNumber: item.threadNumber,
        turnNumber: item.turnNumber,
        idleGapSeconds:
          item.traceIndex === 0 || !item.isFirstThread
            ? null
            : computeIdleGapSeconds(
                props.traces[item.traceIndex - 1]!.trace,
                item.trace,
              ),
        transcriptRows: matchingRows,
        threadCount: threadVisibility?.visibleThreads.length,
        hiddenThreadCount: threadVisibility?.hiddenThreadCount,
      });
    }
  }
  const sidebarProps =
    props.state === "loading"
      ? { state: "loading" as const }
      : {
          ...props,
          traces: sidebarTraces,
          activeTraceId: props.controller.activeItemId ?? undefined,
        };
  return (
    <div className="bg-background relative grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-x-4 overflow-hidden @3xl/session-workspace:grid-cols-[clamp(200px,24cqw,296px)_minmax(0,1fr)] @3xl/session-workspace:grid-rows-1">
      <div className="border-b px-2 py-2.5 @3xl/session-workspace:hidden">
        <DialogController
          renderDialog={({ closeDialog }) => (
            <Dialog title="Search session" closeOnInteractionOutside>
              <div className="shrink-0 border-b px-4 pt-0 pb-2">
                <div className="relative min-w-0">
                  <Search className="icon-base text-foreground-tertiary absolute top-1/2 left-2 -translate-y-1/2" />
                  <Input
                    disabled={props.state === "loading"}
                    value={props.state === "loaded" ? props.search : ""}
                    onChange={(event) => {
                      if (props.state === "loaded")
                        props.onSearchChange(event.target.value);
                    }}
                    aria-label="Search session"
                    placeholder="Search session"
                    className="h-7 rounded-sm bg-transparent pl-7 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 sm:h-[60dvh] sm:flex-none">
                {sidebarProps.state === "loading" ? (
                  <SessionConversationSidebar
                    state="loading"
                    searchVisibility="hidden"
                  />
                ) : (
                  <SessionConversationSidebar
                    {...sidebarProps}
                    searchVisibility="hidden"
                    onSelect={(...args) => {
                      sidebarProps.onSelect(...args);
                      closeDialog();
                    }}
                  />
                )}
              </div>
            </Dialog>
          )}
        >
          {({ openDialog }) => (
            <DialogTrigger asChild>
              <button
                type="button"
                disabled={props.state === "loading"}
                onClick={() => openDialog()}
                aria-label="Search session"
                className="border-input text-muted-foreground flex h-7 w-full items-center gap-2 rounded-sm border px-2 text-left font-mono text-xs"
              >
                <Search className="icon-base shrink-0" />
                <span
                  className="truncate"
                  title={
                    props.state === "loaded" && props.search
                      ? props.search
                      : "Search session"
                  }
                >
                  {props.state === "loaded" && props.search
                    ? props.search
                    : "Search session"}
                </span>
              </button>
            </DialogTrigger>
          )}
        </DialogController>
      </div>
      <div className="hidden min-h-0 @3xl/session-workspace:block">
        <SessionConversationSidebar {...sidebarProps} />
      </div>
      <div
        ref={transcriptRef}
        className="bg-card dark:bg-background relative min-h-0 min-w-0"
      >
        <style>{`::highlight(${highlightName}) { background-color: ${searchQuery ? "hsl(var(--find-match-background))" : "transparent"}; color: ${searchQuery ? "hsl(var(--foreground))" : "inherit"}; }`}</style>
        <SessionConversationTimeline
          traces={timelineItems}
          controller={props.controller}
          filterMeasurementKey="transcript"
        />
      </div>
    </div>
  );
}
