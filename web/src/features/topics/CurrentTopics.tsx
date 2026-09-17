import { useState } from "react";
import Link from "next/link";
import { api, type RouterOutputs } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { TopicEmbeddingMap, topicColor } from "./TopicEmbeddingMap";

type Facet = RouterOutputs["topics"]["currentResults"][number];

export function CurrentTopics({
  projectId,
  running,
}: {
  projectId: string;
  running: boolean;
}) {
  const result = api.topics.currentResults.useQuery(
    { projectId },
    { refetchInterval: running ? 3000 : false },
  );
  return (
    <section className="flex min-w-0 flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Topics</h2>
        <Button variant="ghost" size="sm" onClick={() => result.refetch()}>
          Refresh results
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Current results across all runs. Each trace uses its latest facet
        assignment.
      </p>
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
      {result.data?.map((facet) => (
        <CurrentFacet key={facet.facetId} projectId={projectId} facet={facet} />
      ))}
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
    <div className="flex min-w-0 flex-col gap-3 border-t pt-4">
      <div className="flex items-center gap-2">
        <h3 className="font-bold">{facet.name}</h3>
        {facet.map?.exploratory && (
          <Badge variant="outline">Provisional topics</Badge>
        )}
      </div>
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
      <CurrentTraceList
        key={selected ?? "all"}
        projectId={projectId}
        rows={visible}
      />
    </div>
  );
}

function CurrentTraceList({
  projectId,
  rows,
}: {
  projectId: string;
  rows: Facet["rows"];
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  const currentPage = Math.min(page, pages - 1);
  return (
    <div className="flex flex-col gap-2">
      {rows.slice(currentPage * 20, (currentPage + 1) * 20).map((row) => (
        <article
          key={row.traceId}
          className="flex flex-col gap-2 rounded-md border p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href={`/project/${projectId}/traces/${encodeURIComponent(row.traceId)}`}
              title={row.traceId}
              className="truncate font-mono text-xs underline"
            >
              {row.traceId}
            </Link>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {row.topicName ?? row.outcome.replaceAll("_", " ")}
              </Badge>
              {row.awaitingUpdate && row.outcome !== "awaiting_map" && (
                <Badge variant="outline">
                  Previous result · update pending
                </Badge>
              )}
            </div>
          </div>
          <p className="text-sm whitespace-pre-wrap">
            {row.summary || "No applicable summary."}
          </p>
        </article>
      ))}
      {rows.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No traces in this selection.
        </p>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span>
            {currentPage + 1} / {pages.toLocaleString()}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous traces
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= pages - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            Next traces
          </Button>
        </div>
      )}
    </div>
  );
}
