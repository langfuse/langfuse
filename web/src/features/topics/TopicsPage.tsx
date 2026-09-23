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
  type TopicOperation,
} from "@langfuse/shared/topics";
import { TopicPipelineForm } from "./TopicPipelineForm";
import { CurrentTopics } from "./CurrentTopics";

const operationLabels: Record<TopicOperation, string> = {
  process: "Process traces",
  update: "Update topics",
};
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
  awaiting_topics: "Awaiting topics",
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
      {
        pathname: router.pathname,
        query: { ...router.query, executionId: id },
      },
      undefined,
      { shallow: true },
    );
    utils.topics.executions.invalidate({ projectId });
  };
  const showExecutionList = (open: boolean) => {
    setHistoryOpen(open);
    const query = { ...router.query };
    delete query.executionId;
    router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => utils.topics.currentResults.refetch({ projectId })}
        >
          Refresh results
        </Button>
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
        scrollable={Boolean(facets.data?.length)}
        withPadding
      >
        {configuration}
        <Sheet
          open={historyOpen || executionId !== null}
          onOpenChange={showExecutionList}
        >
          <SheetContent className="ph-no-capture flex w-full flex-col gap-4 sm:max-w-xl">
            <SheetHeader>
              <SheetTitle>
                {executionId ? "Run status" : "Past executions"}
              </SheetTitle>
              <SheetDescription>
                Review progress, errors, and retry interrupted runs.
              </SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              {executionId ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() => showExecutionList(true)}
                  >
                    All runs
                  </Button>
                  <ExecutionPanel
                    key={executionId}
                    projectId={projectId}
                    executionId={executionId}
                    facets={facets.data ?? []}
                    canWrite={canWrite}
                  />
                </>
              ) : (
                <>
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
                        {operationLabels[execution.input.operation]} ·{" "}
                        {new Date(execution.createdAt).toLocaleString()}
                      </span>
                      <span>{execution.facets.length} facets</span>
                      <Badge variant="outline">
                        {executionLabels[execution.status]}
                      </Badge>
                    </button>
                  ))}
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
        <div className="ph-no-capture flex w-full min-w-0 flex-col gap-6 pb-12">
          <TablePeekViewTraceDetail
            {...peekNavigation}
            itemType="TRACE"
            projectId={projectId}
          />
          <CurrentTopics
            projectId={projectId}
            refreshAfter={executions.dataUpdatedAt}
            running={
              executions.data?.some((execution) => busy(execution.status)) ??
              false
            }
          />
          {facets.isLoading && <p>Loading facets…</p>}
          {facets.error && <ErrorMessage message={facets.error.message} />}
          {facets.data?.length === 0 && (
            <section className="flex flex-col items-start gap-3">
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
    onSuccess: () =>
      Promise.all([
        query.refetch(),
        utils.topics.executions.invalidate({ projectId }),
      ]),
  });
  const [traceErrorsOpen, setTraceErrorsOpen] = useState(false);
  const traceErrors = api.topics.traceErrors.useQuery(
    { projectId, executionId },
    { enabled: traceErrorsOpen },
  );
  const execution = query.data;
  if (query.error) return <ErrorMessage message={query.error.message} />;
  if (!execution) return <p>Loading execution…</p>;
  const isUpdate = execution.input.operation === "update";
  const selectionDescription = isUpdate
    ? `${execution.facets.reduce((count, facet) => count + facet.counts.requested, 0).toLocaleString()} stored facet summaries`
    : `${Math.max(0, ...execution.facets.map((facet) => facet.counts.requested)).toLocaleString()} selected traces`;
  const facetCount = execution.facets.length;
  const operationLabel = operationLabels[execution.input.operation];
  let modeLabel = "Assign to current topics";
  if (execution.input.operation === "update")
    modeLabel = execution.input.exploratory ? "Small sample" : "Standard";
  let selectionPrefix = "Run selection: ";
  if (execution.status === "running") selectionPrefix = "Running on ";
  else if (execution.status === "queued") selectionPrefix = "Queued for ";
  return (
    <section className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">{executionLabels[execution.status]}</Badge>
          {execution.input.operation === "update" &&
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
                <dd>{operationLabel}</dd>
                <dt className="text-muted-foreground">Mode</dt>
                <dd>{modeLabel}</dd>
                <dt className="text-muted-foreground">Last step</dt>
                <dd className="capitalize">
                  {execution.phase.replaceAll("_", " ")}
                </dd>
                <dt className="text-muted-foreground">Embedding dimensions</dt>
                <dd>{execution.input.embeddingConfig.embeddingDimensions}</dd>
                {execution.input.operation === "update" && (
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
          {operationLabel} · {selectionPrefix}
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
      {execution.facets.some((facet) => facet.counts.failed > 0) && (
        <details
          className="ph-no-capture text-sm"
          onToggle={(event) => setTraceErrorsOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer">Trace errors</summary>
          {traceErrorsOpen && (
            <div className="flex flex-col gap-2 pt-2">
              {traceErrors.isPending && <p>Loading trace errors…</p>}
              {traceErrors.error && (
                <ErrorMessage message={traceErrors.error.message} />
              )}
              {traceErrors.data?.expired && (
                <p>
                  Trace error details have expired. The run counts are still
                  available.
                </p>
              )}
              {traceErrors.data?.errors.map((item) => (
                <p
                  key={`${item.traceId}:${item.error}`}
                  className="break-words"
                >
                  <Link
                    className="underline"
                    href={`/project/${projectId}/traces/${encodeURIComponent(item.traceId)}`}
                  >
                    {item.traceId}
                  </Link>
                  : {item.error}
                </p>
              ))}
              {traceErrors.data &&
                !traceErrors.data.expired &&
                traceErrors.data.errors.length === 0 && (
                  <p>No trace-level errors were recorded.</p>
                )}
            </div>
          )}
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
        const facet = facets.find((item) => item.id === progress.facetId);
        return (
          <div
            key={`${progress.facetId}:${progress.facetVersion}`}
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
            {progress.outcome === "awaiting_topics" && (
              <p className="text-sm">
                {progress.counts.complete.toLocaleString()} summaries are ready.
                Run Update topics to create topics for this facet and embedding
                configuration.
              </p>
            )}
            {progress.error && <ErrorMessage message={progress.error} />}
            {progress.outcome === "insufficient_data" &&
              execution.input.operation === "update" && (
                <p className="text-sm">
                  Clustering needs at least{" "}
                  {execution.input.minimumTraceCount ??
                    (execution.input.exploratory ? 10 : 100)}{" "}
                  compatible stored summaries for this facet. Process more
                  traces or lower the minimum when starting a new update.
                </p>
              )}
            {progress.outcome === "no_topics" && (
              <p className="text-sm">
                No stable groups found. Inspect the summaries, adjust the facet,
                or try a larger and more varied batch.
              </p>
            )}
          </div>
        );
      })}
      {!busy(execution.status) && (
        <Button
          variant="ghost"
          className="self-start"
          onClick={() => {
            query.refetch();
            utils.topics.currentResults.invalidate({ projectId });
            utils.topics.executions.invalidate({ projectId });
            utils.topics.summaryCounts.invalidate({ projectId });
          }}
        >
          Refresh status
        </Button>
      )}
    </section>
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
