import React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type FilterState } from "@langfuse/shared";

import { LazySessionTraceEventsRow } from "@/src/features/sessions/LazySessionTraceEventsRow";
import { SessionVirtualizedRow } from "@/src/features/sessions/SessionVirtualizedRow";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { useElementSize } from "@/src/hooks/useElementSize";
import { useSessionSidebarData } from "@/src/features/sessions/hooks/useSessionSidebarData";
import { useSessionObservationNavigation } from "@/src/features/sessions/hooks/useSessionObservationNavigation";
import { useVirtualizedScrollSpy } from "@/src/hooks/useVirtualizedScrollSpy";
import { ModernSessionSidebar } from "@/src/features/sessions/ModernSessionSidebar";
import { api } from "@/src/utils/api";
import { getVisibleSessionObservations } from "@/src/features/sessions/sessionVisibleObservations";
import { SessionViewLayout } from "@/src/features/sessions/components/SessionViewLayout/SessionViewLayout";

const MODERN_SESSION_OVERSCAN = 5;
const EMPTY_TRACES: EventSessionTrace[] = [];

export function ConnectedSessionListBody({
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
  onCustomizeView,
  activeFilterCount,
  onFilterObservationByName,
}: {
  tracesState:
    | { type: "loading" }
    | { type: "loaded"; traces: EventSessionTrace[] };
  projectId: string;
  sessionId: string;
  sessionMinTimestamp: Date;
  sessionMaxTimestamp: Date;
  openPeek: (id: string, row: EventSessionTrace) => void;
  traceCommentCounts: Map<string, number> | undefined;
  filterState: FilterState;
  filterMeasurementKey: string;
  viewLabel: string | null;
  showInlineToolCalls: boolean;
  showSystemPrompt: boolean;
  onCustomizeView?: () => void;
  activeFilterCount: number;
  onFilterObservationByName: (
    name: string,
    operator: "any of" | "none of",
  ) => void;
}) {
  const traces =
    tracesState.type === "loaded" ? tracesState.traces : EMPTY_TRACES;
  const {
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
  } = useSessionSidebarData({
    traces,
    projectId,
    sessionId,
    sessionMinTimestamp,
    sessionMaxTimestamp,
    filterState,
    filterMeasurementKey,
    includeTraceLevelObservations: true,
  });

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
  const utils = api.useUtils();
  const navigateToObservation = useSessionObservationNavigation({
    feedRef,
    selectTrace,
    getObservationState: (index, observationId) => {
      const trace = traces[index];
      if (!trace) return "missing";
      const data = utils.sessions.observationsForTraceFromEvents.getData({
        projectId,
        sessionId,
        traceId: trace.id,
        filter: filterState,
      });
      const { visibleObservations } = getVisibleSessionObservations(
        data,
        trace.id,
      );
      if (!visibleObservations) return "loading";
      return visibleObservations.some(
        (observation) => observation.id === observationId,
      )
        ? "visible"
        : "missing";
    },
    onObservationNotFound: (index, observationId) => {
      const trace = traces[index];
      if (!trace) return;
      const row = { ...trace, observationId };
      openPeek(trace.id, row);
    },
  });
  const handleSelect = (index: number, observationId?: string) => {
    navigateToObservation(
      index,
      observationId === `t-${traces[index]?.id}` ? undefined : observationId,
    );
  };

  const sidebar = (onNavigate: () => void) =>
    tracesState.type === "loading" ? (
      <ModernSessionSidebar state="loading" observationLayout="flat" />
    ) : (
      <ModernSessionSidebar
        state="loaded"
        traces={isSearchPending ? [] : sidebarTraces}
        activeTraceId={activeTraceId}
        onCustomizeView={onCustomizeView}
        activeFilterCount={activeFilterCount}
        observationLayout="flat"
        search={search}
        onSearchChange={handleSearchChange}
        expandedTraceIds={expandedTraceIds}
        onToggleTraceExpanded={toggleTraceExpanded}
        onFilterObservationByName={onFilterObservationByName}
        onSelect={(...args) => {
          handleSelect(...args);
          onNavigate();
        }}
        onVisibleTraceIdsChange={handleVisibleTraceIdsChange}
        hasMoreObservations={hasMoreObservations}
        isLoadingMoreObservations={isSearchPending || isLoadingMoreObservations}
        observationLoadError={observationLoadError}
        onLoadMoreObservations={loadMoreObservations}
        onViewportUnderfilled={
          searchQuery && !isSearchPending ? loadMoreObservations : undefined
        }
      />
    );
  const content = (
    <div className="bg-card dark:bg-background session-review-stack:min-w-0 relative h-full min-h-0 min-w-0">
      <div
        ref={feedRef}
        className="h-full min-h-0 overflow-y-auto scroll-smooth px-4 py-4 sm:px-6 lg:px-10"
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

            return (
              <SessionVirtualizedRow
                key={virtualItem.key}
                itemKey={String(virtualItem.key)}
                measurementKey={`${String(virtualItem.key)}:${showInlineToolCalls}:${showSystemPrompt}:${filterMeasurementKey}`}
                source="modern"
                virtualItem={virtualItem}
                virtualizer={virtualizer}
              >
                <LazySessionTraceEventsRow
                  trace={trace}
                  projectId={projectId}
                  sessionId={sessionId}
                  openPeek={openPeek}
                  traceCommentCounts={traceCommentCounts}
                  index={virtualItem.index}
                  filterState={filterState}
                  viewLabel={viewLabel}
                  surface="card"
                  contentMode={showInlineToolCalls ? "all" : "conversation"}
                  showSystemPrompt={showSystemPrompt}
                  onCustomizeView={onCustomizeView}
                />
              </SessionVirtualizedRow>
            );
          })}
        </div>
      </div>
    </div>
  );
  return (
    <SessionViewLayout
      search={search}
      isLoading={tracesState.type === "loading"}
      renderSidebar={sidebar}
      customization={
        onCustomizeView ? { activeFilterCount, onCustomizeView } : undefined
      }
    >
      {content}
    </SessionViewLayout>
  );
}
