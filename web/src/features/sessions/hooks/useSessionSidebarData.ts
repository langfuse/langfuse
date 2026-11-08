import { useState } from "react";
import { type FilterState } from "@langfuse/shared";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { useDebounce } from "@/src/hooks/useDebounce";
import { api } from "@/src/utils/api";
import { type ModernSessionSidebarTrace } from "@/src/features/sessions/ModernSessionSidebar";
import { computeIdleGapSeconds } from "@/src/features/sessions/sessionIdleGap";

const SIDEBAR_TRACE_CHUNK_SIZE = 20;
const SIDEBAR_OBSERVATION_PAGE_SIZE = 100;

export function useSessionSidebarData({
  traces,
  projectId,
  sessionId,
  sessionMinTimestamp,
  sessionMaxTimestamp,
  filterState,
  filterMeasurementKey,
  includeTraceLevelObservations,
}: {
  traces: EventSessionTrace[];
  projectId: string;
  sessionId: string;
  sessionMinTimestamp: Date;
  sessionMaxTimestamp: Date;
  filterState: FilterState;
  filterMeasurementKey: string;
  includeTraceLevelObservations: boolean;
}) {
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSetSearchQuery = useDebounce(setSearchQuery, 500, false);
  const isSearchPending = search.trim() !== searchQuery;
  const [collapsedTraceIds, setCollapsedTraceIds] = useState<Set<string>>(
    new Set(),
  );
  const [visibleTraceIds, setVisibleTraceIds] = useState<string[]>([]);
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});
  const expandedTraceIds = new Set(
    traces
      .filter((trace) => !collapsedTraceIds.has(trace.id))
      .map((trace) => trace.id),
  );

  const baseFilters: FilterState = [
    ...filterState,
    { column: "sessionId", type: "string", operator: "=", value: sessionId },
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
  const traceIndexById = new Map(
    traces.map((trace, index) => [trace.id, index] as const),
  );
  const activeChunkIndices = new Set<number>();
  if (!searchQuery) {
    for (const traceId of visibleTraceIds) {
      if (!expandedTraceIds.has(traceId)) continue;
      const traceIndex = traceIndexById.get(traceId);
      if (traceIndex === undefined) continue;
      activeChunkIndices.add(Math.floor(traceIndex / SIDEBAR_TRACE_CHUNK_SIZE));
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
      t.events.sessionAll(
        {
          projectId,
          sessionId,
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
        { staleTime: 60 * 1000, refetchOnWindowFocus: false },
      ),
    ),
  );

  const traceQueryStates = traces.map((trace, index) => {
    const chunkIndex = Math.floor(index / SIDEBAR_TRACE_CHUNK_SIZE);
    const key = searchQuery
      ? `search:${filterMeasurementKey}:${searchQuery}`
      : `browse:${filterMeasurementKey}:${chunkIndex}`;
    const relevantQueryIndices = queryDescriptors.flatMap(
      (descriptor, queryIndex) => (descriptor.key === key ? [queryIndex] : []),
    );
    const lastRelevantQuery =
      observationQueries[relevantQueryIndices.at(-1) ?? -1];
    return {
      trace,
      index,
      isPending:
        relevantQueryIndices.length === 0 ||
        relevantQueryIndices.every(
          (queryIndex) => observationQueries[queryIndex]?.isPending,
        ),
      isError: relevantQueryIndices.some(
        (queryIndex) => observationQueries[queryIndex]?.isError,
      ),
      mayHaveMoreObservations: Boolean(
        lastRelevantQuery?.isPending || lastRelevantQuery?.data?.hasMore,
      ),
    };
  });

  const filtersRequireIO = filterState.some(
    (filter) =>
      (filter.column === "hasInput" || filter.column === "hasOutput") &&
      filter.type === "boolean" &&
      filter.operator === "=" &&
      filter.value,
  );
  const observationsByTraceId = new Map<
    string,
    NonNullable<ModernSessionSidebarTrace["observations"]>
  >();
  const observationIdsByTraceId = new Map<string, Set<string>>();
  const traceIdsWithMatchingTraceLevelIO = new Set<string>();
  for (const query of observationQueries) {
    for (const observation of query.data?.observations ?? []) {
      if (!observation.traceId) continue;
      if (observation.id === `t-${observation.traceId}`) {
        traceIdsWithMatchingTraceLevelIO.add(observation.traceId);
        if (!includeTraceLevelObservations) continue;
      }
      const observationIds = observationIdsByTraceId.get(observation.traceId);
      if (observationIds?.has(observation.id)) continue;
      if (observationIds) observationIds.add(observation.id);
      else {
        observationIdsByTraceId.set(
          observation.traceId,
          new Set([observation.id]),
        );
      }
      const observations = observationsByTraceId.get(observation.traceId);
      const row = {
        id: observation.id,
        name: observation.name,
        type: observation.type,
        latency: observation.latency,
      };
      if (observations) observations.push(row);
      else observationsByTraceId.set(observation.traceId, [row]);
    }
  }
  const sidebarTraces: ModernSessionSidebarTrace[] = [];
  for (const {
    trace,
    index,
    isPending,
    isError,
    mayHaveMoreObservations,
  } of traceQueryStates) {
    const hasLoadedObservations = observationsByTraceId.has(trace.id);
    const observations = (() => {
      if (isPending && !hasLoadedObservations) return undefined;
      if (isError) return null;
      if (mayHaveMoreObservations && !hasLoadedObservations) return undefined;
      return observationsByTraceId.get(trace.id) ?? [];
    })();
    if (
      searchQuery &&
      !hasLoadedObservations &&
      !traceIdsWithMatchingTraceLevelIO.has(trace.id)
    )
      continue;
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
        if (!query?.data?.hasMore || query.isFetching || !descriptor) continue;
        if (next === current) next = { ...current };
        next[key] = Math.max(current[key] ?? 1, descriptor.page + 1);
      }
      return next;
    });
  };
  const handleVisibleTraceIdsChange = (nextTraceIds: string[]) => {
    setVisibleTraceIds((current) => {
      if (
        current.length === nextTraceIds.length &&
        current.every((traceId, index) => traceId === nextTraceIds[index])
      )
        return current;
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

  return {
    search,
    searchQuery,
    isSearchPending,
    expandedTraceIds,
    sidebarTraces,
    hasMoreObservations,
    isLoadingMoreObservations,
    observationLoadError,
    loadMoreObservations,
    handleVisibleTraceIdsChange,
    handleSearchChange,
    toggleTraceExpanded,
  };
}
