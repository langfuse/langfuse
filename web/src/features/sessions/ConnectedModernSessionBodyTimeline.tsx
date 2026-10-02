import { useEffect, useEffectEvent, useRef, useState } from "react";

import {
  ConnectedSessionConversationTimeline,
  type ConnectedSessionConversationTimelineItem,
} from "@/src/features/sessions/SessionConversationTimeline/ConnectedSessionConversationTimeline";
import {
  type SessionConversationTimelineScrollTarget,
  useSessionConversationTimelineController,
} from "@/src/features/sessions/SessionConversationTimeline/useSessionConversationTimelineController";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { computeIdleGapSeconds } from "@/src/features/sessions/sessionIdleGap";
import { useDebounce } from "@/src/hooks/useDebounce";
import {
  SessionConversationSidebar,
  type SessionConversationSidebarTrace,
} from "@/src/features/sessions/SessionConversationSidebar/SessionConversationSidebar";
import { api, type RouterOutputs } from "@/src/utils/api";
import { useSessionTraceTranscripts } from "./SessionConversationTimeline/useSessionTraceTranscripts";
import { getSessionTranscriptRows } from "./SessionConversationTimeline/fns/getSessionTranscriptRows";

const SIDEBAR_TRACE_CHUNK_SIZE = 20;
const SIDEBAR_OBSERVATION_PAGE_SIZE = 100;
const EMPTY_TRACES: EventSessionTrace[] = [];

type OpenPeek = (id: string, row: EventSessionTrace) => void;

type ConnectedModernSessionBodyTimelineProps = {
  tracesState:
    | { type: "loading" }
    | { type: "loaded"; traces: EventSessionTrace[] };
  projectId: string;
  sessionId: string;
  sessionMinTimestamp: Date;
  sessionMaxTimestamp: Date;
  openPeek: OpenPeek;
};

export function ConnectedModernSessionBodyTimeline({
  tracesState,
  projectId,
  sessionId,
  sessionMinTimestamp,
  sessionMaxTimestamp,
  openPeek,
}: ConnectedModernSessionBodyTimelineProps) {
  const traces =
    tracesState.type === "loaded" ? tracesState.traces : EMPTY_TRACES;
  const timelineController = useSessionConversationTimelineController(
    traces.map((trace) => ({ trace })),
  );
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSetSearchQuery = useDebounce(setSearchQuery, 500, false);
  const isSearchPending = search.trim() !== searchQuery;
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
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});
  const expandedTraceIds = new Set(
    traces
      .filter((trace) => !collapsedTraceIds.has(trace.id))
      .map((trace) => trace.id),
  );

  const traceIndexById = new Map(
    traces.map((trace, index) => [trace.id, index] as const),
  );
  const activeChunkIndices = new Set<number>();
  {
    let highestChunkIndex = searchQuery
      ? Math.ceil(traces.length / SIDEBAR_TRACE_CHUNK_SIZE) - 1
      : Math.min(
          loadedThroughChunkIndex,
          Math.ceil(traces.length / SIDEBAR_TRACE_CHUNK_SIZE) - 1,
        );
    for (const traceId of visibleTraceIds) {
      const traceIndex = traceIndexById.get(traceId);
      if (traceIndex === undefined) continue;
      highestChunkIndex = Math.max(
        highestChunkIndex,
        Math.floor(traceIndex / SIDEBAR_TRACE_CHUNK_SIZE),
      );
    }
    for (const item of timelineController.virtualItems) {
      highestChunkIndex = Math.max(
        highestChunkIndex,
        Math.floor(item.index / SIDEBAR_TRACE_CHUNK_SIZE),
      );
    }
    for (let chunkIndex = 0; chunkIndex <= highestChunkIndex; chunkIndex++) {
      activeChunkIndices.add(chunkIndex);
    }
  }

  const queryDescriptors: Array<{
    key: string;
    page: number;
    traceIds: string[];
  }> = [];
  {
    for (const chunkIndex of activeChunkIndices) {
      const key = `browse:${chunkIndex}`;
      const pageCount = pageCounts[key] ?? 1;
      const startIndex = chunkIndex * SIDEBAR_TRACE_CHUNK_SIZE;
      const traceIds = traces
        .slice(startIndex, startIndex + SIDEBAR_TRACE_CHUNK_SIZE)
        .map((trace) => trace.id);
      for (let page = 1; page <= pageCount; page++) {
        queryDescriptors.push({ key, page, traceIds });
      }
    }
  }

  const observationQueries = api.useQueries((t) =>
    queryDescriptors.map((descriptor) =>
      t.events.sessionAll(
        {
          projectId,
          sessionId,
          filter: [
            {
              column: "startTime",
              type: "datetime",
              operator: ">=",
              value: sessionMinTimestamp,
            },
            {
              column: "startTime",
              type: "datetime",
              operator: "<=",
              value: sessionMaxTimestamp,
            },
            {
              column: "traceId",
              type: "stringOptions",
              operator: "any of",
              value: descriptor.traceIds,
            },
          ],
          searchQuery: null,
          searchType: [],
          page: descriptor.page,
          limit: SIDEBAR_OBSERVATION_PAGE_SIZE,
          orderBy: { column: "startTime", order: "ASC" },
        },
        {
          staleTime: 60 * 1000,
          refetchOnWindowFocus: false,
        },
      ),
    ),
  );

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

  const timelineObservationsByTraceId = new Map<
    string,
    RouterOutputs["events"]["sessionAll"]["observations"]
  >();
  const observationIdsByTraceId = new Map<string, Set<string>>();
  for (const query of observationQueries) {
    for (const observation of query.data?.observations ?? []) {
      if (!observation.traceId) {
        continue;
      }
      if (observation.id === `t-${observation.traceId}`) {
        continue;
      }
      const observationIds = observationIdsByTraceId.get(observation.traceId);
      if (observationIds?.has(observation.id)) {
        continue;
      }
      if (observationIds) observationIds.add(observation.id);
      else {
        observationIdsByTraceId.set(
          observation.traceId,
          new Set([observation.id]),
        );
      }
      const timelineObservations = timelineObservationsByTraceId.get(
        observation.traceId,
      );
      if (timelineObservations) timelineObservations.push(observation);
      else {
        timelineObservationsByTraceId.set(observation.traceId, [observation]);
      }
    }
  }

  const sidebarTraces: SessionConversationSidebarTrace[] = [];
  for (const [index, trace] of traces.entries()) {
    const transcript = resultsByTraceId.get(trace.id);
    const transcriptRows = (() => {
      if (transcript?.state === "error") return null;
      if (!transcript || transcript.state === "loading") return undefined;
      return getSessionTranscriptRows(transcript.transcript).map(
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
      searchQuery && transcriptRows
        ? transcriptRows.filter((row) =>
            `${row.role} ${row.label}`
              .toLowerCase()
              .includes(searchQuery.toLowerCase()),
          )
        : transcriptRows;
    if (searchQuery && matchingRows?.length === 0) continue;

    sidebarTraces.push({
      trace,
      turnNumber: index + 1,
      idleGapSeconds:
        index === 0 ? null : computeIdleGapSeconds(traces[index - 1]!, trace),
      transcriptRows: matchingRows,
    });
  }

  const lastQueryByKey = new Map<string, number>();
  queryDescriptors.forEach((descriptor, queryIndex) => {
    lastQueryByKey.set(descriptor.key, queryIndex);
  });
  const hasMoreObservations = Array.from(lastQueryByKey.values()).some(
    (queryIndex) => observationQueries[queryIndex]?.data?.hasMore,
  );
  const isLoadingMoreObservations = Array.from(lastQueryByKey.values()).some(
    (queryIndex) => observationQueries[queryIndex]?.isFetching,
  );
  const isLoadingTranscripts = Array.from(activeTranscriptTraceIds).some(
    (traceId) => resultsByTraceId.get(traceId)?.state === "loading",
  );
  const transcriptLoadError = Array.from(resultsByTraceId.values()).some(
    (result) => result.state === "error",
  );

  const loadMoreObservations = () => {
    setPageCounts((current) => {
      let next = current;
      for (const [key, queryIndex] of lastQueryByKey) {
        const query = observationQueries[queryIndex];
        const descriptor = queryDescriptors[queryIndex];
        if (!query?.data?.hasMore || query.isFetching || !descriptor) {
          continue;
        }
        if (next === current) next = { ...current };
        next[key] = Math.max(current[key] ?? 1, descriptor.page + 1);
      }
      return next;
    });
  };
  const autoLoadMoreObservations = useEffectEvent(loadMoreObservations);

  useEffect(() => {
    if (!hasMoreObservations || isLoadingMoreObservations) return;
    autoLoadMoreObservations();
  }, [hasMoreObservations, isLoadingMoreObservations]);

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
        observations: timelineObservationsByTraceId.get(trace.id) ?? [],
      };
    },
  );
  const handleSelect = (
    index: number,
    observationId?: string,
    rowId?: string,
  ) => {
    const traceId = timelineTraces[index]?.trace.id;
    if (observationId && traceId) {
      scrollRequestIdRef.current += 1;
      setScrollTarget({
        traceId,
        observationId,
        rowId,
        requestId: scrollRequestIdRef.current,
      });
    }
    timelineController.onSelect(index, observationId, rowId);
  };

  return (
    <div className="bg-background session-review-stack:grid-rows-[minmax(7rem,9rem)_minmax(0,1fr)] session-review-stack:gap-x-0 relative grid min-h-0 flex-1 grid-rows-[minmax(10rem,13rem)_minmax(0,1fr)] gap-x-4 overflow-hidden @3xl/session-workspace:grid-cols-[clamp(200px,24cqw,296px)_minmax(0,1fr)] @3xl/session-workspace:grid-rows-1">
      {tracesState.type === "loading" ? (
        <SessionConversationSidebar state="loading" />
      ) : (
        <SessionConversationSidebar
          state="loaded"
          traces={isSearchPending ? [] : sidebarTraces}
          activeTraceId={timelineController.activeTraceId ?? undefined}
          search={search}
          onSearchChange={handleSearchChange}
          expandedTraceIds={expandedTraceIds}
          onToggleTraceExpanded={toggleTraceExpanded}
          onSelect={handleSelect}
          onVisibleTraceIdsChange={handleVisibleTraceIdsChange}
          isLoadingTranscripts={isSearchPending || isLoadingTranscripts}
          transcriptLoadError={transcriptLoadError}
        />
      )}
      <div className="bg-card dark:bg-background session-review-stack:min-w-0 relative min-h-0 min-w-[320px]">
        <ConnectedSessionConversationTimeline
          traces={timelineTraces}
          projectId={projectId}
          openPeek={openPeek}
          controller={timelineController}
          resultsByTraceId={resultsByTraceId}
          scrollTarget={scrollTarget}
          onLoadMoreObservations={
            hasMoreObservations && !isLoadingMoreObservations
              ? loadMoreObservations
              : undefined
          }
        />
      </div>
    </div>
  );
}
