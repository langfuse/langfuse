import { useEffect, useRef, useState } from "react";
import { Columns2 } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { type OnChangeFn, type PaginationState } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { api, type RouterOutputs } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import {
  DialogController,
  DialogBody,
  DialogTitle,
  DialogDescription,
} from "@/src/components/ui/dialog";
import {
  TabsBar,
  TabsBarContent,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { TopicEmbeddingMap, topicColor } from "./TopicEmbeddingMap";
import { SummaryInspector } from "./SummaryInspector";

type Facet = RouterOutputs["topics"]["currentResults"][number];

export function CurrentTopics({
  projectId,
  running,
  refreshAfter,
}: {
  projectId: string;
  running: boolean;
  refreshAfter: number;
}) {
  const [selectedFacetId, setSelectedFacetId] = useState<string>();
  const { client } = api.useUtils();
  const result = useQuery({
    queryKey: [
      ...getQueryKey(api.topics.currentResults, { projectId }, "query"),
      // A completed status needs a new request, even if an older poll is in flight.
      running ? 0 : refreshAfter,
    ],
    queryFn: ({ signal }) =>
      client.topics.currentResults.query({ projectId }, { signal }),
    placeholderData: keepPreviousData,
    refetchInterval: running ? 3000 : false,
  });
  const selectedFacet = result.data?.some(
    (facet) => facet.facetId === selectedFacetId,
  )
    ? selectedFacetId
    : result.data?.[0]?.facetId;
  const empty = !result.isLoading && !result.error && result.data?.length === 0;
  return (
    <section className={cn("flex min-w-0 flex-col gap-5", empty && "hidden")}>
      {result.error && (
        <p role="alert" className="text-destructive text-sm">
          {result.error.message}
        </p>
      )}
      {result.isLoading && <p className="text-sm">Loading topics…</p>}
      {selectedFacet && (
        <TabsBar value={selectedFacet} onValueChange={setSelectedFacetId}>
          <TabsBarList aria-label="Facets" className="shrink-0 overflow-x-auto">
            {result.data?.map((facet) => (
              <TabsBarTrigger key={facet.facetId} value={facet.facetId}>
                {facet.name}
              </TabsBarTrigger>
            ))}
          </TabsBarList>
          {result.data?.map((facet) => (
            <TabsBarContent key={facet.facetId} value={facet.facetId}>
              <CurrentFacet projectId={projectId} facet={facet} />
            </TabsBarContent>
          ))}
        </TabsBar>
      )}
    </section>
  );
}

function CurrentFacet({
  projectId,
  facet,
}: {
  projectId: string;
  facet: Facet;
}) {
  const [selection, setSelection] = useState<string | null>(null);
  const [split, setSplit] = useState(false);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
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
    facet.topics.some((topic) => topic.id === selection)
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
  function selectTrace(traceId: string | null, syncTable = split) {
    setSelectedTraceId(traceId);
    if (traceId === null || !syncTable) return;
    let index = visible.findIndex((row) => row.traceId === traceId);
    if (index < 0) {
      index = facet.rows.findIndex((row) => row.traceId === traceId);
      if (index < 0) return;
      setSelection(null);
    }
    setPagination((current) => ({
      ...current,
      pageIndex: Math.floor(index / current.pageSize),
    }));
  }
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
    <p className="text-muted-foreground text-sm">
      {facet.rows.length.toLocaleString()} traces · {facet.topics.length} topics
      {facet.awaitingCount > 0 &&
        ` · ${facet.awaitingCount.toLocaleString()} awaiting a map or updated assignment`}
    </p>
  );
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {!facet.map && counts}
      {!facet.map && (
        <p className="text-muted-foreground text-sm">
          {facet.usableCount.toLocaleString()} usable summaries collected for v
          {facet.facetVersion ?? 1}. Run Update topics to cluster stored
          summaries. You can configure the minimum there.
        </p>
      )}
      <div className={cn("grid min-w-0 gap-3", split && "lg:grid-cols-2")}>
        {facet.map && (
          <div className="flex min-w-0 flex-col gap-3">
            <TopicEmbeddingMap
              projectId={projectId}
              runId={facet.map.runId}
              topics={facet.map.topics}
              selectedTopic={selected}
              onSelectTopic={selectTopic}
              onSelectTrace={selectTrace}
              selectedTraceId={selectedTraceId}
              headerStats={counts}
              headerActions={
                <Button
                  size="sm"
                  variant={split ? "secondary" : "outline"}
                  aria-pressed={split}
                  onClick={() => {
                    if (!split) selectTrace(selectedTraceId, true);
                    setSplit(!split);
                  }}
                >
                  <Columns2 className="mr-2 h-4 w-4" />
                  Split
                </Button>
              }
            />
          </div>
        )}
        <div
          className={cn(
            "grid gap-3 sm:grid-cols-2 lg:grid-cols-3",
            split && "lg:col-span-2 lg:row-start-2",
          )}
        >
          {facet.topics.map((topic) => (
            <button
              key={topic.id}
              onClick={() => selectTopic(topic.id)}
              className={`hover:bg-muted/50 flex flex-col gap-2 rounded-lg border p-4 text-left ${selected === topic.id ? "border-primary bg-muted/30" : ""}`}
            >
              <div className="flex w-full items-start justify-between gap-2">
                <h4 className="font-bold">
                  <span
                    className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: topicColor(
                        topics.findIndex((item) => item.id === topic.id),
                      ),
                    }}
                  />
                  {topic.name}
                </h4>
                <Badge variant="secondary">
                  {topic.count.toLocaleString()}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">
                {topic.description}
              </p>
            </button>
          ))}
        </div>
        <div
          className={cn(
            "flex min-w-0 flex-col gap-3",
            split && "lg:col-start-2 lg:row-start-1 lg:max-h-[42rem]",
          )}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={selected === null ? "secondary" : "ghost"}
              onClick={() => selectTopic(null)}
            >
              All traces ({facet.rows.length.toLocaleString()})
            </Button>
            {outliers > 0 && (
              <Button
                size="sm"
                variant={selected === "outliers" ? "secondary" : "ghost"}
                onClick={() => selectTopic("outliers")}
              >
                Outliers ({outliers.toLocaleString()})
              </Button>
            )}
            {noTopic > 0 && (
              <Button
                size="sm"
                variant={selected === "no_topic" ? "secondary" : "ghost"}
                onClick={() => selectTopic("no_topic")}
              >
                No topic ({noTopic.toLocaleString()})
              </Button>
            )}
            {facet.awaitingCount > 0 && (
              <Button
                size="sm"
                variant={selected === "awaiting_map" ? "secondary" : "ghost"}
                onClick={() => selectTopic("awaiting_map")}
              >
                Awaiting update ({facet.awaitingCount.toLocaleString()})
              </Button>
            )}
          </div>
          <CurrentTraceTable
            projectId={projectId}
            rows={visible}
            pagination={pagination}
            onPaginationChange={setPagination}
            selectedTraceId={split ? selectedTraceId : null}
            split={split}
          />
        </div>
      </div>
    </div>
  );
}

function CurrentTraceTable({
  projectId,
  rows,
  pagination,
  onPaginationChange,
  selectedTraceId,
  split,
}: {
  projectId: string;
  rows: Facet["rows"];
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  selectedTraceId: string | null;
  split: boolean;
}) {
  const peekNavigation = usePeekNavigation({
    tableName: "topics-traces",
    isV4: false,
    queryParams: ["observation", "display", "timestamp", "traceId"],
    expandConfig: {
      basePath: `/project/${projectId}/traces`,
      reader: "trace",
    },
  });
  const peekConfig = { itemType: "TRACE" as const, ...peekNavigation };
  const tableRef = useRef<HTMLDivElement>(null);
  const pageIndex = Math.min(
    pagination.pageIndex,
    Math.max(0, Math.ceil(rows.length / pagination.pageSize) - 1),
  );
  useEffect(() => {
    if (!split) return;
    tableRef.current
      ?.querySelector(".topics-selected-trace")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedTraceId, pageIndex, pagination.pageSize, split]);
  const columns = (
    openInspector: (summaryId: string) => void,
  ): LangfuseColumnDef<Facet["rows"][number]>[] => [
    {
      accessorKey: "traceId",
      header: "Trace ID",
      size: split ? 160 : 220,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => peekNavigation.openPeek(row.original.traceId)}
          title={row.original.traceId}
          className="font-mono text-xs underline"
        >
          {row.original.traceId}
        </button>
      ),
    },
    {
      accessorKey: "topicName",
      header: "Topic",
      size: 260,
      cell: ({ row }) => (
        <Badge variant="outline" className="whitespace-normal">
          {row.original.topicName ?? row.original.outcome.replaceAll("_", " ")}
        </Badge>
      ),
    },
    {
      accessorKey: "summary",
      header: "Summary",
      size: split ? 360 : 600,
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-2">
          <p className="break-words whitespace-pre-wrap">
            {row.original.summary || "No applicable summary."}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              openInspector(row.original.summaryId);
            }}
          >
            Inspect transcript
          </Button>
        </div>
      ),
    },
  ];
  return (
    <DialogController<string>
      size="xl"
      closeOnInteractionOutside
      renderContent={({ state }) => (
        <DialogBody className="ph-no-capture">
          <DialogTitle>Summary source</DialogTitle>
          <DialogDescription>
            View the current trace transcript for this summary.
          </DialogDescription>
          <SummaryInspector projectId={projectId} summaryId={state} />
        </DialogBody>
      )}
    >
      {({ openDialog }) => (
        <div ref={tableRef} className="min-h-0 min-w-0 overflow-auto">
          <DataTable
            tableName="topics-current-traces"
            columns={columns(openDialog)}
            columnVisibility={{ topicName: !split }}
            rowSelection={selectedTraceId ? { [selectedTraceId]: true } : {}}
            getRowClassName={(row) =>
              row.traceId === selectedTraceId ? "topics-selected-trace" : ""
            }
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
            cellPadding="comfortable"
            noResultsMessage="No traces in this selection."
            peekView={peekConfig}
          />
        </div>
      )}
    </DialogController>
  );
}
