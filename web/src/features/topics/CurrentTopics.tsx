import type { TopicTimeRange } from "@langfuse/shared/topics";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { cn } from "@/src/utils/tailwind";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { api, type RouterOutputs } from "@/src/utils/api";
import { isValidTopicTimeRange } from "./time-range";
import { CurrentTopicsView } from "./CurrentTopicsView";
import { TopicGridView } from "./TopicGridView";
import { TopicTreemapView } from "./TopicTreemapView";
import { type TopicsResultsView } from "./TopicsResultsViewSelect";
import type { useTopicTraceFilters } from "./useTopicTraceFilters";
import { useIsHandheld } from "@/src/hooks/use-mobile";
import useSessionStorage from "@/src/components/useSessionStorage";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { MobileTopicsView } from "./MobileTopicsView";

export function CurrentTopics({
  projectId,
  timeRange,
  result,
  selectedFacetId,
  view,
  tracePanelRef,
  traceFilters,
  onGenerateTopics,
  canGenerateTopics,
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
      {result.isLoading && <p className="text-sm">Loading topics…</p>}
      {selectedFacet && (
        <CurrentFacet
          key={projectId}
          projectId={projectId}
          facet={selectedFacet}
          timeRange={timeRange}
          view={view}
          tracePanelRef={tracePanelRef}
          traceFilters={traceFilters}
          onGenerateTopics={onGenerateTopics}
          canGenerateTopics={canGenerateTopics}
        />
      )}
    </section>
  );
}

function CurrentFacet({
  projectId,
  facet,
  timeRange,
  view,
  tracePanelRef,
  traceFilters,
  onGenerateTopics,
  canGenerateTopics,
}: CurrentFacetProps) {
  const isHandheld = useIsHandheld();
  const mapResult = useCurrentTopicMap(
    projectId,
    view === "treemap" || view === "treemap-side"
      ? undefined
      : facet.map?.runId,
    timeRange,
  );
  const peekNavigation = usePeekNavigation({
    tableName: "topics-traces",
    isV4: false,
    queryParams: ["observation", "display", "timestamp", "traceId"],
  });
  const peekView = { itemType: "TRACE" as const, ...peekNavigation };
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
    />
  );
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
}: Pick<
  CurrentFacetProps,
  | "projectId"
  | "facet"
  | "view"
  | "traceFilters"
  | "onGenerateTopics"
  | "canGenerateTopics"
> & {
  mapResult: ReturnType<typeof useCurrentTopicMap>;
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
    />
  );
}

export function useCurrentTopics({
  projectId,
  running,
  pollForSummaries = false,
  refreshAfter,
  timeRange,
}: {
  projectId: string;
  running: boolean;
  pollForSummaries?: boolean;
  refreshAfter: number;
  timeRange: TopicTimeRange;
}) {
  const { client } = api.useUtils();
  return useQuery({
    queryKey: [
      ...getQueryKey(
        api.topics.currentResults,
        { projectId, timeRange },
        "query",
      ),
      // A completed status needs a new request, even if an older poll is in flight.
      running ? 0 : refreshAfter,
    ],
    queryFn: ({ signal }) =>
      client.topics.currentResults.query({ projectId, timeRange }, { signal }),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      if (running) return 3000;
      return pollForSummaries && !query.state.data?.hasStoredSummaries
        ? 10000
        : false;
    },
    enabled: isValidTopicTimeRange(timeRange),
    meta: { toastOperation: "topics.load" },
  });
}

function useCurrentTopicMap(
  projectId: string,
  runId: string | undefined,
  timeRange: TopicTimeRange,
) {
  return api.topics.map.useQuery(
    { projectId, runId: runId ?? "", timeRange },
    {
      enabled: Boolean(runId),
      // A moved time range keeps the map (and its camera) up; a different run starts fresh.
      placeholderData: (previous, previousQuery) =>
        (previousQuery?.queryKey?.[1] as { input?: { runId?: string } })?.input
          ?.runId === runId
          ? previous
          : undefined,
    },
  );
}

type CurrentTopicsProps = {
  projectId: string;
  timeRange: TopicTimeRange;
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
};

type CurrentFacetProps = {
  projectId: string;
  facet: Facet;
  timeRange: TopicTimeRange;
  view: TopicsResultsView;
  tracePanelRef?: (element: HTMLElement | null) => void;
  traceFilters: ReturnType<typeof useTopicTraceFilters>;
  onGenerateTopics: () => void;
  canGenerateTopics: boolean;
};

type Facet = RouterOutputs["topics"]["currentResults"]["facets"][number];

export const __test = { useCurrentTopics };
