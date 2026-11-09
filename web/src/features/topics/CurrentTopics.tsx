import { useMemo, useRef } from "react";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Spinner } from "@/src/components/layouts/Spinner";
import { cn } from "@/src/utils/tailwind";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { api, type RouterOutputs } from "@/src/utils/api";
import { CurrentTopicsView } from "./CurrentTopicsView";
import { TopicGridView } from "./TopicGridView";
import { TopicTreemapView } from "./TopicTreemapView";
import { type TopicsResultsView } from "./TopicsResultsViewSelect";
import type { useTopicTraceFilters } from "./useTopicTraceFilters";
import { useIsHandheld } from "@/src/hooks/use-mobile";
import useSessionStorage from "@/src/components/useSessionStorage";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { MobileTopicsView } from "./MobileTopicsView";
import {
  facetWithoutUnassigned,
  mapWithoutUnassigned,
} from "./prepare-topic-display";
import { FacetTraceSource, useFacetTopicTraces } from "./useFacetTopicTraces";

export function CurrentTopics({
  projectId,
  result,
  selectedFacetId,
  view,
  tracePanelRef,
  traceFilters,
  onGenerateTopics,
  canGenerateTopics,
  showUnassigned,
}: CurrentTopicsProps) {
  const selectedFacet = result.data?.facets.find(
    (facet) => facet.facetId === selectedFacetId,
  );
  const empty =
    !result.isLoading && !result.error && result.data?.facets.length === 0;
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden",
        empty && "hidden",
      )}
    >
      {result.error && (
        <Alert variant="destructive" size="sm">
          <Alert.Description>
            <p className="break-words">{result.error.message}</p>
          </Alert.Description>
        </Alert>
      )}
      {result.isLoading && <Spinner message="Loading topics" />}
      {selectedFacet && (
        <CurrentFacet
          key={projectId}
          projectId={projectId}
          facet={selectedFacet}
          view={view}
          tracePanelRef={tracePanelRef}
          traceFilters={traceFilters}
          onGenerateTopics={onGenerateTopics}
          canGenerateTopics={canGenerateTopics}
          showUnassigned={showUnassigned}
        />
      )}
    </section>
  );
}

function CurrentFacet({
  projectId,
  facet: resultFacet,
  view,
  tracePanelRef,
  traceFilters,
  onGenerateTopics,
  canGenerateTopics,
  showUnassigned,
}: CurrentFacetProps) {
  const isHandheld = useIsHandheld();
  const mapQuery = useCurrentTopicMap(
    projectId,
    view === "treemap" || view === "treemap-side"
      ? undefined
      : resultFacet.map?.runId,
  );
  // Stable identities keep the map camera and grid layout across re-renders.
  const facet = useMemo(
    () => (showUnassigned ? resultFacet : facetWithoutUnassigned(resultFacet)),
    [resultFacet, showUnassigned],
  );
  const mapData = useMemo(
    () =>
      showUnassigned || !mapQuery.data
        ? mapQuery.data
        : mapWithoutUnassigned(mapQuery.data),
    [mapQuery.data, showUnassigned],
  );
  const traceSource = useMemo(
    () => ({ projectId, facetId: facet.facetId }),
    [projectId, facet.facetId],
  );
  const mapResult = { data: mapData, error: mapQuery.error };
  const peekNavigation = usePeekNavigation({
    tableName: "topics-traces",
    isV4: false,
    queryParams: ["observation", "display", "timestamp", "traceId"],
  });
  const peekView = { itemType: "TRACE" as const, ...peekNavigation };
  return (
    <FacetTraceSource.Provider value={traceSource}>
      {renderView()}
    </FacetTraceSource.Provider>
  );
  function renderView() {
    if (isHandheld)
      return (
        <MobileTopics
          projectId={projectId}
          facet={facet}
          view={view === "treemap-side" ? "treemap" : view}
          mapResult={mapResult}
          traceFilters={traceFilters}
          onGenerateTopics={onGenerateTopics}
          canGenerateTopics={canGenerateTopics}
          onOpenTrace={peekNavigation.openPeek}
          showUnassigned={showUnassigned}
        />
      );
    if (view === "treemap" || view === "treemap-side")
      return (
        <TopicTreemapView
          key={facet.facetId}
          projectId={projectId}
          facet={facet}
          onGenerateTopics={onGenerateTopics}
          canGenerateTopics={canGenerateTopics}
          peekView={peekView}
          sideBySide={view === "treemap-side"}
          tracePanelRef={tracePanelRef}
          useTraces={useFacetTopicTraces}
        />
      );
    if (view === "map")
      return (
        <CurrentTopicsView
          key={facet.facetId}
          projectId={projectId}
          facet={facet}
          mapResult={mapResult}
          tracePanelRef={tracePanelRef}
          traceFilters={traceFilters}
          onGenerateTopics={onGenerateTopics}
          canGenerateTopics={canGenerateTopics}
          onOpenTrace={peekNavigation.openPeek}
          peekView={peekView}
          useTraces={useFacetTopicTraces}
          showUnassigned={showUnassigned}
        />
      );
    return (
      <TopicGridView
        key={facet.facetId}
        projectId={projectId}
        facet={facet}
        mapResult={mapResult}
        tracePanelRef={tracePanelRef}
        onGenerateTopics={onGenerateTopics}
        canGenerateTopics={canGenerateTopics}
        onOpenTrace={peekNavigation.openPeek}
        peekView={peekView}
        useTraces={useFacetTopicTraces}
        showUnassigned={showUnassigned}
      />
    );
  }
}

function MobileTopics({
  projectId,
  facet,
  view,
  mapResult,
  traceFilters,
  onGenerateTopics,
  canGenerateTopics,
  onOpenTrace,
  showUnassigned,
}: Pick<
  CurrentFacetProps,
  | "projectId"
  | "facet"
  | "view"
  | "traceFilters"
  | "onGenerateTopics"
  | "canGenerateTopics"
  | "showUnassigned"
> & {
  mapResult: Pick<ReturnType<typeof useCurrentTopicMap>, "data" | "error">;
  onOpenTrace: (traceId: string) => void;
}) {
  const { isV4 } = useReadPath();
  const [selectedTraceId, setSelectedTraceId] = useSessionStorage<
    string | null
  >(`topics-selected-trace:${projectId}`, null);
  return (
    <MobileTopicsView
      projectId={projectId}
      facet={facet}
      view={view}
      mapResult={mapResult}
      filters={traceFilters.filters}
      searchQuery={traceFilters.searchQuery}
      onFiltersChange={traceFilters.setFilters}
      onSearchQueryChange={traceFilters.setSearchQuery}
      selectedTraceId={selectedTraceId}
      onSelectTrace={setSelectedTraceId}
      onOpenTrace={onOpenTrace}
      onGenerateTopics={onGenerateTopics}
      canGenerateTopics={canGenerateTopics}
      isV4={isV4}
      useTraces={useFacetTopicTraces}
      showUnassigned={showUnassigned}
    />
  );
}

export function useCurrentTopics({
  projectId,
  running,
  pollForSummaries = false,
  refreshAfter,
}: {
  projectId: string;
  running: boolean;
  pollForSummaries?: boolean;
  refreshAfter: number;
}) {
  const utils = api.useUtils();
  const tracesResetFor = useRef(refreshAfter);
  return useQuery({
    queryKey: [
      ...getQueryKey(api.topics.currentResults, { projectId }, "query"),
      // A completed status needs a new request, even if an older poll is in flight.
      running ? 0 : refreshAfter,
    ],
    queryFn: async ({ signal }) => {
      const results = await utils.client.topics.currentResults.query(
        { projectId },
        { signal },
      );
      // A completed run restarts trace lists at their first page; polls keep loaded pages.
      if (!running && tracesResetFor.current !== refreshAfter) {
        tracesResetFor.current = refreshAfter;
        utils.topics.traces.reset();
      }
      return results;
    },
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      if (running) return 3000;
      return pollForSummaries && !query.state.data?.hasStoredSummaries
        ? 10000
        : false;
    },
    meta: { toastOperation: "topics.load" },
  });
}

/** The published run's own cluster map; it does not follow any time range. */
function useCurrentTopicMap(projectId: string, runId: string | undefined) {
  return api.topics.map.useQuery(
    { projectId, runId: runId ?? "" },
    { enabled: Boolean(runId) },
  );
}

type CurrentTopicsProps = {
  projectId: string;
  result: Pick<
    ReturnType<typeof useCurrentTopics>,
    "data" | "isLoading" | "error"
  >;
  selectedFacetId: string | undefined;
  view: TopicsResultsView;
  tracePanelRef?: (element: HTMLElement | null) => void;
  traceFilters: ReturnType<typeof useTopicTraceFilters>;
  onGenerateTopics: () => void;
  canGenerateTopics: boolean;
  showUnassigned: boolean;
};

type CurrentFacetProps = {
  projectId: string;
  facet: Facet;
  view: TopicsResultsView;
  tracePanelRef?: (element: HTMLElement | null) => void;
  traceFilters: ReturnType<typeof useTopicTraceFilters>;
  onGenerateTopics: () => void;
  canGenerateTopics: boolean;
  showUnassigned: boolean;
};

type Facet = RouterOutputs["topics"]["currentResults"]["facets"][number];

export const __test = { useCurrentTopics };
