import {
  type ComponentProps,
  useLayoutEffect,
  useId,
  useRef,
  useState,
} from "react";
import { SessionViewLayout } from "@/src/features/sessions/components/SessionViewLayout/SessionViewLayout";
import {
  SessionConversationSidebar,
  type SessionConversationSidebarTrace,
} from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationSidebar/SessionConversationSidebar";
import { SessionConversationTimeline } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/SessionConversationTimeline";
import { type SessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";
import { getSessionTranscriptRows } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionTranscriptRows";
import { getSessionToolStatus } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/fns/getSessionToolStatus";
import { getSessionTranscriptThreads } from "../../fns/getSessionTranscriptThreads";
import { getSessionConversationEntries } from "../../fns/getSessionConversationEntries";
import { computeIdleGapSeconds } from "@/src/features/sessions/sessionIdleGap";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";

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
    customization?: ComponentProps<
      typeof SessionConversationSidebar
    >["customization"];
    traces: readonly (ComponentProps<
      typeof SessionConversationTimeline
    >["traces"][number] & { trace: EventSessionTrace })[];
    controller: SessionConversationTimelineController;
  },
) {
  const { customization } = props;
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [collapsedTraceIds, setCollapsedTraceIds] = useState<Set<string>>(
    new Set(),
  );
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
      isCollapsed: collapsedTraceIds.has(item.trace.id),
      onToggleCollapsed: () => {
        setCollapsedTraceIds((current) => {
          const next = new Set(current);
          if (next.has(item.trace.id)) next.delete(item.trace.id);
          else next.add(item.trace.id);
          return next;
        });
      },
      scrollTarget:
        item.scrollTarget?.itemId && item.scrollTarget.itemId !== entry.itemId
          ? null
          : item.scrollTarget,
    };
  });
  if (props.state === "loaded" && !props.isSearchPending) {
    for (const [itemIndex, item] of timelineItems.entries()) {
      let emptyTranscriptReason: "reasoning-only" | undefined;
      const transcriptRows = (() => {
        if (item.state.type === "error") return null;
        if (item.state.type === "loading") return undefined;
        if (item.state.type === "empty") return [];
        let toolGroupId: string | undefined;
        return getSessionTranscriptRows(item.state.result.transcript)
          .filter((row) => row.threadIndex === item.threadIndex)
          .flatMap(({ id, threadIndex, row }) => {
            if (row.type !== "tool") toolGroupId = undefined;
            else if (toolGroupId === undefined) toolGroupId = id;
            if (
              row.type !== "tool" &&
              row.message.parts.length > 0 &&
              row.message.parts.every((part) => part.type === "reasoning")
            ) {
              emptyTranscriptReason = "reasoning-only";
              return [];
            }
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
            return [
              {
                id,
                threadIndex,
                toolGroupId:
                  row.type === "tool"
                    ? `${id.split(":")[0]}:${toolGroupId}`
                    : undefined,
                observationId: row.message.observationId,
                label,
                ...getSessionToolStatus({
                  level: row.message.level,
                  statusMessage: row.message.statusMessage,
                  isError:
                    row.type === "tool" ? row.result?.isError : undefined,
                }),
                role:
                  row.type === "tool" ? ("tool" as const) : row.message.role,
              },
            ];
          });
      })();
      const matchesTraceName =
        props.searchQuery.length > 0 &&
        (item.trace.name ?? "")
          .toLowerCase()
          .includes(props.searchQuery.toLowerCase());
      const matchingRows =
        props.searchQuery && !matchesTraceName && transcriptRows
          ? transcriptRows.filter((row) =>
              `${row.role} ${row.label}`
                .toLowerCase()
                .includes(props.searchQuery.toLowerCase()),
            )
          : transcriptRows;
      if (props.searchQuery && !matchesTraceName && matchingRows?.length === 0)
        continue;
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
        emptyTranscriptReason:
          transcriptRows?.length === 0 ? emptyTranscriptReason : undefined,
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
          onSelect: (...args: Parameters<typeof props.onSelect>) => {
            const item = timelineItems[args[0]];
            if (item) {
              setCollapsedTraceIds((current) => {
                if (!current.has(item.trace.id)) return current;
                const next = new Set(current);
                next.delete(item.trace.id);
                return next;
              });
            }
            props.onSelect(...args);
          },
        };
  return (
    <SessionViewLayout
      search={props.state === "loaded" ? props.search : ""}
      isLoading={props.state === "loading"}
      customization={customization}
      renderSidebar={(onNavigate) =>
        sidebarProps.state === "loading" ? (
          <SessionConversationSidebar
            state="loading"
            customization={customization}
          />
        ) : (
          <SessionConversationSidebar
            {...sidebarProps}
            customization={customization}
            onSelect={(...args) => {
              sidebarProps.onSelect(...args);
              onNavigate();
            }}
          />
        )
      }
    >
      <div
        ref={transcriptRef}
        className="bg-card dark:bg-background relative h-full min-h-0 min-w-0"
      >
        <style>{`::highlight(${highlightName}) { background-color: ${searchQuery ? "hsl(var(--find-match-background))" : "transparent"}; color: ${searchQuery ? "hsl(var(--foreground))" : "inherit"}; }`}</style>
        <SessionConversationTimeline
          traces={timelineItems}
          controller={props.controller}
        />
      </div>
    </SessionViewLayout>
  );
}
