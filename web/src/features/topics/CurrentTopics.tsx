import type { TopicTimeRange } from "@langfuse/shared/topics";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { cn } from "@/src/utils/tailwind";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { api, type RouterOutputs } from "@/src/utils/api";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { SummaryInspector } from "./SummaryInspector";
import { isValidTopicTimeRange } from "./time-range";
import { CurrentTopicsView } from "./CurrentTopicsView";
import type { useTopicTraceFilters } from "./useTopicTraceFilters";

export function CurrentTopics({
  projectId,
  timeRange,
  result,
  selectedFacetId,
  tracePanelRef,
  traceFilters,
}: CurrentTopicsProps) {
  const selectedFacet = result.data?.find(
    (facet) => facet.facetId === selectedFacetId,
  );
  const empty = !result.isLoading && !result.error && result.data?.length === 0;
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
          key={selectedFacet.facetId}
          projectId={projectId}
          facet={selectedFacet}
          timeRange={timeRange}
          tracePanelRef={tracePanelRef}
          traceFilters={traceFilters}
        />
      )}
    </section>
  );
}

function CurrentFacet({
  projectId,
  facet,
  timeRange,
  tracePanelRef,
  traceFilters,
}: CurrentFacetProps) {
  const mapResult = useCurrentTopicMap(projectId, facet, timeRange);
  const peekNavigation = usePeekNavigation({
    tableName: "topics-traces",
    isV4: false,
    queryParams: ["observation", "display", "timestamp", "traceId"],
  });
  const peekView = { itemType: "TRACE" as const, ...peekNavigation };
  return (
    <DialogController<SummarySource>
      renderDialog={({ state }) => (
        <Dialog title="Summary source" size="lg" closeOnInteractionOutside>
          <Dialog.Body>
            <div className="ph-no-capture flex flex-col gap-4">
              <p className="text-muted-foreground">
                View the current trace transcript for this summary.
              </p>
              <SummaryInspector
                projectId={projectId}
                facetId={facet.facetId}
                {...state}
              />
            </div>
          </Dialog.Body>
        </Dialog>
      )}
    >
      {({ openDialog }) => (
        <CurrentTopicsView
          projectId={projectId}
          facet={facet}
          mapResult={mapResult}
          tracePanelRef={tracePanelRef}
          traceFilters={traceFilters}
          onOpenTrace={peekNavigation.openPeek}
          onInspectTranscript={openDialog}
          peekView={peekView}
        />
      )}
    </DialogController>
  );
}

function useCurrentTopicMap(
  projectId: string,
  facet: Facet,
  timeRange: TopicTimeRange,
) {
  return api.topics.map.useQuery(
    { projectId, runId: facet.map?.runId ?? "", timeRange },
    { enabled: Boolean(facet.map) },
  );
}

export function useCurrentTopics({
  projectId,
  running,
  refreshAfter,
  timeRange,
}: {
  projectId: string;
  running: boolean;
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
    refetchInterval: running ? 3000 : false,
    enabled: isValidTopicTimeRange(timeRange),
    meta: { toastOperation: "topics.load" },
  });
}

type CurrentTopicsProps = {
  projectId: string;
  timeRange: TopicTimeRange;
  result: Pick<
    ReturnType<typeof useCurrentTopics>,
    "data" | "isLoading" | "error"
  >;
  selectedFacetId: string | undefined;
  tracePanelRef?: (element: HTMLElement | null) => void;
  traceFilters: ReturnType<typeof useTopicTraceFilters>;
};

type CurrentFacetProps = {
  projectId: string;
  facet: Facet;
  timeRange: TopicTimeRange;
  tracePanelRef?: (element: HTMLElement | null) => void;
  traceFilters: ReturnType<typeof useTopicTraceFilters>;
};

type Facet = RouterOutputs["topics"]["currentResults"][number];
type SummarySource = Pick<
  Facet["rows"][number],
  "traceId" | "facetVersion" | "unitStartTime"
>;

export const __test = { useCurrentTopics };
