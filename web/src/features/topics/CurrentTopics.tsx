import { computeSelectedValues } from "@langfuse/shared";
import type { TopicTimeRange } from "@langfuse/shared/topics";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { useState, type MouseEvent } from "react";
import { useMediaQuery } from "react-responsive";
import { cn } from "@/src/utils/tailwind";
import { type OnChangeFn, type PaginationState } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { api, type RouterOutputs } from "@/src/utils/api";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { TopicEmbeddingMap } from "./TopicEmbeddingMap";
import { TopicGroupCard } from "./TopicGroupCard";
import { topicBadgeColor, topicColor } from "./topic-map-colors";
import { TopicBadge } from "./TopicBadge";
import { SummaryInspector } from "./SummaryInspector";
import { isValidTopicTimeRange } from "./time-range";
import {
  filterTopicTraces,
  selectTopicTraceFilters,
} from "./topic-trace-filters";
import { TopicsTraceToolbar } from "./TopicsTraceToolbar";
import type { useTopicTraceFilters } from "./useTopicTraceFilters";

type Facet = RouterOutputs["topics"]["currentResults"][number];

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

function CurrentFacet({
  projectId,
  facet,
  timeRange,
  tracePanelRef,
  traceFilters,
}: CurrentFacetProps) {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const isNarrow = useMediaQuery({ query: "(max-width: 1023px)" });
  const [mobilePanel, setMobilePanel] = useState("traces");
  const { filters, setFilters, searchQuery, setSearchQuery } = traceFilters;
  const filterKey = JSON.stringify([filters, searchQuery]);
  const [pageSize, setPageSize] = useState(20);
  function selectTopic(topicId: string | null) {
    setSelectedTraceId(null);
    setFilters(selectTopicTraceFilters(filters, topicId));
  }
  const visible = filterTopicTraces(facet.rows, filters, searchQuery);
  const isFiltered = filters.length > 0 || Boolean(searchQuery?.trim());
  const matchingTraceIds = isFiltered
    ? new Set(visible.map((row) => row.traceId))
    : undefined;
  const topicFilters = filters.filter((filter) => filter.column === "topicId");
  const topics = facet.map
    ? [
        ...facet.map.topics,
        ...facet.topics.filter(
          (topic) =>
            !facet.map!.topics.some((mapped) => mapped.id === topic.id),
        ),
      ]
    : facet.topics;
  const selectedTopicIds = new Set(
    topicFilters.length === 0 ||
      topicFilters.some((filter) => filter.type !== "stringOptions")
      ? []
      : topicFilters.reduce(
          (values, filter) => {
            const kept = new Set(computeSelectedValues(values, filter));
            return values.filter((value) => kept.has(value));
          },
          topics.map((topic) => topic.id),
        ),
  );
  const counts = (
    <p className="text-muted-foreground text-xs">
      {facet.rows.length.toLocaleString()} traces · {facet.topics.length} topics
      {facet.awaitingCount > 0 &&
        ` · ${facet.awaitingCount.toLocaleString()} awaiting a map or updated assignment`}
    </p>
  );
  const mapPanel = (
    <section
      aria-label="Topic map"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden"
    >
      {facet.map ? (
        <TopicEmbeddingMap
          timeRange={timeRange}
          projectId={projectId}
          runId={facet.map.runId}
          topics={facet.map.topics}
          selectedTopic={null}
          matchingTraceIds={matchingTraceIds}
          onSelectTopic={selectTopic}
          onSelectTrace={setSelectedTraceId}
          selectedTraceId={
            selectedTraceId &&
            (!matchingTraceIds || matchingTraceIds.has(selectedTraceId))
              ? selectedTraceId
              : null
          }
          fillContainer
        />
      ) : (
        <div className="flex flex-col gap-1 rounded-md border p-2">
          {counts}
          <p className="text-muted-foreground text-xs">
            {facet.usableCount.toLocaleString()} usable summaries collected for
            v{facet.facetVersion ?? 1}. Run Update topics to cluster stored
            summaries. You can configure the minimum there.
          </p>
        </div>
      )}
    </section>
  );
  const groupsPanel = (
    <section
      aria-label="Topic groups"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {facet.topics.map((topic) => (
            <TopicGroupCard
              key={topic.id}
              topic={topic}
              isSelected={selectedTopicIds.has(topic.id)}
              color={topicColor(
                topics.findIndex((item) => item.id === topic.id),
              )}
              onSelect={selectTopic}
            />
          ))}
        </div>
        {facet.topics.length === 0 && (
          <p className="text-muted-foreground text-xs">
            No topics yet. Inspect the collected summaries or update topics to
            find recurring groups.
          </p>
        )}
      </div>
    </section>
  );
  const tracesPanel = (
    <section
      aria-label="Topic traces"
      ref={isNarrow ? undefined : tracePanelRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border lg:col-start-2 lg:row-span-2 lg:row-start-1"
    >
      <TopicsTraceToolbar
        projectId={projectId}
        topics={topics}
        filters={filters}
        onFiltersChange={setFilters}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />
      <CurrentTraceTable
        key={filterKey}
        projectId={projectId}
        facetId={facet.facetId}
        rows={visible}
        totalCount={facet.rows.length}
        topics={topics}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
      />
    </section>
  );
  return (
    <div
      className={cn(
        "grid min-h-0 min-w-0 flex-1 gap-2 overflow-hidden lg:grid-cols-2",
        facet.map
          ? "grid-rows-[minmax(0,9fr)_minmax(0,11fr)] lg:grid-rows-[minmax(0,3fr)_minmax(0,2fr)]"
          : "grid-rows-[auto_minmax(0,1fr)]",
      )}
    >
      {mapPanel}
      {isNarrow ? (
        <Tabs
          value={mobilePanel}
          onValueChange={setMobilePanel}
          layout="fill"
          ref={tracePanelRef}
        >
          <div className="mb-2 shrink-0">
            <Tabs.List
              variant="inset"
              size="sm"
              layout="full"
              aria-label="Topics panels"
            >
              <Tabs.Trigger value="topics" label="Topics" />
              <Tabs.Trigger value="traces" label="Traces" />
            </Tabs.List>
          </div>
          <Tabs.Content value="topics" layout="fill">
            {groupsPanel}
          </Tabs.Content>
          <Tabs.Content value="traces" layout="fill">
            {tracesPanel}
          </Tabs.Content>
        </Tabs>
      ) : (
        <>
          {groupsPanel}
          {tracesPanel}
        </>
      )}
    </div>
  );
}

type CurrentFacetProps = {
  projectId: string;
  facet: Facet;
  timeRange: TopicTimeRange;
  tracePanelRef?: (element: HTMLElement | null) => void;
  traceFilters: ReturnType<typeof useTopicTraceFilters>;
};

function CurrentTraceTable({
  projectId,
  facetId,
  rows,
  totalCount,
  topics,
  pageSize,
  onPageSizeChange,
}: CurrentTraceTableProps) {
  const [requestedPageIndex, setPageIndex] = useState(0);
  const isMobile = useIsMobile();
  const peekNavigation = usePeekNavigation({
    tableName: "topics-traces",
    isV4: false,
    queryParams: ["observation", "display", "timestamp", "traceId"],
  });
  const peekConfig = { itemType: "TRACE" as const, ...peekNavigation };
  const topicColors = new Map(
    topics.map((topic, index) => [topic.id, topicBadgeColor(index)]),
  );
  const pageIndex = Math.min(
    requestedPageIndex,
    Math.max(0, Math.ceil(rows.length / pageSize) - 1),
  );
  const pagination = { pageIndex, pageSize };
  const onPaginationChange: OnChangeFn<PaginationState> = (update) => {
    const next = typeof update === "function" ? update(pagination) : update;
    setPageIndex(next.pageIndex);
    onPageSizeChange(next.pageSize);
  };
  const columns = (
    openInspector: (
      source: Pick<
        Facet["rows"][number],
        "traceId" | "facetVersion" | "unitStartTime"
      >,
    ) => void,
  ): LangfuseColumnDef<Facet["rows"][number]>[] => [
    {
      accessorKey: "traceId",
      header: "Trace ID",
      size: 132,
      minSize: 100,
      cell: ({ row }) => {
        function openTrace() {
          peekNavigation.openPeek(row.original.traceId);
        }
        return (
          <TextLink
            path={`/project/${projectId}/traces/${encodeURIComponent(row.original.traceId)}`}
            value={row.original.traceId}
            onClick={openTrace}
          />
        );
      },
    },
    {
      accessorKey: "topicName",
      header: "Topic",
      size: 148,
      minSize: 100,
      cell: ({ row }) => (
        <TopicBadge
          row={row.original}
          color={topicColors.get(row.original.topicId ?? "")}
          size="default"
        />
      ),
    },
    {
      accessorKey: "summary",
      header: "Summary",
      size: 300,
      minSize: 180,
      isFlexWidth: true,
      cell: ({ row }) => {
        function openTrace() {
          peekNavigation.openPeek(row.original.traceId);
        }
        function inspectTranscript(event: MouseEvent) {
          event.stopPropagation();
          openInspector({
            traceId: row.original.traceId,
            facetVersion: row.original.facetVersion,
            unitStartTime: row.original.unitStartTime,
          });
        }
        return (
          <div className="flex flex-col items-start gap-1 py-1">
            {isMobile && (
              <div className="flex w-full min-w-0 items-center justify-between gap-2">
                <div className="min-w-0">
                  <TopicBadge
                    row={row.original}
                    color={topicColors.get(row.original.topicId ?? "")}
                    size="sm"
                  />
                </div>
                <TextLink
                  path={`/project/${projectId}/traces/${encodeURIComponent(row.original.traceId)}`}
                  value="Open trace"
                  onClick={openTrace}
                />
              </div>
            )}
            <p className="break-words whitespace-pre-wrap">
              {row.original.summary || "No applicable summary."}
            </p>
            <Button
              text="Debug transcript"
              variant="secondary"
              size="sm"
              onClick={inspectTranscript}
            />
          </div>
        );
      },
    },
  ];
  return (
    <DialogController<
      Pick<Facet["rows"][number], "traceId" | "facetVersion" | "unitStartTime">
    >
      renderDialog={({ state }) => (
        <Dialog title="Summary source" size="lg" closeOnInteractionOutside>
          <Dialog.Body>
            <div className="ph-no-capture flex flex-col gap-4">
              <p className="text-muted-foreground">
                View the current trace transcript for this summary.
              </p>
              <SummaryInspector
                projectId={projectId}
                facetId={facetId}
                {...state}
              />
            </div>
          </Dialog.Body>
        </Dialog>
      )}
    >
      {({ openDialog }) => (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <DataTable
            tableName="topics-current-traces"
            columns={columns(openDialog)}
            columnVisibility={{ traceId: !isMobile, topicName: !isMobile }}
            data={{
              isLoading: false,
              isError: false,
              data: rows
                .slice(
                  pageIndex * pagination.pageSize,
                  (pageIndex + 1) * pagination.pageSize,
                )
                .map((row) => ({ ...row, id: row.traceId })),
            }}
            pagination={{
              totalCount: rows.length,
              resultCountLabel: `${rows.length.toLocaleString()} of ${totalCount.toLocaleString()} traces`,
              state: { ...pagination, pageIndex },
              onChange: onPaginationChange,
              options: [20, 50, 100],
            }}
            topAlignCells
            className="min-h-0 overscroll-contain"
            cellPadding="compact"
            noResultsMessage="No matches. Adjust or clear your filters."
            peekView={peekConfig}
          />
        </div>
      )}
    </DialogController>
  );
}

type CurrentTraceTableProps = {
  projectId: string;
  facetId: string;
  rows: Facet["rows"];
  totalCount: number;
  topics: { id: string }[];
  pageSize: number;
  onPageSizeChange: (pageSize: number) => void;
};

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

export const __test = { useCurrentTopics };
