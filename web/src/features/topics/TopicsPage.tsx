import { useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { type UseQueryResult } from "@tanstack/react-query";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { TablePeekViewTraceDetail } from "@/src/components/table/peek/peek-trace-detail";
import { useRouter } from "next/router";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import Page from "@/src/components/layouts/page";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { TimeRangePicker } from "@/src/components/date-picker";
import { useGlobalDateRange } from "@/src/features/global-time-range/useGlobalDateRange";
import {
  DASHBOARD_AGGREGATION_OPTIONS,
  TABLE_AGGREGATION_OPTIONS,
  TIME_RANGES,
} from "@/src/utils/date-range-utils";
import { ErrorPage } from "@/src/components/error-page";
import { Button } from "@/src/components/design-system/Button/Button";
import { Button as PopoverButton } from "@/src/components/ui/button";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/src/components/ui/sheet";
import { Input } from "@/src/components/design-system/Input/Input";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Textarea } from "@/src/components/ui/textarea";
import { PopoverController } from "@/src/components/ui/popover";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { api, type RouterOutputs } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import {
  type TopicFacet,
  type TopicExecutionStatus,
  type TopicFacetOutcome,
  type TopicOperation,
} from "@langfuse/shared/topics";
import { useTopicPipelineForm } from "./TopicPipelineForm";
import { CurrentTopics, useCurrentTopics } from "./CurrentTopics";
import { TopicsFilters } from "./TopicsFilters";
import { TopicsActionsMenu } from "./TopicsActionsMenu";
import { TopicsWorkspaceGate } from "./TopicsWorkspaceGate";
import { resolveTopicFacetId } from "./topic-facet-selection";
import { isValidTopicTimeRange } from "./time-range";

const maxTimeRangeMs = TIME_RANGES.last90Days.minutes * 60_000;
const sharedTimeRangePresets = [
  ...new Set([...TABLE_AGGREGATION_OPTIONS, ...DASHBOARD_AGGREGATION_OPTIONS]),
].sort((a, b) => TIME_RANGES[a].minutes - TIME_RANGES[b].minutes);
const topicsTimeRangePresets = sharedTimeRangePresets.filter(
  (range) => TIME_RANGES[range].minutes * 60_000 <= maxTimeRangeMs,
);

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
const loadingPage = (
  <Page headerProps={{ title: "Topics" }} withPadding>
    <p>Loading topics…</p>
  </Page>
);

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
    loadingPage
  );
}

function TopicsWorkspace({ projectId }: { projectId: string }) {
  const facets = api.topics.facets.useQuery({ projectId });
  return (
    <TopicsWorkspaceGate isLoading={facets.isLoading} fallback={loadingPage}>
      <TopicsWorkspaceView
        key={(facets.data?.length ?? 0) > 0 ? "configured" : "empty"}
        projectId={projectId}
        facets={facets}
      />
    </TopicsWorkspaceGate>
  );
}

function TopicsWorkspaceView({
  projectId,
  facets,
}: {
  projectId: string;
  facets: UseQueryResult<TopicFacet[], { message: string }>;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const { timeRange, setTimeRange } = useGlobalDateRange({
    allowedRanges: sharedTimeRangePresets,
    fallback: "last7Days",
  });
  const [refreshedAt, setRefreshedAt] = useState(Date.now);
  const [selectedFacetId, setSelectedFacetId] = useState<string>();
  const [tracePanel, setTracePanel] = useState<HTMLElement | null>(null);
  const peekNavigation = usePeekNavigation({
    tableName: "topics-traces",
    isV4: false,
    queryParams: ["observation", "display", "timestamp", "traceId"],
    expandConfig: { basePath: `/project/${projectId}/traces`, reader: "trace" },
  });
  const router = useRouter();
  const utils = api.useUtils();
  const canWrite = useHasProjectAccess({ projectId, scope: "topics:CUD" });
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
  const selectedExecution = api.topics.execution.useQuery(
    { projectId, executionId: executionId ?? "" },
    {
      enabled: executionId !== null,
      refetchInterval: (query) =>
        !query.state.data || busy(query.state.data.status) ? 1500 : false,
    },
  );
  const completedAt = Math.max(
    0,
    ...[...(executions.data ?? []), selectedExecution.data].flatMap(
      (execution) =>
        execution && !busy(execution.status)
          ? [new Date(execution.updatedAt).getTime()]
          : [],
    ),
  );
  const { currentTimeRange, effectiveTimeRange, isTimeRangeCapped } =
    useMemo(() => {
      const to =
        "from" in timeRange
          ? timeRange.to
          : new Date(Math.max(Date.now(), completedAt, refreshedAt));
      const from =
        "from" in timeRange
          ? timeRange.from
          : new Date(
              to.getTime() -
                (TIME_RANGES[timeRange.range as keyof typeof TIME_RANGES]
                  .minutes ?? TIME_RANGES.last7Days.minutes) *
                  60_000,
            );
      const isTimeRangeCapped = to.getTime() - from.getTime() > maxTimeRangeMs;
      const currentTimeRange = {
        from: isTimeRangeCapped
          ? new Date(to.getTime() - maxTimeRangeMs)
          : from,
        to,
      };
      let effectiveTimeRange = timeRange;
      if (isTimeRangeCapped) {
        effectiveTimeRange =
          "from" in timeRange ? currentTimeRange : { range: "last90Days" };
      }
      return {
        currentTimeRange,
        effectiveTimeRange,
        isTimeRangeCapped,
      };
    }, [timeRange, completedAt, refreshedAt]);
  const validTimeRange = isValidTopicTimeRange(currentTimeRange);
  const running =
    Boolean(executions.data?.some((execution) => busy(execution.status))) ||
    busy(selectedExecution.data?.status ?? "");
  const results = useCurrentTopics({
    projectId,
    running,
    refreshAfter: completedAt,
    timeRange: currentTimeRange,
  });
  const selectedFacet = resolveTopicFacetId(
    results.data ?? [],
    selectedFacetId,
  );
  const refreshResults = () => {
    setRefreshedAt(Date.now());
    utils.topics.currentResults.invalidate({ projectId });
  };
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
  function openHistory() {
    setHistoryOpen(true);
  }
  const {
    primaryAction,
    triggerAction,
    openConfiguration,
    configuration,
    error,
  } = useTopicPipelineForm({
    projectId,
    facets: facets.data ?? [],
    canWrite,
    onTriggered: openExecution,
    timeRange: validTimeRange ? currentTimeRange : null,
    facetEditor:
      canWrite && (facets.data?.length ?? 0) > 0 ? (
        <FacetEditor projectId={projectId} facets={facets.data ?? []} />
      ) : null,
  });
  const actions = (
    <div className="ph-no-capture flex items-center justify-end gap-1">
      {primaryAction}
      <DropdownMenu
        ariaLabel="Topics actions"
        placement="bottom-end"
        items={[
          ...((facets.data?.length ?? 0) > 0
            ? [
                {
                  id: "configure",
                  type: "item" as const,
                  title: "Configure topics",
                  onClick: openConfiguration,
                },
              ]
            : []),
          {
            id: "history",
            type: "item",
            title: "History",
            onClick: openHistory,
          },
          {
            id: "refresh",
            type: "item",
            title: "Refresh results",
            onClick: refreshResults,
          },
        ]}
      >
        {({ getTriggerProps }) => (
          <IconButton
            {...getTriggerProps()}
            icon={MoreHorizontal}
            label="Topics actions"
            size="sm"
          />
        )}
      </DropdownMenu>
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
        actionButtonsMenu: ({ closeMenu }) => (
          <TopicsActionsMenu
            hasFacets={(facets.data?.length ?? 0) > 0}
            triggerAction={triggerAction}
            closeMenu={closeMenu}
            onOpenConfiguration={openConfiguration}
            onOpenHistory={openHistory}
            onRefresh={refreshResults}
          />
        ),
      }}
    >
      <PageHeaderControlsPortal>
        <TimeRangePicker
          timeRange={effectiveTimeRange}
          onTimeRangeChange={setTimeRange}
          timeRangePresets={topicsTimeRangePresets}
          maxRangeMs={maxTimeRangeMs}
          className="my-0 max-w-full overflow-x-auto"
          triggerClassName="px-2"
        />
      </PageHeaderControlsPortal>
      <div className="ph-no-capture flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
        {isTimeRangeCapped && (
          <p role="status" className="text-muted-foreground shrink-0 text-xs">
            {"from" in timeRange
              ? "Showing the final 90 days of your selected range."
              : "Showing the last 90 days."}{" "}
            Your selection is preserved on other pages.
          </p>
        )}
        {!validTimeRange && (
          <ErrorMessage message="Select a time range of at most 90 days." />
        )}
        {error && <ErrorMessage message={error} />}
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
                  <div className="self-start">
                    <Button
                      text="All runs"
                      variant="ghost"
                      size="sm"
                      onClick={() => showExecutionList(true)}
                    />
                  </div>
                  <ExecutionPanel
                    key={executionId}
                    projectId={projectId}
                    executionId={executionId}
                    query={selectedExecution}
                    facets={facets.data ?? []}
                    canWrite={canWrite}
                  />
                </>
              ) : (
                <>
                  <div className="self-end">
                    <Button
                      text="Refresh"
                      size="sm"
                      variant="ghost"
                      onClick={() => executions.refetch()}
                    />
                  </div>
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
                      <Badge text={executionLabels[execution.status]} />
                    </button>
                  ))}
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2 overflow-hidden">
          <TablePeekViewTraceDetail
            {...peekNavigation}
            itemType="TRACE"
            projectId={projectId}
            defaultWidthTarget={tracePanel}
            widthStorageKey="topicsPeekViewWidthFraction"
          />
          {validTimeRange && (
            <TopicsFilters
              facets={results.data ?? []}
              selectedFacetId={selectedFacetId}
              onSelectFacet={setSelectedFacetId}
            >
              <CurrentTopics
                projectId={projectId}
                timeRange={currentTimeRange}
                result={results}
                selectedFacetId={selectedFacet}
                tracePanelRef={setTracePanel}
              />
            </TopicsFilters>
          )}
          {facets.isLoading && <p>Loading facets…</p>}
          {facets.error && <ErrorMessage message={facets.error.message} />}
          {facets.data?.length === 0 && (
            <section className="flex flex-col items-start gap-3">
              <h2 className="font-bold">Start with a question</h2>
              <p className="text-muted-foreground text-sm">
                Create built-in facets for intent, outcome, and issues, then add
                custom facets for your own questions.
              </p>
              <Button
                text="Create starter facets"
                disabled={!canWrite || initialize.isPending}
                onClick={() => initialize.mutate({ projectId })}
              />
              {initialize.error && (
                <ErrorMessage message={initialize.error.message} />
              )}
            </section>
          )}
        </div>
      </div>
    </Page>
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
  const isBuiltIn = facets.some(
    (facet) => facet.id === facetId && facet.isBuiltIn,
  );
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
              <SelectItem
                key={facet.id}
                value={facet.id}
                disabled={facet.isBuiltIn}
              >
                {facet.name} · {facet.isBuiltIn ? "built-in" : "new version"}
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
          disabled={isBuiltIn}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          Built-in questions are read-only. Revising a custom question creates
          an immutable version; existing summaries and maps retain their
          original question.
        </p>
        <div className="self-start">
          <Button
            text="Save facet"
            disabled={
              isBuiltIn ||
              save.isPending ||
              !name.trim() ||
              prompt.trim().length < 10
            }
            onClick={() =>
              save.mutate({
                projectId,
                ...(facetId === "new" ? {} : { facetId }),
                name,
                prompt,
              })
            }
          />
        </div>
        {save.error && <ErrorMessage message={save.error.message} />}
        {save.isSuccess && <p className="text-sm">Facet saved.</p>}
      </div>
    </details>
  );
}

function ExecutionPanel({
  projectId,
  executionId,
  query,
  facets,
  canWrite,
}: {
  projectId: string;
  executionId: string;
  query: UseQueryResult<
    RouterOutputs["topics"]["execution"],
    { message: string }
  >;
  facets: TopicFacet[];
  canWrite: boolean;
}) {
  const utils = api.useUtils();
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
  const modeLabel = (() => {
    if (execution.input.operation !== "update")
      return "Assign to current topics";
    return execution.input.exploratory ? "Small sample" : "Standard";
  })();
  const selectionPrefix = (() => {
    if (execution.status === "running") return "Running on ";
    if (execution.status === "queued") return "Queued for ";
    return "Run selection: ";
  })();
  return (
    <section className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge text={executionLabels[execution.status]} />
          {execution.input.operation === "update" &&
            execution.input.exploratory && (
              <Badge text="Small sample · provisional" />
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
              <PopoverButton variant="ghost" size="sm">
                Run details
              </PopoverButton>
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
                  <TextLink
                    path={`/project/${projectId}/traces/${encodeURIComponent(item.traceId)}`}
                    value={item.traceId}
                  />
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
          <div className="self-start">
            <Button
              text="Resume interrupted stages"
              disabled={retry.isPending}
              onClick={() => retry.mutate({ projectId, executionId })}
            />
          </div>
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
              <Badge text={facetOutcomeLabels[progress.outcome]} />
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
        <div className="self-start">
          <Button
            text="Refresh status"
            variant="ghost"
            onClick={() => {
              query.refetch();
              utils.topics.currentResults.invalidate({ projectId });
              utils.topics.executions.invalidate({ projectId });
              utils.topics.summaryCounts.invalidate({ projectId });
            }}
          />
        </div>
      )}
    </section>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <Alert.Description>
        <p className="break-words">{message}</p>
      </Alert.Description>
    </Alert>
  );
}
