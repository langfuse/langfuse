/* eslint-disable react/no-unstable-nested-components */
import { computeSelectedValues, type FilterState } from "@langfuse/shared";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type UIEvent,
} from "react";
import { useMediaQuery } from "react-responsive";
import { DataTable } from "@/src/components/table/data-table";
import useSessionStorage from "@/src/components/useSessionStorage";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import {
  orderedFacetTopics,
  useTracesWithSelection,
  type Facet,
  type FacetRow,
  type TopicTracesResult,
  type UseTopicTraces,
} from "./facet-topics";
import { Button } from "@/src/components/design-system/Button/Button";
import { TopicTraceLoadMore } from "./TopicTraceLoadMore";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useDefaultLayout,
} from "@/src/components/ui/resizable";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { TopicEmbeddingMap } from "./TopicEmbeddingMap";
import { TopicGroupCard } from "./TopicGroupCard";
import { topicBadgeColor, topicColor } from "./topic-map-colors";
import { TopicBadge } from "./TopicBadge";
import {
  filterTopicTraces,
  selectTopicTraceFilters,
  topicTraceQuery,
} from "./topic-trace-filters";
import { TopicsTraceToolbar } from "./TopicsTraceToolbar";

const OVERVIEW_PANEL_IDS = ["map", "groups"];
const LOAD_MORE_THRESHOLD_PX = 400;
const WORKSPACE_PANEL_IDS = ["overview", "traces"];

export function CurrentTopicsView({
  projectId,
  facet,
  mapResult,
  onOpenTrace,
  peekView,
  tracePanelRef,
  traceFilters,
  onGenerateTopics,
  canGenerateTopics,
  useTraces,
  showUnassigned,
}: CurrentTopicsViewProps) {
  const [selectedTraceId, setSelectedTraceId] = useSessionStorage<
    string | null
  >(`topics-selected-trace:${projectId}`, null);
  const isNarrow = useMediaQuery({ query: "(max-width: 1023px)" });
  const [mobilePanel, setMobilePanel] = useState("traces");
  const { filters, setFilters, searchQuery, setSearchQuery } = traceFilters;
  const filterKey = JSON.stringify([filters, searchQuery]);
  function selectTopic(topicId: string | null) {
    setFilters(selectTopicTraceFilters(filters, topicId));
  }
  function openTrace(traceId: string) {
    selectTrace(traceId);
    onOpenTrace(traceId);
  }
  function selectTrace(traceId: string | null) {
    setSelectedTraceId(traceId);
  }
  const topicFilters = filters.filter((filter) => filter.column === "topicId");
  const topics = useMemo(() => orderedFacetTopics(facet), [facet]);
  const traceQuery = topicTraceQuery(filters, searchQuery, topics, {
    assignedOnly: !showUnassigned,
  });
  const tableTraces = useTracesWithSelection(
    useTraces,
    traceQuery,
    selectedTraceId,
  );
  const isFiltered = filters.length > 0 || Boolean(searchQuery?.trim());
  // The count footer knows the total only for the whole facet or a single topic.
  const singleTopicId =
    traceQuery?.topicIds?.operator === "any of" &&
    traceQuery.topicIds.values.length === 1 &&
    !traceQuery.statuses &&
    !traceQuery.traceId
      ? traceQuery.topicIds.values[0]
      : null;
  const listTotal = !isFiltered
    ? facet.counts.total
    : (facet.topics.find((topic) => topic.id === singleTopicId)?.count ?? null);
  const mapPoints =
    mapResult.data?.status === "ready" ? mapResult.data.points : null;
  /** The map highlights its own points that match the filters; frame identity follows the matching IDs. */
  const matchingTraceKey = useMemo(() => {
    if (!isFiltered || !mapPoints) return null;
    const names = new Map(topics.map((topic) => [topic.id, topic.name]));
    const rows = mapPoints.map((point) => ({
      ...point,
      topicName: point.topicId ? (names.get(point.topicId) ?? null) : null,
    }));
    return JSON.stringify(
      filterTopicTraces(rows, filters, searchQuery)
        .map((row) => row.traceId)
        .sort(),
    );
  }, [isFiltered, mapPoints, topics, filters, searchQuery]);
  const matchingTraceIds = useMemo(
    () =>
      matchingTraceKey === null
        ? undefined
        : new Set<string>(JSON.parse(matchingTraceKey)),
    [matchingTraceKey],
  );
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
  const mapPanel = (
    <section
      aria-label="Topic map"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    >
      {facet.map ? (
        <TopicEmbeddingMap
          key={facet.map.runId}
          query={mapResult}
          topics={facet.map.topics}
          selectedTopic={null}
          matchingTraceIds={matchingTraceIds}
          onSelectTopic={selectTopic}
          onSelectTrace={selectTrace}
          selectedTraceId={
            selectedTraceId &&
            (!matchingTraceIds || matchingTraceIds.has(selectedTraceId))
              ? selectedTraceId
              : null
          }
          fillContainer
        />
      ) : null}
    </section>
  );
  const emptyTopics = (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h3 className="text-lg font-bold">Find patterns in your summaries</h3>
      <p className="text-muted-foreground max-w-sm text-sm">
        Generate topics to group similar summaries and discover recurring themes
        for this facet. Choose a time range and the facets to include in Manual
        processing.
      </p>
      <Button
        text="Generate topics"
        size="sm"
        disabled={!canGenerateTopics}
        onClick={onGenerateTopics}
      />
    </div>
  );
  const groupsPanel = (
    <section
      aria-label="Topic groups"
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-2">
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
        {facet.topics.length === 0 &&
          (facet.map?.topics.length ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              No traces are assigned to this map yet. Traces are assigned as
              they are processed.
            </p>
          ) : (
            emptyTopics
          ))}
      </div>
    </section>
  );
  const tracesPanel = (
    <section
      aria-label="Topic traces"
      ref={isNarrow ? undefined : tracePanelRef}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border"
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
        onOpenTrace={openTrace}
        selectedTraceId={selectedTraceId}
        onSelectTrace={selectTrace}
        peekView={peekView}
        traces={tableTraces}
        totalCount={listTotal}
        topics={topics}
      />
    </section>
  );
  const detailsPanel = isNarrow ? (
    <TopicsDetailsTabs
      value={mobilePanel}
      onValueChange={setMobilePanel}
      tracePanelRef={tracePanelRef}
      groupsPanel={groupsPanel}
      tracesPanel={tracesPanel}
    />
  ) : (
    groupsPanel
  );
  const overviewPanel = (
    <TopicsOverviewSplit
      isNarrow={isNarrow}
      hasMap={facet.map !== null}
      mapPanel={mapPanel}
    >
      {detailsPanel}
    </TopicsOverviewSplit>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2">
      <TopicsWorkspaceSplit
        isNarrow={isNarrow}
        overviewPanel={overviewPanel}
        tracesPanel={tracesPanel}
      />
    </div>
  );
}

function TopicsDetailsTabs({
  value,
  onValueChange,
  tracePanelRef,
  groupsPanel,
  tracesPanel,
}: TopicsDetailsTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={onValueChange}
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
  );
}

function TopicsOverviewSplit({
  isNarrow,
  hasMap,
  mapPanel,
  children,
}: TopicsOverviewSplitProps) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: isNarrow ? "topics-overview-size-narrow" : "topics-overview-size",
    panelIds: OVERVIEW_PANEL_IDS,
    storage: "local",
  });

  if (!hasMap) return children;

  return (
    <ResizablePanelGroup
      orientation="vertical"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="min-h-0 min-w-0 flex-1"
    >
      <ResizablePanel
        id="map"
        defaultSize={isNarrow ? "45%" : "60%"}
        minSize="20%"
      >
        {mapPanel}
      </ResizablePanel>
      <ResizableHandle
        withHandle
        aria-label="Resize topic map and groups"
        className="my-1"
      />
      <ResizablePanel id="groups" minSize="20%">
        {children}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function TopicsWorkspaceSplit({
  isNarrow,
  overviewPanel,
  tracesPanel,
}: TopicsWorkspaceSplitProps) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "topics-workspace-size",
    panelIds: WORKSPACE_PANEL_IDS,
    storage: "local",
  });
  if (isNarrow) return overviewPanel;

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="min-h-0 min-w-0 flex-1"
    >
      <ResizablePanel id="overview" defaultSize="50%" minSize="25%">
        {overviewPanel}
      </ResizablePanel>
      <ResizableHandle
        withHandle
        aria-label="Resize topic overview and traces"
        className="mx-1"
      />
      <ResizablePanel id="traces" minSize="25%">
        {tracesPanel}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function CurrentTraceTable({
  projectId,
  onOpenTrace,
  selectedTraceId,
  onSelectTrace,
  peekView,
  traces,
  totalCount,
  topics,
}: CurrentTraceTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const { rows } = traces;
  const selectedRowLoaded = rows.some((row) => row.traceId === selectedTraceId);
  // A trace picked on the map scrolls into view once its row is loaded.
  useEffect(() => {
    tableRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedTraceId, selectedRowLoaded]);
  const onScrollCapture = (event: UIEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.scrollTop + target.clientHeight >=
      target.scrollHeight - LOAD_MORE_THRESHOLD_PX
    )
      traces.loadMore();
  };
  const isMobile = useIsMobile();
  const topicColors = new Map(
    topics.map((topic, index) => [topic.id, topicBadgeColor(index)]),
  );
  function selectRow(row: FacetRow) {
    onSelectTrace(row.traceId);
  }
  const columns: LangfuseColumnDef<FacetRow>[] = [
    {
      accessorKey: "traceId",
      header: "Trace ID",
      size: 132,
      minSize: 100,
      cell: ({ row }) => {
        function openTrace() {
          onOpenTrace(row.original.traceId);
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
          onOpenTrace(row.original.traceId);
        }
        return (
          <div className="flex flex-col items-start gap-1">
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
          </div>
        );
      },
    },
  ];
  return (
    <div
      ref={tableRef}
      onScrollCapture={onScrollCapture}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <p className="text-muted-foreground shrink-0 px-3 py-1 text-xs tabular-nums">
        {`${rows.length.toLocaleString()}${traces.hasMore ? "+" : ""}${totalCount === null ? "" : ` of ~${totalCount.toLocaleString()}`} traces loaded`}
      </p>
      <DataTable
        tableName="topics-current-traces"
        columns={columns}
        columnVisibility={{ traceId: !isMobile, topicName: !isMobile }}
        data={{
          isLoading: traces.isLoading,
          isError: traces.error !== null,
          error: traces.error ?? undefined,
          data: rows.map((row) => ({ ...row, id: row.traceId })),
        }}
        topAlignCells
        className="min-h-0 overscroll-contain"
        cellPadding="relaxed"
        noResultsMessage="No matches. Adjust or clear your filters."
        rowSelection={selectedTraceId ? { [selectedTraceId]: true } : {}}
        onRowClick={selectRow}
        peekView={peekView}
      />
      {traces.hasMore && <TopicTraceLoadMore traces={traces} />}
    </div>
  );
}

type TopicsDetailsTabsProps = {
  value: string;
  onValueChange: (value: string) => void;
  tracePanelRef: CurrentTopicsViewProps["tracePanelRef"];
  groupsPanel: ReactNode;
  tracesPanel: ReactNode;
};

type TopicsOverviewSplitProps = {
  isNarrow: boolean;
  hasMap: boolean;
  mapPanel: ReactNode;
  children: ReactNode;
};

type TopicsWorkspaceSplitProps = {
  isNarrow: boolean;
  overviewPanel: ReactNode;
  tracesPanel: ReactNode;
};

type CurrentTraceTableProps = {
  projectId: string;
  onOpenTrace: (traceId: string) => void;
  selectedTraceId: string | null;
  onSelectTrace: (traceId: string) => void;
  peekView: DataTablePeekViewProps;
  traces: TopicTracesResult;
  /** Approximate total of the listed traces, when the filter has one. */
  totalCount: number | null;
  topics: { id: string }[];
};

type CurrentTopicsViewProps = {
  projectId: string;
  facet: Facet;
  onGenerateTopics: () => void;
  canGenerateTopics: boolean;
  mapResult: ComponentProps<typeof TopicEmbeddingMap>["query"];
  tracePanelRef?: (element: HTMLElement | null) => void;
  traceFilters: {
    filters: FilterState;
    setFilters: (filters: FilterState) => void;
    searchQuery: string | null;
    setSearchQuery: (query: string | null) => void;
  };
  onOpenTrace: (traceId: string) => void;
  peekView: DataTablePeekViewProps;
  useTraces: UseTopicTraces;
  showUnassigned: boolean;
};
