/* eslint-disable react/no-unstable-nested-components */
import { computeSelectedValues, type FilterState } from "@langfuse/shared";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useMediaQuery } from "react-responsive";
import { type OnChangeFn, type PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/src/components/table/data-table";
import useSessionStorage from "@/src/components/useSessionStorage";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { type RouterOutputs } from "@/src/utils/api";
import { Button } from "@/src/components/design-system/Button/Button";
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
} from "./topic-trace-filters";
import { TopicsTraceToolbar } from "./TopicsTraceToolbar";

const OVERVIEW_PANEL_IDS = ["map", "groups"];
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
}: CurrentTopicsViewProps) {
  const [selectedTraceId, setSelectedTraceId] = useSessionStorage<
    string | null
  >(`topics-selected-trace:${projectId}`, null);
  const isNarrow = useMediaQuery({ query: "(max-width: 1023px)" });
  const [mobilePanel, setMobilePanel] = useState("traces");
  const { filters, setFilters, searchQuery, setSearchQuery } = traceFilters;
  const filterKey = JSON.stringify([filters, searchQuery]);
  const [pageSize, setPageSize] = useState(20);
  const [pageRequest, setPageRequest] = useState({
    filterKey,
    pageIndex: 0,
    followSelection: true,
  });
  if (pageRequest.filterKey !== filterKey) {
    setPageRequest({ filterKey, pageIndex: 0, followSelection: true });
  }
  function selectTopic(topicId: string | null) {
    setFilters(selectTopicTraceFilters(filters, topicId));
  }
  function openTrace(traceId: string) {
    selectTrace(traceId);
    onOpenTrace(traceId);
  }
  const { visible, matchingTraceKey } = useMemo(() => {
    const isFiltered = filters.length > 0 || Boolean(searchQuery?.trim());
    const visible = isFiltered
      ? filterTopicTraces(facet.rows, filters, searchQuery)
      : facet.rows;
    return {
      visible,
      matchingTraceKey: isFiltered
        ? JSON.stringify([...new Set(visible.map((row) => row.traceId))].sort())
        : null,
    };
  }, [facet.rows, filters, searchQuery]);
  const selectedRowIndex = visible.findIndex(
    (row) => row.traceId === selectedTraceId,
  );
  const { followSelection } = pageRequest;
  const pageIndex = Math.min(
    followSelection && selectedRowIndex >= 0
      ? Math.floor(selectedRowIndex / pageSize)
      : pageRequest.pageIndex,
    Math.max(0, Math.ceil(visible.length / pageSize) - 1),
  );
  const pagination = { pageIndex, pageSize };
  function selectTrace(traceId: string | null) {
    setSelectedTraceId(traceId);
    setPageRequest({ filterKey, pageIndex, followSelection: traceId !== null });
  }
  const onPaginationChange: OnChangeFn<PaginationState> = (update) => {
    const next = typeof update === "function" ? update(pagination) : update;
    setPageRequest({
      filterKey,
      pageIndex: next.pageIndex,
      followSelection: false,
    });
    setPageSize(next.pageSize);
  };
  /** Frame identity changes only when matching IDs change, preserving hover and focus across refreshes. */
  const matchingTraceIds = useMemo(
    () =>
      matchingTraceKey === null
        ? undefined
        : new Set<string>(JSON.parse(matchingTraceKey)),
    [matchingTraceKey],
  );
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
              No topic assignments in this time range. Choose a different time
              range to explore existing topics.
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
        rows={visible}
        totalCount={facet.rows.length}
        topics={topics}
        pagination={pagination}
        onPaginationChange={onPaginationChange}
        revealRowIndex={followSelection ? selectedRowIndex : -1}
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
  rows,
  totalCount,
  topics,
  pagination,
  onPaginationChange,
  revealRowIndex,
}: CurrentTraceTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const { pageIndex } = pagination;
  useEffect(() => {
    if (revealRowIndex >= 0) {
      tableRef.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedTraceId, revealRowIndex, pageIndex]);
  const isMobile = useIsMobile();
  const topicColors = new Map(
    topics.map((topic, index) => [topic.id, topicBadgeColor(index)]),
  );
  function selectRow(row: Facet["rows"][number]) {
    onSelectTrace(row.traceId);
  }
  const columns: LangfuseColumnDef<Facet["rows"][number]>[] = [
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
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <DataTable
        tableName="topics-current-traces"
        columns={columns}
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
        cellPadding="relaxed"
        noResultsMessage="No matches. Adjust or clear your filters."
        rowSelection={selectedTraceId ? { [selectedTraceId]: true } : {}}
        onRowClick={selectRow}
        peekView={peekView}
      />
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
  rows: Facet["rows"];
  totalCount: number;
  topics: { id: string }[];
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  revealRowIndex: number;
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
};

type Facet = RouterOutputs["topics"]["currentResults"]["facets"][number];
