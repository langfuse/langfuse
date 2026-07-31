import React, { useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type FilterState } from "@langfuse/shared";

import { LazySessionTraceEventsRow } from "@/src/components/session/LazySessionTraceEventsRow";
import { SessionVirtualizedRow } from "@/src/components/session/SessionVirtualizedRow";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { useElementSize } from "@/src/hooks/useElementSize";
import { useDebounce } from "@/src/hooks/useDebounce";
import { useVirtualizedScrollSpy } from "@/src/hooks/useVirtualizedScrollSpy";
import {
  ModernSessionSidebar,
  type ModernSessionSidebarFilterControls,
  type ModernSessionSidebarTrace,
} from "@/src/components/session/ModernSessionSidebar";
import { api } from "@/src/utils/api";

const MODERN_SESSION_OVERSCAN = 5;
const SIDEBAR_TRACE_CHUNK_SIZE = 20;
const SIDEBAR_OBSERVATION_PAGE_SIZE = 100;
const EMPTY_TRACES: EventSessionTrace[] = [];

type OpenPeek = (id: string, row: EventSessionTrace) => void;

type ModernSessionProps = {
  tracesState:
    | { type: "loading" }
    | { type: "loaded"; traces: EventSessionTrace[] };
  projectId: string;
  sessionId: string;
  sessionMinTimestamp: Date;
  sessionMaxTimestamp: Date;
  openPeek: OpenPeek;
  traceCommentCounts: Map<string, number> | undefined;
  filterState: FilterState;
  filterMeasurementKey: string;
  viewLabel: string | null;
  showInlineToolCalls: boolean;
  showSystemPrompt: boolean;
  sidebarFilterControls: ModernSessionSidebarFilterControls;
  onExcludeObservation: (name: string) => void;
};

export function ModernSession({
  tracesState,
  projectId,
  sessionId,
  sessionMinTimestamp,
  sessionMaxTimestamp,
  openPeek,
  traceCommentCounts,
  filterState,
  filterMeasurementKey,
  viewLabel,
  showInlineToolCalls,
  showSystemPrompt,
  sidebarFilterControls,
  onExcludeObservation,
}: ModernSessionProps) {
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

  const handleVisibleTraceIdsChange = (nextTraceIds: string[]) => {
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
  const [feedRef, feedSize] = useElementSize<HTMLDivElement>();
  const virtualizer = useVirtualizer({
    count: traces.length,
    getScrollElement: () => feedRef.current,
    estimateSize: () => 520,
    overscan: MODERN_SESSION_OVERSCAN,
    getItemKey: (index) => traces[index]?.id ?? index,
  });
  const {
    activeItemId: activeTraceId,
    virtualItems,
    selectItem: selectTrace,
  } = useVirtualizedScrollSpy({
    items: traces,
    virtualizer,
    scrollElementRef: feedRef,
    viewportHeight: feedSize?.height ?? 0,
    endTransitionRatio: 0.2,
  });

  return (
    <div className="bg-background dark:bg-header relative grid min-h-0 flex-1 grid-rows-[minmax(10rem,13rem)_minmax(0,1fr)] gap-x-4 overflow-hidden lg:grid-cols-[clamp(200px,24vw,296px)_minmax(0,1fr)] lg:grid-rows-1">
      {tracesState.type === "loading" ? (
        <ModernSessionSidebar state="loading" />
      ) : (
        <ModernSessionSidebar
          state="loaded"
          traces={isSearchPending ? [] : sidebarTraces}
          activeTraceId={activeTraceId}
          filterControls={sidebarFilterControls}
          search={search}
          onSearchChange={handleSearchChange}
          expandedTraceIds={expandedTraceIds}
          onToggleTraceExpanded={toggleTraceExpanded}
          onExcludeObservation={onExcludeObservation}
          onSelect={selectTrace}
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
        <div
          ref={feedRef}
          className="h-full min-h-0 overflow-y-auto scroll-smooth"
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((virtualItem) => {
              const trace = traces[virtualItem.index];
              if (!trace) return null;

              const content = (
                <LazySessionTraceEventsRow
                  trace={trace}
                  projectId={projectId}
                  sessionId={sessionId}
                  openPeek={openPeek}
                  traceCommentCounts={traceCommentCounts}
                  index={virtualItem.index}
                  filterState={filterState}
                  viewLabel={viewLabel}
                  surface="modern"
                  contentMode={showInlineToolCalls ? "all" : "conversation"}
                  showSystemPrompt={showSystemPrompt}
                />
              );

              return (
                <SessionVirtualizedRow
                  key={virtualItem.key}
                  itemKey={String(virtualItem.key)}
                  measurementKey={`${String(virtualItem.key)}:${showInlineToolCalls}:${showSystemPrompt}:${filterMeasurementKey}`}
                  source="modern"
                  virtualItem={virtualItem}
                  virtualizer={virtualizer}
                >
                  {content}
                </SessionVirtualizedRow>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
