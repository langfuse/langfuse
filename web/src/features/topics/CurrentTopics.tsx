import type { TopicTimeRange } from "@langfuse/shared/topics";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { useState } from "react";
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
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { TopicEmbeddingMap } from "./TopicEmbeddingMap";
import { topicColor } from "./topic-map-colors";
import { SummaryInspector } from "./SummaryInspector";
import { isValidTopicTimeRange } from "./time-range";

type Facet = RouterOutputs["topics"]["currentResults"][number];

export function CurrentTopics({
  projectId,
  timeRange,
  result,
  selectedFacetId,
  tracePanelRef,
}: {
  projectId: string;
  timeRange: TopicTimeRange;
  result: ReturnType<typeof useCurrentTopics>;
  selectedFacetId: string | undefined;
  tracePanelRef?: (element: HTMLElement | null) => void;
}) {
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
}: {
  projectId: string;
  facet: Facet;
  timeRange: TopicTimeRange;
  tracePanelRef?: (element: HTMLElement | null) => void;
}) {
  const [selection, setSelection] = useState<string | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const isNarrow = useMediaQuery({ query: "(max-width: 1023px)" });
  const [mobilePanel, setMobilePanel] = useState("traces");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });
  function selectTopic(topicId: string | null) {
    setSelection(topicId);
    setSelectedTraceId(null);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }
  const selected =
    selection === "outliers" ||
    selection === "no_topic" ||
    selection === "awaiting_map" ||
    facet.topics.some((topic) => topic.id === selection) ||
    facet.map?.topics.some((topic) => topic.id === selection)
      ? selection
      : null;
  const visible = facet.rows.filter((row) => {
    if (selected === null) return true;
    if (selected === "outliers") return row.outcome === "outlier";
    if (selected === "no_topic")
      return (
        row.outcome === "not_applicable" || row.outcome === "insufficient_input"
      );
    if (selected === "awaiting_map") return row.outcome === "awaiting_map";
    return row.topicId === selected;
  });
  const outliers = facet.rows.filter((row) => row.outcome === "outlier").length;
  const noTopic = facet.rows.filter(
    (row) =>
      row.outcome === "not_applicable" || row.outcome === "insufficient_input",
  ).length;
  const topics = facet.map
    ? [
        ...facet.map.topics,
        ...facet.topics.filter(
          (topic) =>
            !facet.map!.topics.some((mapped) => mapped.id === topic.id),
        ),
      ]
    : facet.topics;
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
          selectedTopic={selected}
          onSelectTopic={selectTopic}
          onSelectTrace={setSelectedTraceId}
          selectedTraceId={selectedTraceId}
          headerStats={counts}
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
            <button
              key={topic.id}
              onClick={() => selectTopic(topic.id)}
              aria-pressed={selected === topic.id}
              className={cn(
                "hover:bg-muted/50 flex flex-col gap-1 rounded-md border p-2 text-left",
                selected === topic.id && "border-primary bg-muted/30",
              )}
            >
              <div className="flex w-full items-start justify-between gap-2">
                <h4 className="flex min-w-0 items-start gap-1.5 text-xs font-bold">
                  <span
                    className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: topicColor(
                        topics.findIndex((item) => item.id === topic.id),
                      ),
                    }}
                  />
                  {topic.name}
                </h4>
                <Badge text={topic.count.toLocaleString()} size="sm" />
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {topic.description}
              </p>
            </button>
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
      <div className="flex shrink-0 flex-wrap items-center gap-1 px-2 py-1.5">
        <Button
          text={`All traces (${facet.rows.length.toLocaleString()})`}
          size="sm"
          variant={selected === null ? "secondary" : "ghost"}
          onClick={() => selectTopic(null)}
        />
        {outliers > 0 && (
          <Button
            text={`Outliers (${outliers.toLocaleString()})`}
            size="sm"
            variant={selected === "outliers" ? "secondary" : "ghost"}
            onClick={() => selectTopic("outliers")}
          />
        )}
        {noTopic > 0 && (
          <Button
            text={`No topic (${noTopic.toLocaleString()})`}
            size="sm"
            variant={selected === "no_topic" ? "secondary" : "ghost"}
            onClick={() => selectTopic("no_topic")}
          />
        )}
        {facet.awaitingCount > 0 && (
          <Button
            text={`Awaiting update (${facet.awaitingCount.toLocaleString()})`}
            size="sm"
            variant={selected === "awaiting_map" ? "secondary" : "ghost"}
            onClick={() => selectTopic("awaiting_map")}
          />
        )}
      </div>
      <CurrentTraceTable
        projectId={projectId}
        facetId={facet.facetId}
        rows={visible}
        pagination={pagination}
        onPaginationChange={setPagination}
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

function CurrentTraceTable({
  projectId,
  facetId,
  rows,
  pagination,
  onPaginationChange,
}: {
  projectId: string;
  facetId: string;
  rows: Facet["rows"];
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
}) {
  const isMobile = useIsMobile();
  const peekNavigation = usePeekNavigation({
    tableName: "topics-traces",
    isV4: false,
    queryParams: ["observation", "display", "timestamp", "traceId"],
  });
  const peekConfig = { itemType: "TRACE" as const, ...peekNavigation };
  const pageIndex = Math.min(
    pagination.pageIndex,
    Math.max(0, Math.ceil(rows.length / pagination.pageSize) - 1),
  );
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
      cell: ({ row }) => (
        <TextLink
          path={`/project/${projectId}/traces/${encodeURIComponent(row.original.traceId)}`}
          value={row.original.traceId}
          onClick={() => peekNavigation.openPeek(row.original.traceId)}
        />
      ),
    },
    {
      accessorKey: "topicName",
      header: "Topic",
      size: 148,
      minSize: 100,
      cell: ({ row }) => (
        <Badge
          text={
            row.original.topicName ?? row.original.outcome.replaceAll("_", " ")
          }
        />
      ),
    },
    {
      accessorKey: "summary",
      header: "Summary",
      size: 300,
      minSize: 180,
      isFlexWidth: true,
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1 py-1">
          {isMobile && (
            <div className="flex w-full min-w-0 items-center justify-between gap-2">
              <Badge
                text={
                  row.original.topicName ??
                  row.original.outcome.replaceAll("_", " ")
                }
                size="sm"
              />
              <TextLink
                path={`/project/${projectId}/traces/${encodeURIComponent(row.original.traceId)}`}
                value="Open trace"
                onClick={() => peekNavigation.openPeek(row.original.traceId)}
              />
            </div>
          )}
          <p className="break-words whitespace-pre-wrap">
            {row.original.summary || "No applicable summary."}
          </p>
          <Button
            text="Inspect transcript"
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              openInspector({
                traceId: row.original.traceId,
                facetVersion: row.original.facetVersion,
                unitStartTime: row.original.unitStartTime,
              });
            }}
          />
        </div>
      ),
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
              state: { ...pagination, pageIndex },
              onChange: onPaginationChange,
              options: [20, 50, 100],
            }}
            topAlignCells
            className="min-h-0 overscroll-contain"
            cellPadding="compact"
            noResultsMessage="No traces in this selection."
            peekView={peekConfig}
          />
        </div>
      )}
    </DialogController>
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
  });
}

export const __test = { useCurrentTopics };
