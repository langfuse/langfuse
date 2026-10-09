import { useRef, useState } from "react";

import {
  ConnectedSessionConversationTimeline,
  type ConnectedSessionConversationTimelineItem,
} from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/ConnectedSessionConversationTimeline";
import {
  type SessionConversationTimelineScrollTarget,
  useSessionConversationTimelineController,
} from "@/src/features/sessions/hooks/useSessionConversationTimelineController";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { useDebounce } from "@/src/hooks/useDebounce";
import { api } from "@/src/utils/api";
import { useSessionTraceTranscripts } from "@/src/features/sessions/hooks/useSessionTraceTranscripts";
import { getSessionConversationEntries } from "./components/ConnectedSessionConversationTimeline/fns/getSessionConversationEntries";

const SIDEBAR_TRACE_CHUNK_SIZE = 20;
const EMPTY_TRACES: EventSessionTrace[] = [];

type OpenPeek = (id: string, row: EventSessionTrace) => void;

type ConnectedModernSessionBodyTimelineProps = {
  tracesState:
    | { type: "loading" }
    | { type: "loaded"; traces: EventSessionTrace[] };
  projectId: string;
  sessionId: string;
  openPeek: OpenPeek;
};

export function ConnectedModernSessionBodyTimeline({
  tracesState,
  projectId,
  sessionId,
  openPeek,
}: ConnectedModernSessionBodyTimelineProps) {
  const traces =
    tracesState.type === "loaded" ? tracesState.traces : EMPTY_TRACES;
  const [timelineVisibleTraceIds, setTimelineVisibleTraceIds] = useState<
    string[]
  >([]);
  const [search, setSearch] = useState("");
  const [debouncedSearchQuery, setSearchQuery] = useState("");
  const debouncedSetSearchQuery = useDebounce(
    (nextSearchQuery: string) => {
      if (nextSearchQuery === search.trim()) setSearchQuery(nextSearchQuery);
    },
    500,
    false,
  );
  const utils = api.useUtils();
  const [collapsedTraceIds, setCollapsedTraceIds] = useState<Set<string>>(
    new Set(),
  );
  const [visibleTraceIds, setVisibleTraceIds] = useState<string[]>([]);
  const [scrollTarget, setScrollTarget] =
    useState<SessionConversationTimelineScrollTarget | null>(null);
  const scrollRequestIdRef = useRef(0);
  const [loadedTracePrefix, setLoadedTracePrefix] = useState({
    sessionId,
    chunkIndex: -1,
  });
  const loadedThroughChunkIndex =
    loadedTracePrefix.sessionId === sessionId
      ? loadedTracePrefix.chunkIndex
      : -1;

  const traceIndexById = new Map(
    traces.map((trace, index) => [trace.id, index] as const),
  );
  const activeChunkIndices = new Set<number>();
  {
    const highestChunkIndex = Math.max(
      debouncedSearchQuery
        ? Math.ceil(traces.length / SIDEBAR_TRACE_CHUNK_SIZE) - 1
        : Math.min(
            loadedThroughChunkIndex,
            Math.ceil(traces.length / SIDEBAR_TRACE_CHUNK_SIZE) - 1,
          ),
      ...[...visibleTraceIds, ...timelineVisibleTraceIds].flatMap((traceId) => {
        const traceIndex = traceIndexById.get(traceId);
        if (traceIndex === undefined) return [];
        return [Math.floor(traceIndex / SIDEBAR_TRACE_CHUNK_SIZE)];
      }),
    );
    for (let chunkIndex = 0; chunkIndex <= highestChunkIndex; chunkIndex++) {
      activeChunkIndices.add(chunkIndex);
    }
  }

  const activeTranscriptTraceIds = new Set(
    traces
      .filter((_, index) =>
        activeChunkIndices.has(Math.floor(index / SIDEBAR_TRACE_CHUNK_SIZE)),
      )
      .map((trace) => trace.id),
  );
  const resultsByTraceId = useSessionTraceTranscripts({
    projectId,
    traces: traces.map((trace, index) => ({ trace, turnNumber: index + 1 })),
    activeTraceIds: activeTranscriptTraceIds,
  });
  const allTranscriptsLoaded =
    tracesState.type === "loaded" &&
    traces.every(
      (trace) =>
        utils.events.transcriptByTraceId.getData({
          projectId,
          traceId: trace.id,
          timestamp: trace.timestamp,
          recoverToolResponses: true,
        }) !== undefined,
    );
  const searchQuery = allTranscriptsLoaded
    ? search.trim()
    : debouncedSearchQuery;
  const isSearchPending = search.trim() !== searchQuery;
  const entries = getSessionConversationEntries(
    traces.map((trace) => {
      const result = resultsByTraceId.get(trace.id);
      return {
        trace,
        transcript: result?.state === "loaded" ? result.transcript : undefined,
      };
    }),
  );
  const timelineController = useSessionConversationTimelineController(
    entries.map((entry) => ({
      trace: traces[entry.traceIndex]!,
      itemId: entry.itemId,
    })),
    (nextTraceIds) =>
      setTimelineVisibleTraceIds((current) => {
        if (
          current.length === nextTraceIds.length &&
          current.every((id, index) => id === nextTraceIds[index])
        )
          return current;
        return nextTraceIds;
      }),
  );
  const expandedTraceIds = new Set(
    entries
      .filter((entry) => !collapsedTraceIds.has(entry.itemId))
      .map((entry) => entry.itemId),
  );

  const isLoadingTranscripts = Array.from(activeTranscriptTraceIds).some(
    (traceId) => resultsByTraceId.get(traceId)?.state === "loading",
  );
  const transcriptLoadError = Array.from(resultsByTraceId.values()).some(
    (result) => result.state === "error",
  );

  const handleVisibleTraceIdsChange = (nextTraceIds: string[]) => {
    const highestVisibleTraceIndex = nextTraceIds.reduce(
      (highestIndex, traceId) =>
        Math.max(highestIndex, traceIndexById.get(traceId) ?? -1),
      -1,
    );
    if (!searchQuery && highestVisibleTraceIndex >= 0) {
      setLoadedTracePrefix((current) => ({
        sessionId,
        chunkIndex: Math.max(
          current.sessionId === sessionId ? current.chunkIndex : -1,
          Math.floor(highestVisibleTraceIndex / SIDEBAR_TRACE_CHUNK_SIZE),
        ),
      }));
    }
    setVisibleTraceIds((current) => {
      if (
        current.length === nextTraceIds.length &&
        current.every((traceId, index) => traceId === nextTraceIds[index])
      ) {
        return current;
      }
      return nextTraceIds;
    });
  };

  const handleSearchChange = (nextSearch: string) => {
    setSearch(nextSearch);
    if (allTranscriptsLoaded) {
      setSearchQuery(nextSearch.trim());
      return;
    }
    debouncedSetSearchQuery(nextSearch.trim());
  };

  const toggleTraceExpanded = (traceId: string) => {
    setCollapsedTraceIds((current) => {
      const next = new Set(current);
      if (next.has(traceId)) next.delete(traceId);
      else next.add(traceId);
      return next;
    });
  };
  const timelineTraces: ConnectedSessionConversationTimelineItem[] = traces.map(
    (trace, index) => {
      return {
        trace,
        turnNumber: index + 1,
      };
    },
  );
  const handleSelect = (
    index: number,
    observationId?: string,
    rowId?: string,
  ) => {
    const entry = entries[index];
    const traceId = entry
      ? timelineTraces[entry.traceIndex]?.trace.id
      : undefined;
    if (observationId && traceId) {
      scrollRequestIdRef.current += 1;
      setScrollTarget({
        itemId: entry?.itemId,
        traceId,
        observationId,
        rowId,
        requestId: scrollRequestIdRef.current,
      });
    }
    timelineController.onSelect(index, observationId, rowId);
  };

  return (
    <ConnectedSessionConversationTimeline
      {...(tracesState.type === "loading"
        ? { state: "loading" }
        : {
            state: "loaded",
            search,
            searchQuery,
            isSearchPending,
            onSearchChange: handleSearchChange,
            expandedTraceIds,
            onToggleTraceExpanded: toggleTraceExpanded,
            onSelect: handleSelect,
            onVisibleTraceIdsChange: handleVisibleTraceIdsChange,
            isLoadingTranscripts: isSearchPending || isLoadingTranscripts,
            transcriptLoadError,
          })}
      traces={timelineTraces}
      projectId={projectId}
      openPeek={openPeek}
      controller={timelineController}
      resultsByTraceId={resultsByTraceId}
      scrollTarget={scrollTarget}
    />
  );
}
