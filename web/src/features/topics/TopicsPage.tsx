import { type ReactNode, useState } from "react";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { TablePeekViewTraceDetail } from "@/src/components/table/peek/peek-trace-detail";
import { useRouter } from "next/router";
import Link from "next/link";
import Page from "@/src/components/layouts/page";
import { ErrorPage } from "@/src/components/error-page";
import { Button } from "@/src/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/src/components/ui/sheet";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { PopoverClose, PopoverController } from "@/src/components/ui/popover";
import { Badge } from "@/src/components/ui/badge";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import {
  type TopicFacet,
  type TopicExecutionStatus,
  type TopicFacetOutcome,
} from "@langfuse/shared/topics";
import { TopicPipelineForm } from "./TopicPipelineForm";
import { CurrentTopics } from "./CurrentTopics";
import { TopicEmbeddingMap, topicColor } from "./TopicEmbeddingMap";

const busy = (status: string) => status === "queued" || status === "running";
const executionLabels: Record<TopicExecutionStatus, string> = {
  queued: "Run queued",
  running: "Run in progress",
  completed: "Run complete",
  completed_with_errors: "Run finished with errors",
  failed: "Run failed",
};
const executionPhaseLabels: Record<string, string> = {
  queued: "Waiting for a worker",
  summarizing: "Preparing summaries and embeddings",
  clustering: "Clustering summaries",
  naming: "Naming topics",
  assigning: "Assigning traces to topics",
  processing: "Processing facets",
};
const facetOutcomeLabels: Record<TopicFacetOutcome, string> = {
  pending: "Waiting for results",
  published: "Topics ready",
  assigned: "Traces assigned",
  insufficient_data: "More traces needed",
  no_applicable_summaries: "No applicable traces",
  no_topics: "No topics found",
  failed: "Facet failed",
};

export default function TopicsPage() {
  const router = useRouter();
  const projectId =
    typeof router.query.projectId === "string" ? router.query.projectId : "";
  const topicsEnabled = useIsFeatureEnabled("langfuseTopics", { projectId });
  if (!topicsEnabled) {
    return (
      <ErrorPage title="Not found" message="This page is not available." />
    );
  }
  return projectId ? (
    <TopicsWorkspace key={projectId} projectId={projectId} />
  ) : (
    <Page headerProps={{ title: "Topics" }} withPadding>
      <p>Loading topics…</p>
    </Page>
  );
}

function TopicsWorkspace({ projectId }: { projectId: string }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const peekNavigation = usePeekNavigation({
    tableName: "topics-traces",
    isV4: false,
    queryParams: ["observation", "display", "timestamp", "traceId"],
    expandConfig: { basePath: `/project/${projectId}/traces`, reader: "trace" },
  });
  const router = useRouter();
  const utils = api.useUtils();
  const canWrite = useHasProjectAccess({ projectId, scope: "topics:CUD" });
  const facets = api.topics.facets.useQuery({ projectId });
  const runs = api.topics.runs.useQuery({ projectId });
  const executions = api.topics.executions.useQuery(
    { projectId },
    {
      refetchInterval: (query) =>
        query.state.data?.some((execution) => busy(execution.status))
          ? 3000
          : false,
    },
  );
  const initialize = api.topics.initialize.useMutation({
    onSuccess: () => utils.topics.facets.invalidate({ projectId }),
  });
  const executionId =
    typeof router.query.executionId === "string"
      ? router.query.executionId
      : null;
  const openExecution = (id: string) => {
    setHistoryOpen(false);
    router.push(
      { pathname: router.pathname, query: { projectId, executionId: id } },
      undefined,
      { shallow: true },
    );
    utils.topics.executions.invalidate({ projectId });
  };
  const renderWorkspace = (
    pipelineActions: ReactNode,
    configuration: ReactNode,
  ) => {
    const actions = (
      <div className="ph-no-capture flex flex-wrap items-center justify-end gap-2">
        {pipelineActions}
        <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
          History
        </Button>
        {!executionId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => utils.topics.currentResults.refetch({ projectId })}
          >
            Refresh results
          </Button>
        )}
      </div>
    );
    return (
      <Page
        headerProps={{
          title: "Topics",
          help: {
            description:
              "Explore recurring themes across traces, one facet at a time.",
          },
          actionButtonsRight: actions,
          actionButtonsMenu: <PopoverClose asChild>{actions}</PopoverClose>,
        }}
        scrollable
        withPadding
      >
        {configuration}
        <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
          <SheetContent className="ph-no-capture flex w-full flex-col gap-4 sm:max-w-xl">
            <SheetHeader>
              <SheetTitle>Past executions</SheetTitle>
              <SheetDescription>
                Review previous runs and their results.
              </SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              <Button
                size="sm"
                variant="ghost"
                className="self-end"
                onClick={() => executions.refetch()}
              >
                Refresh
              </Button>
              {executions.error && (
                <ErrorMessage message={executions.error.message} />
              )}
              {!executions.data?.length && (
                <p className="text-muted-foreground text-sm">
                  Your triggered batches will appear here.
                </p>
              )}
              {executions.data?.map((execution) => (
                <button
                  key={execution.id}
                  onClick={() => openExecution(execution.id)}
                  className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-left text-sm"
                >
                  <span className="capitalize">
                    {execution.input.operation} ·{" "}
                    {new Date(execution.createdAt).toLocaleString()}
                  </span>
                  <span>{execution.facets.length} facets</span>
                  <Badge variant="outline">
                    {executionLabels[execution.status]}
                  </Badge>
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
        <div className="ph-no-capture flex w-full min-w-0 flex-col gap-6 pb-12">
          <TablePeekViewTraceDetail
            {...peekNavigation}
            itemType="TRACE"
            projectId={projectId}
          />
          {executionId ? (
            <ExecutionPanel
              key={executionId}
              projectId={projectId}
              executionId={executionId}
              facets={facets.data ?? []}
              canWrite={canWrite}
            />
          ) : (
            <CurrentTopics
              projectId={projectId}
              running={
                executions.data?.some((execution) => busy(execution.status)) ??
                false
              }
            />
          )}
          {executionId && (
            <Button
              variant="outline"
              className="self-start"
              onClick={() =>
                router.push(
                  { pathname: router.pathname, query: { projectId } },
                  undefined,
                  { shallow: true },
                )
              }
            >
              Show current topics
            </Button>
          )}
          {facets.isLoading && <p>Loading facets…</p>}
          {facets.error && <ErrorMessage message={facets.error.message} />}
          {facets.data?.length === 0 && (
            <section className="flex flex-col items-start gap-3 border-t pt-6">
              <h2 className="font-bold">Start with a question</h2>
              <p className="text-muted-foreground text-sm">
                Create starter facets for intent, outcome, and issues. You can
                edit the questions or add your own.
              </p>
              <Button
                disabled={!canWrite || initialize.isPending}
                onClick={() => initialize.mutate({ projectId })}
              >
                Create starter facets
              </Button>
              {initialize.error && (
                <ErrorMessage message={initialize.error.message} />
              )}
            </section>
          )}
        </div>
      </Page>
    );
  };
  return facets.data?.length ? (
    <TopicPipelineForm
      projectId={projectId}
      facets={facets.data}
      runs={runs.data ?? []}
      executions={executions.data ?? []}
      canWrite={canWrite}
      onTriggered={openExecution}
      facetEditor={
        canWrite ? (
          <FacetEditor projectId={projectId} facets={facets.data} />
        ) : null
      }
      render={renderWorkspace}
    />
  ) : (
    renderWorkspace(null, null)
  );
}

function FacetEditor({
  projectId,
  facets,
}: {
  projectId: string;
  facets: TopicFacet[];
}) {
  const utils = api.useUtils();
  const [facetId, setFacetId] = useState("new");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const save = api.topics.saveFacet.useMutation({
    onSuccess: () => utils.topics.facets.invalidate({ projectId }),
  });
  return (
    <details className="border-t pt-6">
      <summary className="cursor-pointer font-bold">
        Add a facet or revise a question
      </summary>
      <div className="mt-4 flex flex-col gap-3">
        <Select
          value={facetId}
          onValueChange={(value) => {
            setFacetId(value);
            const facet = facets.find((f) => f.id === value);
            setName(facet?.name ?? "");
            setPrompt(facet?.versions[0]?.prompt ?? "");
          }}
        >
          <SelectTrigger aria-label="Facet to edit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="ph-no-capture">
            <SelectItem value="new">New facet</SelectItem>
            {facets.map((facet) => (
              <SelectItem key={facet.id} value={facet.id}>
                {facet.name} · new version
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label="Facet name"
          placeholder="Facet name"
          value={name}
          disabled={facetId !== "new"}
          onChange={(event) => setName(event.target.value)}
        />
        <Textarea
          aria-label="Facet question"
          placeholder="What should each trace summary describe?"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          Revising a question creates an immutable version. Existing summaries
          and maps retain their original question.
        </p>
        <Button
          className="self-start"
          disabled={save.isPending || !name.trim() || prompt.trim().length < 10}
          onClick={() =>
            save.mutate({
              projectId,
              ...(facetId === "new" ? {} : { facetId }),
              name,
              prompt,
            })
          }
        >
          Save facet
        </Button>
        {save.error && <ErrorMessage message={save.error.message} />}
        {save.isSuccess && <p className="text-sm">Facet saved.</p>}
      </div>
    </details>
  );
}

function ExecutionPanel({
  projectId,
  executionId,
  facets,
  canWrite,
}: {
  projectId: string;
  executionId: string;
  facets: TopicFacet[];
  canWrite: boolean;
}) {
  const utils = api.useUtils();
  const query = api.topics.execution.useQuery(
    { projectId, executionId },
    {
      refetchInterval: (state) =>
        !state.state.data || busy(state.state.data.status) ? 1500 : false,
    },
  );
  const retry = api.topics.retry.useMutation({
    onSuccess: () => query.refetch(),
  });
  const execution = query.data;
  if (query.error) return <ErrorMessage message={query.error.message} />;
  if (!execution) return <p>Loading execution…</p>;
  const selectionDescription =
    execution.input.operation === "recluster"
      ? `${execution.input.sourceExecutionIds.length.toLocaleString()} saved batches`
      : `${execution.input.traceIds.length.toLocaleString()} selected traces`;
  const facetCount = execution.facets.length;
  return (
    <section className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold">Topics</h2>
          <Badge variant="secondary">{executionLabels[execution.status]}</Badge>
          {execution.input.operation !== "assign" &&
            execution.input.exploratory && (
              <Badge variant="outline">Small sample · provisional</Badge>
            )}
        </div>
        <PopoverController
          align="end"
          contentClassName="w-80 max-w-[calc(100vw-2rem)]"
          disabled={false}
          modal={false}
          renderContent={() => (
            <div className="ph-no-capture flex flex-col gap-3 text-sm">
              <h3 className="font-bold">Run details</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Triggered</dt>
                <dd>{new Date(execution.createdAt).toLocaleString()}</dd>
                <dt className="text-muted-foreground">Operation</dt>
                <dd>
                  {execution.input.operation === "assign"
                    ? "Assign to existing topics"
                    : execution.input.operation === "recluster"
                      ? "Recluster saved summaries"
                      : execution.input.operation === "refresh"
                        ? "Update topics"
                        : "Discover topics"}
                </dd>
                <dt className="text-muted-foreground">Mode</dt>
                <dd>
                  {execution.input.operation === "assign"
                    ? "Existing map"
                    : execution.input.exploratory
                      ? "Small sample"
                      : "Standard"}
                </dd>
                <dt className="text-muted-foreground">Last step</dt>
                <dd className="capitalize">
                  {execution.phase.replaceAll("_", " ")}
                </dd>
                <dt className="text-muted-foreground">Embedding dimensions</dt>
                <dd>{execution.input.embeddingConfig.embeddingDimensions}</dd>
                {execution.input.operation !== "assign" && (
                  <>
                    <dt className="text-muted-foreground">
                      Minimum traces for clustering
                    </dt>
                    <dd>
                      {execution.input.minimumTraceCount ??
                        (execution.input.exploratory ? 10 : 100)}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          )}
        >
          {({ Trigger }) => (
            <Trigger asChild>
              <Button variant="ghost" size="sm">
                Run details
              </Button>
            </Trigger>
          )}
        </PopoverController>
      </div>
      <div
        className="flex flex-col gap-1"
        role={busy(execution.status) ? "status" : undefined}
      >
        <p className="text-sm">
          {execution.status === "running"
            ? "Running on "
            : execution.status === "queued"
              ? "Queued for "
              : "Run selection: "}
          {selectionDescription} across {facetCount.toLocaleString()}{" "}
          {facetCount === 1 ? "facet" : "facets"}.
        </p>
        {busy(execution.status) && (
          <p className="text-muted-foreground text-sm">
            {executionPhaseLabels[execution.phase] ??
              execution.phase.replaceAll("_", " ")}
            . Counts update after each processing batch. You can leave this page
            and reopen the run.
          </p>
        )}
      </div>
      {execution.error && <ErrorMessage message={execution.error} />}
      {execution.traceErrors.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">
            {execution.traceErrors.length} trace errors
          </summary>
          {execution.traceErrors.map((item) => (
            <p key={item.traceId} className="text-xs break-words">
              {item.traceId}: {item.error}
            </p>
          ))}
        </details>
      )}
      {canWrite &&
        !busy(execution.status) &&
        (execution.status === "failed" ||
          (execution.status === "completed_with_errors" &&
            execution.facets.some(
              (facet) =>
                facet.outcome === "pending" || facet.outcome === "failed",
            ))) && (
          <Button
            className="self-start"
            disabled={retry.isPending}
            onClick={() => retry.mutate({ projectId, executionId })}
          >
            Resume interrupted stages
          </Button>
        )}
      {retry.error && <ErrorMessage message={retry.error.message} />}
      {execution.facets.map((progress) => {
        const facet = facets.find((item) =>
          item.versions.some(
            (version) => version.id === progress.facetVersionId,
          ),
        );
        return (
          <div
            key={progress.facetVersionId}
            className="flex flex-col gap-3 border-t pt-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold">{facet?.name ?? "Facet"}</h3>
              <Badge variant="outline">
                {facetOutcomeLabels[progress.outcome]}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              {[
                `${progress.counts.complete.toLocaleString()} / ${progress.counts.requested.toLocaleString()} traces have summaries and embeddings ready`,
                ...(progress.runId
                  ? [
                      `${progress.counts.assigned.toLocaleString()} assigned`,
                      `${progress.counts.outlier.toLocaleString()} outliers`,
                    ]
                  : []),
                ...(progress.counts.nonApplicable
                  ? [
                      `${progress.counts.nonApplicable.toLocaleString()} not applicable`,
                    ]
                  : []),
                ...(progress.counts.insufficientInput
                  ? [
                      `${progress.counts.insufficientInput.toLocaleString()} insufficient input`,
                    ]
                  : []),
                `${progress.counts.failed.toLocaleString()} failed`,
              ].join(" · ")}
            </p>
            {execution.input.operation === "refresh" && progress.refresh && (
              <p className="text-muted-foreground text-xs">
                Ready and assignment counts include previously processed traces
                in the combined cohort. Failures refer to the selected batch.
              </p>
            )}
            {progress.refresh && (
              <p className="text-muted-foreground text-sm">
                {progress.refresh.shouldRefresh
                  ? "Map refresh requested"
                  : "Existing map retained"}
                :{" "}
                {progress.refresh.reasons
                  .map((reason) => reason.replaceAll("_", " "))
                  .join(", ")}
                .
              </p>
            )}
            {progress.error && <ErrorMessage message={progress.error} />}
            {progress.outcome === "insufficient_data" && (
              <p className="text-sm">
                Discovery needs at least{" "}
                {execution.input.minimumTraceCount ??
                  (execution.input.exploratory ? 10 : 100)}{" "}
                usable trace summaries for this facet. Summaries are saved. Add
                more traces or lower the minimum when starting a new run.
              </p>
            )}
            {progress.outcome === "no_topics" && (
              <p className="text-sm">
                No stable groups found. Inspect the summaries, adjust the facet,
                or try a larger and more varied batch.
              </p>
            )}
            {!busy(execution.status) && (
              <TopicResults
                projectId={projectId}
                executionId={executionId}
                facetVersionId={progress.facetVersionId}
              />
            )}
          </div>
        );
      })}
      {!busy(execution.status) && (
        <Button
          variant="ghost"
          className="self-start"
          onClick={() => {
            utils.topics.runs.invalidate({ projectId });
            utils.topics.executions.invalidate({ projectId });
          }}
        >
          Refresh available maps and batches
        </Button>
      )}
    </section>
  );
}

function TopicResults({
  projectId,
  executionId,
  facetVersionId,
}: {
  projectId: string;
  executionId: string;
  facetVersionId: string;
}) {
  const result = api.topics.results.useQuery({
    projectId,
    executionId,
    facetVersionId,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  if (result.error) return <ErrorMessage message={result.error.message} />;
  if (!result.data) return <p className="text-sm">Loading summaries…</p>;
  const { summaries, assignments, run } = result.data;
  const summaryIds = new Set(summaries.map((summary) => summary.id));
  const availableAssignments = assignments.filter((assignment) =>
    summaryIds.has(assignment.summaryId),
  );
  const assignmentBySummary = new Map(
    availableAssignments.map((a) => [a.summaryId, a]),
  );
  const count = (topicId: string | null) =>
    availableAssignments.filter((a) => a.topicId === topicId).length;
  const visible =
    selected === null
      ? summaries
      : summaries.filter((summary) =>
          selected === "outliers"
            ? assignmentBySummary.get(summary.id)?.outcome === "outlier"
            : selected === "unassigned"
              ? !assignmentBySummary.has(summary.id)
              : assignmentBySummary.get(summary.id)?.topicId === selected,
        );
  return (
    <div className="flex flex-col gap-4">
      {run?.publishedAt && (
        <TopicEmbeddingMap
          projectId={projectId}
          executionId={executionId}
          facetVersionId={facetVersionId}
          topics={run.topics}
          selectedTopic={selected}
          onSelectTopic={setSelected}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {run?.topics.map((topic, index) => (
          <button
            key={topic.id}
            className={`hover:bg-muted/50 flex flex-col gap-2 rounded-lg border p-4 text-left ${selected === topic.id ? "border-primary bg-muted/30" : ""}`}
            onClick={() => setSelected(topic.id)}
          >
            <div className="flex w-full items-start justify-between gap-2">
              <h4 className="font-bold">
                <span
                  className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: topicColor(index) }}
                />
                {topic.name}
              </h4>
              <Badge variant="secondary">{count(topic.id)}</Badge>
            </div>
            <p className="text-muted-foreground text-sm">{topic.description}</p>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={selected === null ? "secondary" : "ghost"}
          onClick={() => setSelected(null)}
        >
          All summaries ({summaries.length})
        </Button>
        {assignments.length > 0 && (
          <Button
            size="sm"
            variant={selected === "outliers" ? "secondary" : "ghost"}
            onClick={() => setSelected("outliers")}
          >
            Outliers ({count(null)})
          </Button>
        )}
        <span className="text-muted-foreground text-xs">
          Counts refer to this execution’s batch.
        </span>
      </div>
      <div className="flex max-h-[36rem] flex-col gap-2 overflow-y-auto">
        {visible.map((summary) => {
          const assignment = assignmentBySummary.get(summary.id);
          return (
            <article
              key={summary.id}
              className="flex flex-col gap-2 rounded-md border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/project/${projectId}/traces/${encodeURIComponent(summary.traceId)}`}
                  title={summary.traceId}
                  className="truncate font-mono text-xs underline"
                >
                  {summary.traceId}
                </Link>
                <Badge variant="outline">
                  {assignment?.outcome ?? summary.state}
                </Badge>
              </div>
              <p className="text-sm whitespace-pre-wrap">
                {summary.summary || "No applicable summary."}
              </p>
              {assignment && (
                <p className="text-muted-foreground text-xs">
                  Distance: {assignment.distance?.toFixed(3) ?? "—"}
                  {assignment.rejectionReason
                    ? ` · ${assignment.rejectionReason}`
                    : ""}
                </p>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                onClick={() =>
                  setInspecting(inspecting === summary.id ? null : summary.id)
                }
              >
                {inspecting === summary.id
                  ? "Hide transcript"
                  : "Inspect transcript"}
              </Button>
              {inspecting === summary.id && (
                <SummaryInspector
                  projectId={projectId}
                  executionId={executionId}
                  summaryId={summary.id}
                />
              )}
            </article>
          );
        })}
      </div>
      {visible.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No summaries in this selection.
        </p>
      )}
      {run?.publishedAt && (
        <TopicComparison
          projectId={projectId}
          executionId={executionId}
          facetVersionId={facetVersionId}
          runId={run.id}
        />
      )}
    </div>
  );
}

function TopicComparison({
  projectId,
  executionId,
  facetVersionId,
  runId,
}: {
  projectId: string;
  executionId: string;
  facetVersionId: string;
  runId: string;
}) {
  const runs = api.topics.runs.useQuery({ projectId });
  const [otherRunId, setOtherRunId] = useState<string | null>(null);
  const comparison = api.topics.compare.useQuery(
    {
      projectId,
      executionId,
      facetVersionId,
      otherRunId: otherRunId ?? "none",
    },
    { enabled: otherRunId !== null },
  );
  const candidates =
    runs.data?.filter(
      (run) =>
        run.publishedAt &&
        run.facetVersionId === facetVersionId &&
        run.id !== runId,
    ) ?? [];
  if (!candidates.length)
    return (
      <p className="text-muted-foreground text-xs">
        Recluster retained summaries to create a second map and compare
        assignments.
      </p>
    );
  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm">
        Compare this batch across maps
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <Select value={otherRunId ?? undefined} onValueChange={setOtherRunId}>
          <SelectTrigger aria-label="Map to compare">
            <SelectValue placeholder="Select another map" />
          </SelectTrigger>
          <SelectContent className="ph-no-capture">
            {candidates.map((run) => (
              <SelectItem key={run.id} value={run.id}>
                Map {run.runSequence} · {run.topics.length} topics
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {comparison.error && (
          <ErrorMessage message={comparison.error.message} />
        )}
        {comparison.data && (
          <>
            <p className="text-muted-foreground text-xs">
              {comparison.data.compared} of {comparison.data.total} summaries
              have assignments in both maps. Names may change between maps.
            </p>
            <ul className="flex flex-col gap-2 text-sm">
              {comparison.data.flows.map((flow, i) => (
                <li key={i}>
                  {flow.from} → {flow.to}{" "}
                  <Badge variant="outline">{flow.count}</Badge>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}

function SummaryInspector({
  projectId,
  executionId,
  summaryId,
}: {
  projectId: string;
  executionId: string;
  summaryId: string;
}) {
  const query = api.topics.inspect.useQuery({
    projectId,
    executionId,
    summaryId,
  });
  if (query.error) return <ErrorMessage message={query.error.message} />;
  if (!query.data) return <p className="text-xs">Loading transcript…</p>;
  const transcript = query.data.projection;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs break-all">
        {query.data.model} · input hash {query.data.inputHash}
      </p>
      <p className="text-muted-foreground text-xs">
        {query.data.projectionStatus === "matching"
          ? "Transcript regenerated from trace data; matches the summarized input."
          : query.data.projectionStatus === "changed"
            ? "Trace data or transcript processing has changed. Showing the current transcript, which differs from the summarized input."
            : "Source transcript unavailable. The stored summary is still retained."}
      </p>
      {transcript && (
        <JSONView
          title="Transcript"
          json={JSON.parse(transcript.text)}
          preserveStrings
        />
      )}
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-sm break-words"
    >
      {message}
    </p>
  );
}
