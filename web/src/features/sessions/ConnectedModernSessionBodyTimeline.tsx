import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { type FilterState } from "@langfuse/shared";

import {
  ConnectedSessionConversationTimeline,
  type ConnectedSessionConversationTimelineItem,
} from "@/src/features/sessions/SessionConversationTimeline/ConnectedSessionConversationTimeline";
import {
  type SessionConversationTimelineScrollTarget,
  useSessionConversationTimelineController,
} from "@/src/features/sessions/SessionConversationTimeline/SessionConversationTimeline";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import {
  type SessionFocusTarget,
  useScrollToFocusedSessionTrace,
} from "@/src/features/sessions/sessionFocusTarget";
import { computeIdleGapSeconds } from "@/src/features/sessions/sessionIdleGap";
import { useDebounce } from "@/src/hooks/useDebounce";
import {
  ModernSessionSidebar,
  type ModernSessionSidebarFilterControls,
  type ModernSessionSidebarTrace,
} from "@/src/features/sessions/ModernSessionSidebar";
import { api, type RouterOutputs } from "@/src/utils/api";

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
  filterState: FilterState;
  filterMeasurementKey: string;
  viewLabel: string | null;
  focusTarget?: SessionFocusTarget | null;
  sidebarFilterControls: ModernSessionSidebarFilterControls;
  onFilterObservationByName: (
    name: string,
    operator: "any of" | "none of",
  ) => void;
};

export function ConnectedModernSessionBodyTimeline({
  tracesState,
  projectId,
  sessionId,
  sessionMinTimestamp,
  sessionMaxTimestamp,
  openPeek,
  filterState,
  filterMeasurementKey,
  viewLabel,
  focusTarget = null,
  sidebarFilterControls,
  onFilterObservationByName,
}: ConnectedModernSessionBodyTimelineProps) {
  const traces =
    tracesState.type === "loaded" ? tracesState.traces : EMPTY_TRACES;
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSetSearchQuery = useDebounce(setSearchQuery, 500, false);
  const isSearchPending = search.trim() !== searchQuery;
  const [collapsedTraceIds, setCollapsedTraceIds] = useState<Set<string>>(
    new Set(),
  );
  const [visibleTraceIds, setVisibleTraceIds] = useState<string[]>([]);
  // Seeded from the trace -> session link context (`?focusObservationId=`) so
  // a focused observation inside a collapsed group is revealed, as a sidebar
  // click would. Scrolling to it is useScrollToFocusedSessionTrace's job.
  const [scrollTarget, setScrollTarget] =
    useState<SessionConversationTimelineScrollTarget | null>(() =>
      focusTarget?.observationId
        ? {
            traceId: focusTarget.traceId,
            observationId: focusTarget.observationId,
            requestId: 1,
          }
        : null,
    );
  const scrollRequestIdRef = useRef(scrollTarget ? 1 : 0);
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

  const baseFilters: FilterState = [
    ...filterState,
    {
      column: "sessionId",
      type: "string",
      operator: "=",
      value: sessionId,
    },
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
  ];
  const filtersRequireIO = filterState.some(
    (filter) =>
      (filter.column === "hasInput" || filter.column === "hasOutput") &&
      filter.type === "boolean" &&
      filter.operator === "=" &&
      filter.value,
  );

  const traceIndexById = new Map(
    traces.map((trace, index) => [trace.id, index] as const),
  );
  const activeChunkIndices = new Set<number>();
  if (!searchQuery) {
    let highestChunkIndex = Math.min(
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
    for (let chunkIndex = 0; chunkIndex <= highestChunkIndex; chunkIndex++) {
      activeChunkIndices.add(chunkIndex);
    }
  }

  const queryDescriptors: Array<{
    key: string;
    page: number;
    traceIds: string[] | undefined;
  }> = [];
  if (searchQuery) {
    const key = `search:${filterMeasurementKey}:${searchQuery}`;
    const pageCount = pageCounts[key] ?? 1;
    for (let page = 1; page <= pageCount; page++) {
      queryDescriptors.push({ key, page, traceIds: undefined });
    }
  } else {
    for (const chunkIndex of activeChunkIndices) {
      const key = `browse:${filterMeasurementKey}:${chunkIndex}`;
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
      t.events.all(
        {
          projectId,
          filter: descriptor.traceIds
            ? [
                ...baseFilters,
                {
                  column: "traceId",
                  type: "stringOptions",
                  operator: "any of",
                  value: descriptor.traceIds,
                },
              ]
            : baseFilters,
          searchQuery: searchQuery || null,
          searchType: searchQuery ? ["id"] : [],
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

  const observationsByTraceId = new Map<
    string,
    NonNullable<ModernSessionSidebarTrace["observations"]>
  >();
  const timelineObservationsByTraceId = new Map<
    string,
    RouterOutputs["events"]["all"]["observations"]
  >();
  const observationIdsByTraceId = new Map<string, Set<string>>();
  const traceIdsWithMatchingTraceLevelIO = new Set<string>();
  for (const query of observationQueries) {
    for (const observation of query.data?.observations ?? []) {
      if (!observation.traceId) {
        continue;
      }
      if (observation.id === `t-${observation.traceId}`) {
        traceIdsWithMatchingTraceLevelIO.add(observation.traceId);
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
      const observations = observationsByTraceId.get(observation.traceId);
      const timelineObservations = timelineObservationsByTraceId.get(
        observation.traceId,
      );
      const row = {
        id: observation.id,
        name: observation.name,
        type: observation.type,
        latency: observation.latency,
      };
      if (observations) observations.push(row);
      else observationsByTraceId.set(observation.traceId, [row]);
      if (timelineObservations) timelineObservations.push(observation);
      else {
        timelineObservationsByTraceId.set(observation.traceId, [observation]);
      }
    }
  }

  const sidebarTraces: ModernSessionSidebarTrace[] = [];
  const incompleteTimelineTraceIds = new Set<string>();
  for (const [index, trace] of traces.entries()) {
    const chunkIndex = Math.floor(index / SIDEBAR_TRACE_CHUNK_SIZE);
    const chunkKey = `browse:${filterMeasurementKey}:${chunkIndex}`;
    const relevantQueryIndices = queryDescriptors.flatMap(
      (descriptor, queryIndex) =>
        descriptor.key ===
        (searchQuery
          ? `search:${filterMeasurementKey}:${searchQuery}`
          : chunkKey)
          ? [queryIndex]
          : [],
    );
    const hasLoadedObservations = observationsByTraceId.has(trace.id);
    const isPending =
      relevantQueryIndices.length === 0 ||
      relevantQueryIndices.every(
        (queryIndex) => observationQueries[queryIndex]?.isPending,
      );
    const isError = relevantQueryIndices.some(
      (queryIndex) => observationQueries[queryIndex]?.isError,
    );
    const lastRelevantQuery =
      observationQueries[relevantQueryIndices.at(-1) ?? -1];
    const mayHaveMoreObservations = Boolean(
      lastRelevantQuery?.isPending || lastRelevantQuery?.data?.hasMore,
    );
    if (mayHaveMoreObservations) incompleteTimelineTraceIds.add(trace.id);
    const observations =
      isPending && !hasLoadedObservations
        ? undefined
        : isError
          ? null
          : mayHaveMoreObservations && !hasLoadedObservations
            ? undefined
            : (observationsByTraceId.get(trace.id) ?? []);

    if (
      searchQuery &&
      !observationsByTraceId.has(trace.id) &&
      !traceIdsWithMatchingTraceLevelIO.has(trace.id)
    ) {
      continue;
    }

    sidebarTraces.push({
      trace,
      turnNumber: index + 1,
      idleGapSeconds:
        index === 0 ? null : computeIdleGapSeconds(traces[index - 1]!, trace),
      observations,
      hasMatchingTraceLevelIO:
        filtersRequireIO && traceIdsWithMatchingTraceLevelIO.has(trace.id),
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
  const observationLoadError = observationQueries.some(
    (query) => query.isError,
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
  const sidebarTraceById = new Map(
    sidebarTraces.map((sidebarTrace) => [sidebarTrace.trace.id, sidebarTrace]),
  );

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
      const sidebarTrace = sidebarTraceById.get(trace.id);
      const observations =
        sidebarTrace?.observations === null
          ? null
          : sidebarTrace?.observations === undefined ||
              incompleteTimelineTraceIds.has(trace.id)
            ? undefined
            : (timelineObservationsByTraceId.get(trace.id) ?? []);

      return {
        trace,
        turnNumber: index + 1,
        observations,
      };
    },
  );
  const timelineController =
    useSessionConversationTimelineController(timelineTraces);
  const handleSelect = (index: number, observationId?: string) => {
    const traceId = timelineTraces[index]?.trace.id;
    if (observationId && traceId) {
      scrollRequestIdRef.current += 1;
      setScrollTarget({
        traceId,
        observationId,
        requestId: scrollRequestIdRef.current,
      });
    }
    timelineController.onSelect(index, observationId);
  };

  // Trace -> session link context (`?focusTraceId=`): land the feed on the
  // trace / observation the user came from. The sidebar's active turn then
  // follows from the scroll spy like any other scroll position.
  const traceIds = useMemo(() => traces.map((trace) => trace.id), [traces]);
  useScrollToFocusedSessionTrace({
    enabled: tracesState.type === "loaded",
    focusTarget,
    traceIds,
    virtualizer: timelineController.virtualizer,
  });

  return (
    <div className="bg-background relative grid min-h-0 flex-1 grid-rows-[minmax(10rem,13rem)_minmax(0,1fr)] gap-x-4 overflow-hidden lg:grid-cols-[clamp(200px,24vw,296px)_minmax(0,1fr)] lg:grid-rows-1">
      {tracesState.type === "loading" ? (
        <ModernSessionSidebar state="loading" />
      ) : (
        <ModernSessionSidebar
          state="loaded"
          traces={isSearchPending ? [] : sidebarTraces}
          activeTraceId={timelineController.activeTraceId ?? undefined}
          filterControls={sidebarFilterControls}
          search={search}
          onSearchChange={handleSearchChange}
          expandedTraceIds={expandedTraceIds}
          onToggleTraceExpanded={toggleTraceExpanded}
          onFilterObservationByName={onFilterObservationByName}
          onSelect={handleSelect}
          onVisibleTraceIdsChange={handleVisibleTraceIdsChange}
          hasMoreObservations={hasMoreObservations}
          isLoadingMoreObservations={
            isSearchPending || isLoadingMoreObservations
          }
          observationLoadError={observationLoadError}
          onLoadMoreObservations={loadMoreObservations}
          onViewportUnderfilled={
            searchQuery && !isSearchPending ? loadMoreObservations : undefined
          }
        />
      )}
      <div className="bg-card dark:bg-background relative min-h-0 min-w-[320px]">
        <ConnectedSessionConversationTimeline
          traces={timelineTraces}
          projectId={projectId}
          sessionId={sessionId}
          filterState={filterState}
          filterMeasurementKey={filterMeasurementKey}
          viewLabel={viewLabel}
          openPeek={openPeek}
          controller={timelineController}
          scrollTarget={scrollTarget}
          onFilterObservationByName={onFilterObservationByName}
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
