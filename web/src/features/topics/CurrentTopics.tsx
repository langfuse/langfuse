import { type ComponentProps, useMemo, useRef } from "react";
import { CircleAlert } from "@langfuse/icons";
import { TopicsCenteredState } from "./TopicsCenteredState";
import { Spinner } from "@/src/components/layouts/Spinner";
import { cn } from "@/src/utils/tailwind";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { api, type RouterOutputs } from "@/src/utils/api";
import { CurrentTopicsView } from "./CurrentTopicsView";
import { TopicListView } from "./TopicListView";
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
import {
  FacetTraceSource,
  useFacetTopicTraces,
  type TopicMapScope,
} from "./useFacetTopicTraces";

export function CurrentTopics({
  projectId,
  scope,
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
        <TopicsCenteredState
          icon={<CircleAlert size="lg" color="destructive" aria-hidden />}
          title={
            scope.analysisId ? "Couldn’t load this map" : "Couldn’t load topics"
          }
          body={result.error.message}
        />
      )}
      {result.isLoading && <Spinner message="Loading topics" />}
      {selectedFacet && (
        <CurrentFacet
          key={projectId}
          projectId={projectId}
          scope={scope}
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
  scope,
  facet: resultFacet,
  view,
  tracePanelRef,
  traceFilters,
  onGenerateTopics,
  canGenerateTopics,
  showUnassigned,
}: CurrentFacetProps) {
  const isHandheld = useIsHandheld();
  // Only the desktop Map view needs the run's projection.
  const mapQuery = useCurrentTopicMap(
    projectId,
    view === "map" && !isHandheld ? resultFacet.map?.runId : undefined,
  );
  // Stable identities keep the map camera and grid layout across re-renders.
  const facet = useMemo(
    () => (showUnassigned ? resultFacet : facetWithoutUnassigned(resultFacet)),
    [resultFacet, showUnassigned],
  );

  const { ruleId, analysisId } = scope;
  const traceSource = useMemo(
    () => ({ projectId, facetId: facet.facetId, ruleId, analysisId }),
    [projectId, facet.facetId, ruleId, analysisId],
  );
  const mapData = useMemo(
    () =>
      showUnassigned || !mapQuery.data
        ? mapQuery.data
        : mapWithoutUnassigned(mapQuery.data),
    [mapQuery.data, showUnassigned],
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
          view="treemap"
          mapResult={mapResult}
          traceFilters={traceFilters}
          onGenerateTopics={onGenerateTopics}
          canGenerateTopics={canGenerateTopics}
          onOpenTrace={peekNavigation.openPeek}
          showUnassigned={showUnassigned}
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
          onOpenTrace={peekNavigation.openPeek}
          peekView={peekView}
          useTraces={useFacetTopicTraces}
          showUnassigned={showUnassigned}
        />
      );
    if (view === "list")
      return (
        <TopicListView
          key={facet.facetId}
          projectId={projectId}
          facet={facet}
          peekView={peekView}
          tracePanelRef={tracePanelRef}
          useTraces={useFacetTopicTraces}
        />
      );
    return (
      <TopicTreemapView
        key={facet.facetId}
        projectId={projectId}
        facet={facet}
        peekView={peekView}
        useTraces={useFacetTopicTraces}
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
  | "traceFilters"
  | "onGenerateTopics"
  | "canGenerateTopics"
  | "showUnassigned"
> & {
  view: "treemap";
  mapResult: ComponentProps<typeof MobileTopicsView>["mapResult"];
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
  ruleId,
  enabled = true,
}: {
  projectId: string;
  running: boolean;
  pollForSummaries?: boolean;
  refreshAfter: number;
  /** Scopes topics to one rule's map; omitted means every rule. */
  ruleId?: string;
  enabled?: boolean;
}) {
  const utils = api.useUtils();
  const tracesResetFor = useRef(refreshAfter);
  return useQuery({
    queryKey: [
      ...getQueryKey(api.topics.currentResults, { projectId, ruleId }, "query"),
      // A completed status needs a new request, even if an older poll is in flight.
      running ? 0 : refreshAfter,
    ],
    queryFn: async ({ signal }) => {
      const results = await utils.client.topics.currentResults.query(
        { projectId, ruleId },
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
    enabled,
    meta: { toastOperation: "topics.load" },
  });
}

type CurrentTopicsProps = {
  projectId: string;
  scope: TopicMapScope;
  /** Current topics of a rule, or one analysis run's snapshot. */
  result: {
    data: { facets: Facet[] } | undefined;
    isLoading: boolean;
    error: { message: string } | null;
  };
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
  scope: TopicMapScope;
  facet: Facet;
  view: TopicsResultsView;
  tracePanelRef?: (element: HTMLElement | null) => void;
  traceFilters: ReturnType<typeof useTopicTraceFilters>;
  onGenerateTopics: () => void;
  canGenerateTopics: boolean;
  showUnassigned: boolean;
};

type Facet = RouterOutputs["topics"]["currentResults"]["facets"][number];

function useCurrentTopicMap(projectId: string, runId: string | undefined) {
  return api.topics.map.useQuery(
    { projectId, runId: runId ?? "" },
    { enabled: Boolean(runId) },
  );
}

export const __test = { useCurrentTopics };
