import { useState } from "react";
import { type PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { TablePeekViewTraceDetail } from "@/src/components/table/peek/peek-trace-detail";
import { api, type RouterOutputs } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import {
  TabsBar,
  TabsBarContent,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { TopicEmbeddingMap, topicColor } from "./TopicEmbeddingMap";

type Facet = RouterOutputs["topics"]["currentResults"][number];

export function CurrentTopics({
  projectId,
  running,
}: {
  projectId: string;
  running: boolean;
}) {
  const [selectedFacetId, setSelectedFacetId] = useState<string>();
  const result = api.topics.currentResults.useQuery(
    { projectId },
    { refetchInterval: running ? 3000 : false },
  );
  const selectedFacet = result.data?.some(
    (facet) => facet.facetId === selectedFacetId,
  )
    ? selectedFacetId
    : result.data?.[0]?.facetId;
  return (
    <section className="flex min-w-0 flex-col gap-5">
      {result.error && (
        <p role="alert" className="text-destructive text-sm">
          {result.error.message}
        </p>
      )}
      {result.isLoading && <p className="text-sm">Loading topics…</p>}
      {result.data?.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Run topics below to discover patterns in your traces.
        </p>
      )}
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
  const selected =
    selection === "outliers" ||
    selection === "no_topic" ||
    selection === "awaiting_map" ||
    facet.topics.some((topic) => topic.id === selection)
      ? selection
      : null;
  const visible = facet.rows.filter(
    (row) =>
      selected === null ||
      (selected === "outliers"
        ? row.outcome === "outlier"
        : selected === "no_topic"
          ? row.outcome === "not_applicable" ||
            row.outcome === "insufficient_input"
          : selected === "awaiting_map"
            ? row.awaitingUpdate
            : row.topicId === selected),
  );
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
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {facet.map?.exploratory && (
        <Badge variant="outline" className="self-start">
          Provisional topics
        </Badge>
      )}
      <p className="text-muted-foreground text-sm">
        {facet.rows.length.toLocaleString()} traces · {facet.topics.length}{" "}
        topics
        {facet.awaitingCount > 0 &&
          ` · ${facet.awaitingCount.toLocaleString()} awaiting a map or updated assignment`}
      </p>
      {!facet.map && (
        <p className="text-muted-foreground text-sm">
          {facet.usableCount.toLocaleString()} usable summaries collected for v
          {facet.facetVersion ?? 1}. Standard discovery needs 100; smaller
          batches remain saved.
        </p>
      )}
      {facet.map && (
        <>
          <TopicEmbeddingMap
            projectId={projectId}
            executionId={facet.map.executionId}
            facetVersionId={facet.map.facetVersionId}
            topics={facet.map.topics}
            selectedTopic={selected}
            onSelectTopic={setSelection}
          />
          <p className="text-muted-foreground text-xs">
            Map: latest discovery cohort. Counts and traces below include the
            latest assignments across all maps.
          </p>
        </>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {facet.topics.map((topic) => (
          <button
            key={topic.id}
            onClick={() => setSelection(topic.id)}
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
              <Badge variant="secondary">{topic.count.toLocaleString()}</Badge>
            </div>
            <p className="text-muted-foreground text-sm">{topic.description}</p>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={selected === null ? "secondary" : "ghost"}
          onClick={() => setSelection(null)}
        >
          All traces ({facet.rows.length.toLocaleString()})
        </Button>
        {outliers > 0 && (
          <Button
            size="sm"
            variant={selected === "outliers" ? "secondary" : "ghost"}
            onClick={() => setSelection("outliers")}
          >
            Outliers ({outliers.toLocaleString()})
          </Button>
        )}
        {noTopic > 0 && (
          <Button
            size="sm"
            variant={selected === "no_topic" ? "secondary" : "ghost"}
            onClick={() => setSelection("no_topic")}
          >
            No topic ({noTopic.toLocaleString()})
          </Button>
        )}
        {facet.awaitingCount > 0 && (
          <Button
            size="sm"
            variant={selected === "awaiting_map" ? "secondary" : "ghost"}
            onClick={() => setSelection("awaiting_map")}
          >
            Awaiting update ({facet.awaitingCount.toLocaleString()})
          </Button>
        )}
      </div>
      <CurrentTraceTable
        key={selected ?? "all"}
        projectId={projectId}
        rows={visible}
      />
    </div>
  );
}

function CurrentTraceTable({
  projectId,
  rows,
}: {
  projectId: string;
  rows: Facet["rows"];
}) {
  const peekNavigation = usePeekNavigation({
    tableName: "topics-current-traces",
    isV4: false,
    queryParams: ["observation", "display", "timestamp", "traceId"],
    expandConfig: {
      basePath: `/project/${projectId}/traces`,
      reader: "trace",
    },
  });
  const peekConfig = { itemType: "TRACE" as const, ...peekNavigation };
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });
  const pageIndex = Math.min(
    pagination.pageIndex,
    Math.max(0, Math.ceil(rows.length / pagination.pageSize) - 1),
  );
  const columns: LangfuseColumnDef<Facet["rows"][number]>[] = [
    {
      accessorKey: "traceId",
      header: "Trace ID",
      size: 220,
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
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="whitespace-normal">
            {row.original.topicName ??
              row.original.outcome.replaceAll("_", " ")}
          </Badge>
          {row.original.awaitingUpdate &&
            row.original.outcome !== "awaiting_map" && (
              <Badge variant="outline" className="whitespace-normal">
                Previous result · update pending
              </Badge>
            )}
        </div>
      ),
    },
    {
      accessorKey: "summary",
      header: "Summary",
      size: 600,
      cell: ({ row }) => (
        <p className="break-words whitespace-pre-wrap">
          {row.original.summary || "No applicable summary."}
        </p>
      ),
    },
  ];
  return (
    <>
      <DataTable
        tableName="topics-current-traces"
        columns={columns}
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
          onChange: setPagination,
          options: [20, 50, 100],
        }}
        topAlignCells
        cellPadding="comfortable"
        noResultsMessage="No traces in this selection."
        peekView={peekConfig}
      />
      <TablePeekViewTraceDetail {...peekConfig} projectId={projectId} />
    </>
  );
}
