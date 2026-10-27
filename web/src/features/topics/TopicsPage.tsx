/* eslint-disable react/no-unstable-nested-components */
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "@langfuse/icons";
import { type UseQueryResult } from "@tanstack/react-query";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { TablePeekViewTraceDetail } from "@/src/components/table/peek/TablePeekViewTraceDetail";
import { useRouter } from "next/router";
import Page from "@/src/components/layouts/Page";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { TimeRangePicker } from "@/src/components/date-picker";
import { useGlobalDateRange } from "@/src/features/global-time-range/useGlobalDateRange";
import {
  DASHBOARD_AGGREGATION_OPTIONS,
  TABLE_AGGREGATION_OPTIONS,
  TIME_RANGES,
  type TimeRange,
} from "@/src/utils/date-range-utils";
import { ErrorPage } from "@/src/components/error-page";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import { api, type RouterOutputs } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useCanViewTopics } from "@/src/features/topics/topicsAccess";
import {
  type TopicFacet,
  type TopicOperation,
  type TopicTimeRange,
} from "@langfuse/shared/topics";
import { useTopicPipelineForm } from "./TopicPipelineForm";
import { ManualTopicsFormContent } from "./ManualTopicsFormContent";
import { cn } from "@/src/utils/tailwind";
import { TopicsFacetTabs } from "./TopicsFacetTabs";
import { TopicsMobileControls } from "./TopicsMobileControls";
import { resolveTopicFacetId } from "./topic-facet-selection";
import { Spinner } from "@/src/components/layouts/Spinner";
import { TopicsHeaderActions } from "./TopicsHeaderActions";
import {
  TopicsResultsViewSelect,
  useTopicsResultsView,
} from "./TopicsResultsViewSelect";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { useRegenerateTopics } from "./useRegenerateTopics";
import { useTopicModelSettings } from "./TopicModelSettings";
import { AutomaticProcessingDialogController } from "./AutomaticProcessingDialogController";
import { ConfigureTopicsDialogController } from "./ConfigureTopicsDialogController";
import { TopicSetupFlowController } from "./TopicSetupFlowController";
import { TopicSetupNotice } from "./TopicSetupNotice";
import { topicSetupRun, topicSetupStage } from "./topic-setup-flow";
import { TopicSetupProgressView } from "./TopicSetupProgressView";
import { CurrentTopics, useCurrentTopics } from "./CurrentTopics";
import { TopicsActionsMenu } from "./TopicsActionsMenu";
import { prepareTopicsActions } from "./prepare-topics-actions";
import { TopicsWorkspaceGate } from "./TopicsWorkspaceGate";
import { isValidTopicTimeRange } from "./time-range";
import { useTopicTraceFilters } from "./useTopicTraceFilters";
import { TopicRunDetails } from "./TopicRunDetails";
import { TopicRunHistoryList } from "./TopicRunHistoryList";
import { TopicsErrorMessage } from "./TopicsErrorMessage";
import { busy, operationLabels } from "./topic-run-labels";

const maxTimeRangeMs = TIME_RANGES.last90Days.minutes * 60_000;
const sharedTimeRangePresets = [
  ...new Set([...TABLE_AGGREGATION_OPTIONS, ...DASHBOARD_AGGREGATION_OPTIONS]),
].sort((a, b) => TIME_RANGES[a].minutes - TIME_RANGES[b].minutes);
const topicsTimeRangePresets = sharedTimeRangePresets.filter(
  (range) => TIME_RANGES[range].minutes * 60_000 <= maxTimeRangeMs,
);

const loadingPage = (
  <Page headerProps={{ title: "Topics" }}>
    <Spinner message="Loading topics" />
  </Page>
);

export default function TopicsPage() {
  const router = useRouter();
  const projectId =
    typeof router.query.projectId === "string" ? router.query.projectId : "";
  const topicsEnabled = useCanViewTopics(projectId);
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
  const canWrite = useHasProjectAccess({ projectId, scope: "topics:CUD" });
  const modelSettings = useTopicModelSettings({
    projectId,
    canWrite,
    facets: facets.data ?? [],
    facetsReady: facets.isSuccess,
  });
  return (
    <TopicsWorkspaceGate isLoading={facets.isLoading} fallback={loadingPage}>
      <TopicSetupFlowController
        projectId={projectId}
        canWrite={canWrite}
        settings={modelSettings.configure.settings}
        onSaveSampling={modelSettings.automaticProcessing.save}
      >
        {({ openSetup }) => (
          <TopicsWorkspaceView
            key={(facets.data?.length ?? 0) > 0 ? "configured" : "empty"}
            projectId={projectId}
            facets={facets}
            canWrite={canWrite}
            modelSettings={modelSettings}
            openSetup={openSetup}
          />
        )}
      </TopicSetupFlowController>
    </TopicsWorkspaceGate>
  );
}

type TopicsWorkspaceViewProps = {
  projectId: string;
  facets: UseQueryResult<TopicFacet[], { message: string }>;
  canWrite: boolean;
  modelSettings: ReturnType<typeof useTopicModelSettings>;
  openSetup: () => void;
};

/**
 * Wraps the workspace in the dialog controllers whose dialogs open from more
 * than one place, and hands their `openDialog` to the content.
 */
function TopicsWorkspaceView({
  projectId,
  facets,
  canWrite,
  modelSettings,
  openSetup,
}: TopicsWorkspaceViewProps) {
  return (
    <ConfigureTopicsDialogController
      projectId={projectId}
      settings={modelSettings.configure.settings}
    >
      {({ openDialog: openConfigure }) => (
        <AutomaticProcessingDialogController
          {...modelSettings.automaticProcessing.dialog}
        >
          {({ openDialog: openAutomaticProcessing }) => (
            <TopicsWorkspaceContent
              projectId={projectId}
              facets={facets}
              canWrite={canWrite}
              modelSettings={modelSettings}
              openConfigure={openConfigure}
              openSetup={openSetup}
              openAutomaticProcessing={openAutomaticProcessing}
            />
          )}
        </AutomaticProcessingDialogController>
      )}
    </ConfigureTopicsDialogController>
  );
}

type TopicsWorkspaceContentProps = TopicsWorkspaceViewProps & {
  openConfigure: () => void;
  openAutomaticProcessing: (initialEnabled: boolean) => void;
};

function TopicsWorkspaceContent({
  projectId,
  facets,
  canWrite,
  modelSettings,
  openConfigure,
  openSetup,
  openAutomaticProcessing,
}: TopicsWorkspaceContentProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [resultsView, setResultsView] = useTopicsResultsView();
  const [generationRange, setGenerationRange] = useState<{
    selection: TimeRange;
    bounds: TopicTimeRange;
  }>(() => ({
    selection: { range: "last7Days" },
    bounds: { from: new Date(Date.now() - 7 * 86_400_000), to: new Date() },
  }));
  const changeGenerationRange = (selection: TimeRange) => {
    if ("from" in selection) {
      setGenerationRange({ selection, bounds: selection });
      return;
    }
    const to = new Date();
    const minutes =
      TIME_RANGES[selection.range as keyof typeof TIME_RANGES]?.minutes ??
      TIME_RANGES.last7Days.minutes;
    const bounds = { from: new Date(to.getTime() - minutes * 60_000), to };
    setGenerationRange({ selection, bounds });
  };
  const { timeRange, setTimeRange } = useGlobalDateRange({
    allowedRanges: sharedTimeRangePresets,
    fallback: "last7Days",
  });
  const [refreshedAt, setRefreshedAt] = useState(Date.now);
  // Coming back to the tab moves a relative range forward, so auto-analyzed traces show up.
  useEffect(() => {
    function refreshOnVisible() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      setRefreshedAt((previous) => (now - previous > 60_000 ? now : previous));
    }
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () =>
      document.removeEventListener("visibilitychange", refreshOnVisible);
  }, []);
  const [tracePanel, setTracePanel] = useState<HTMLElement | null>(null);
  const peekNavigation = usePeekNavigation({
    tableName: "topics-traces",
    isV4: false,
    queryParams: ["observation", "display", "timestamp", "traceId"],
    expandConfig: { basePath: `/project/${projectId}/traces`, reader: "trace" },
  });
  const router = useRouter();
  const utils = api.useUtils();
  const executions = api.topics.executions.useQuery(
    { projectId },
    {
      refetchInterval: (query) => {
        const data = query.state.data ?? [];
        if (data.some((execution) => busy(execution.status))) return 3000;
        // Keep polling through the hand-off from summaries to the topic update.
        const run = topicSetupRun(data);
        return run &&
          !run.update &&
          topicSetupStage(run, Date.now()).stage === "grouping"
          ? 3000
          : false;
      },
    },
  );
  const [mountedAt] = useState(Date.now);
  const setupRun = topicSetupRun(executions.data ?? []);
  const setup = setupRun ? topicSetupStage(setupRun, Date.now()) : null;
  // A finished run hands over to results; a failure from this visit stays until retried.
  const showSetupProgress =
    setupRun !== null &&
    setup !== null &&
    (["summarizing", "grouping", "naming"].includes(setup.stage) ||
      (setup.stage === "failed" &&
        Date.parse((setupRun.update ?? setupRun.process).updatedAt) >
          mountedAt));
  const setupRetry = api.topics.retry.useMutation({
    onSuccess: () => utils.topics.executions.invalidate({ projectId }),
  });
  const setupDetailsId =
    setupRun && setup?.stage === "failed"
      ? (setup.retryId ?? setupRun.update?.id ?? setupRun.process.id)
      : null;
  const runFacets = (run: typeof setupRun) =>
    run?.process.facets.map((facet) => {
      return {
        key: `${facet.facetId}:${facet.facetVersion}`,
        name:
          facets.data?.find((item) => item.id === facet.facetId)?.name ??
          "Facet",
        complete: facet.counts.complete,
        requested: facet.counts.requested,
      };
    }) ?? [];
  const setupFacets = runFacets(setupRun);
  const busyProcess =
    (executions.data ?? []).find(
      (execution) =>
        execution.input.operation === "process" && busy(execution.status),
    ) ?? null;
  const executionId =
    typeof router.query.executionId === "string"
      ? router.query.executionId
      : null;
  const selectedExecution = api.topics.execution.useQuery(
    { projectId, executionId: executionId ?? "" },
    {
      enabled: executionId !== null,
      // The list already has this run, so the panel renders without a loading flash.
      placeholderData: () =>
        executions.data?.find((execution) => execution.id === executionId),
      refetchInterval: (query) =>
        !query.state.data || busy(query.state.data.status) ? 1500 : false,
    },
  );
  const selectedRunTitle = selectedExecution.data
    ? operationLabels[selectedExecution.data.input.operation]
    : "Run";
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
  const setupBlockedReason = startBlockedReason(
    running,
    modelSettings.automaticProcessing.state.status === "on",
  );
  const results = useCurrentTopics({
    projectId,
    running,
    pollForSummaries: modelSettings.automaticProcessing.state.status === "on",
    refreshAfter: completedAt,
    timeRange: currentTimeRange,
  });
  const traceFilters = useTopicTraceFilters(
    projectId,
    results.data?.facets ?? [],
  );
  const { selectedFacetId } = traceFilters;
  const openExecution = (id: string) => {
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
  const regenerate = useRegenerateTopics({
    projectId,
    facets: facets.data ?? [],
    canWrite,
    timeRange: generationRange.bounds,
    executions: executions.data,
    executionsError: executions.error?.message ?? null,
  });
  const pipeline = useTopicPipelineForm({
    projectId,
    facets: facets.data ?? [],
    canWrite,
    onTriggered: openExecution,
    regenerate,
    settings: modelSettings.configure.settings,
    configurationError: modelSettings.configure.error,
    running,
    onConfigure: openConfigure,
    generationTimeRange: generationRange.selection,
    onGenerationTimeRangeChange: changeGenerationRange,
  });
  const configured = Boolean(
    modelSettings.configure.settings?.stored.summary &&
    modelSettings.configure.settings.stored.embedding &&
    modelSettings.configure.settings.stored.clustering,
  );
  const automaticProcessing = modelSettings.automaticProcessing;
  function openAutomaticProcessingFromHeader() {
    openAutomaticProcessing(automaticProcessing.state.status === "on");
  }
  function turnAutomaticProcessingBackOn() {
    openAutomaticProcessing(true);
  }

  return (
    <DialogController<TopicOperation>
      renderDialog={({ closeDialog, state }) => (
        <ManualTopicsFormContent
          {...pipeline.dialogProps}
          initialOperation={state}
          closeDialog={closeDialog}
        />
      )}
    >
      {({ openDialog }) => {
        const openManual = (operation: TopicOperation) => {
          if (!("from" in generationRange.selection))
            changeGenerationRange(generationRange.selection);
          utils.topics.summaryCounts.invalidate({ projectId });
          pipeline.clearError();
          openDialog(operation);
        };
        function openTopicGeneration() {
          openManual("update");
        }
        const hasStoredSummaries = Boolean(results.data?.hasStoredSummaries);
        const headerFacetId = resolveTopicFacetId(
          results.data?.facets ?? [],
          selectedFacetId,
        );
        const showLanding =
          validTimeRange &&
          results.data !== undefined &&
          !results.isLoading &&
          !results.error &&
          !hasStoredSummaries;
        // Without a tracked setup run, a running summary run or automatic processing still shows progress.
        const landingRun =
          showLanding && !showSetupProgress && busyProcess
            ? { process: busyProcess, update: null }
            : null;
        const waitingForTraces =
          showLanding &&
          !showSetupProgress &&
          !landingRun &&
          modelSettings.automaticProcessing.state.status === "on";
        const showOnboarding = showSetupProgress || showLanding;
        const landingOnly =
          showLanding && !showSetupProgress && !setupBlockedReason;
        const actions = prepareTopicsActions({
          automaticProcessing,
          canWrite,
          configureAvailable: modelSettings.configure.settings !== null,
          regenerateAvailable: pipeline.available,
          menuOnly: landingOnly,
          onAutomaticProcessing: openAutomaticProcessingFromHeader,
          onConfigure: configured ? openConfigure : openSetup,
          onRegenerate: openTopicGeneration,
          onHistory: openHistory,
        });
        return (
          <Page
            headerProps={{
              title: "Topics",
              className: "@container/topics-header",
              actionButtonsLeft: showOnboarding ? null : (
                <div className="flex items-center gap-3">
                  {validTimeRange && headerFacetId && (
                    <TopicsFacetTabs
                      facets={results.data?.facets ?? []}
                      selectedFacet={headerFacetId}
                      onSelectFacet={traceFilters.selectFacet}
                    />
                  )}
                  <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-sm whitespace-nowrap">
                    Visualize as
                    <TopicsResultsViewSelect
                      value={resultsView}
                      onValueChange={setResultsView}
                    />
                  </span>
                </div>
              ),
              actionButtonsRight: <TopicsHeaderActions actions={actions} />,
              actionButtonsMenu: ({ closeMenu }) => (
                <TopicsActionsMenu actions={actions} closeMenu={closeMenu} />
              ),
            }}
          >
            {!showOnboarding && (
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
            )}
            <div
              className={cn(
                "ph-no-capture flex min-h-0 flex-1 flex-col gap-2 overflow-hidden",
                showOnboarding && "p-2",
              )}
            >
              {!showOnboarding && validTimeRange && headerFacetId && (
                <div className="shrink-0 px-3 pt-2 md:hidden">
                  <TopicsMobileControls
                    facets={results.data?.facets ?? []}
                    selectedFacet={headerFacetId}
                    onSelectFacet={traceFilters.selectFacet}
                    view={resultsView}
                    onSelectView={setResultsView}
                  />
                </div>
              )}
              {isTimeRangeCapped && (
                <p
                  role="status"
                  className="text-muted-foreground shrink-0 text-xs"
                >
                  {"from" in timeRange
                    ? "Showing the final 90 days of your selected range."
                    : "Showing the last 90 days."}{" "}
                  Your selection is preserved on other pages.
                </p>
              )}
              {!validTimeRange && (
                <TopicsErrorMessage message="Select a time range of at most 90 days." />
              )}
              <TopicSetupNotice
                notice={modelSettings.notice}
                canWrite={canWrite}
                canConfigure={modelSettings.configure.settings !== null}
                onStart={openSetup}
                startBlockedReason={setupBlockedReason}
                onKeepOff={automaticProcessing.clearPause}
                onTurnBackOn={turnAutomaticProcessingBackOn}
                showOnboarding={
                  showLanding &&
                  !showSetupProgress &&
                  !landingRun &&
                  !waitingForTraces
                }
              />
              {landingRun ? (
                <TopicSetupProgressView
                  stage={topicSetupStage(landingRun, Date.now()).stage}
                  facets={runFacets(landingRun)}
                  retrying={false}
                  canRetry={false}
                  onViewDetails={() => openExecution(landingRun.process.id)}
                />
              ) : null}
              {waitingForTraces ? (
                <TopicSetupProgressView
                  waiting
                  stage="summarizing"
                  facets={[]}
                  retrying={false}
                  canRetry={false}
                />
              ) : null}
              {showSetupProgress && setup ? (
                <TopicSetupProgressView
                  stage={setup.stage}
                  facets={setupFacets}
                  retrying={setupRetry.isPending}
                  canRetry={setup.retryId !== null}
                  onViewDetails={
                    setupDetailsId
                      ? () => openExecution(setupDetailsId)
                      : undefined
                  }
                  onRetry={() => {
                    if (setup.retryId)
                      setupRetry.mutate({
                        projectId,
                        executionId: setup.retryId,
                      });
                  }}
                />
              ) : null}
              <Sheet
                open={historyOpen || executionId !== null}
                onOpenChange={showExecutionList}
              >
                <SheetContent
                  className="ph-no-capture flex w-full flex-col gap-0 p-0 sm:max-w-lg"
                  aria-describedby={undefined}
                >
                  {executionId ? (
                    <SheetTitle className="sr-only">
                      {selectedRunTitle}
                    </SheetTitle>
                  ) : (
                    <SheetHeader className="border-b px-5 py-4">
                      <SheetTitle>Run history</SheetTitle>
                    </SheetHeader>
                  )}
                  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                    {executionId ? (
                      <ExecutionPanel
                        key={executionId}
                        projectId={projectId}
                        executionId={executionId}
                        query={selectedExecution}
                        facets={facets.data ?? []}
                        canWrite={canWrite}
                        onBack={() => showExecutionList(true)}
                      />
                    ) : (
                      <TopicRunHistoryList
                        executions={executions.data ?? []}
                        errorMessage={executions.error?.message}
                        onOpen={openExecution}
                        onRetry={() => executions.refetch()}
                      />
                    )}
                  </div>
                </SheetContent>
              </Sheet>
              <div
                className={
                  showOnboarding
                    ? "contents"
                    : "flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2 overflow-hidden"
                }
              >
                <TablePeekViewTraceDetail
                  {...peekNavigation}
                  itemType="TRACE"
                  projectId={projectId}
                  defaultWidthTarget={tracePanel}
                  widthStorageKey="topicsPeekViewWidthFraction"
                />
                {validTimeRange && !showOnboarding && (
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <CurrentTopics
                      projectId={projectId}
                      timeRange={currentTimeRange}
                      result={results}
                      selectedFacetId={selectedFacetId}
                      view={resultsView}
                      traceFilters={traceFilters}
                      tracePanelRef={setTracePanel}
                      onGenerateTopics={openTopicGeneration}
                      canGenerateTopics={canWrite && !running && configured}
                    />
                  </div>
                )}
                {facets.isLoading && <p>Loading facets…</p>}
                {facets.error && (
                  <TopicsErrorMessage message={facets.error.message} />
                )}
              </div>
            </div>
          </Page>
        );
      }}
    </DialogController>
  );
}

function ExecutionPanel({
  projectId,
  executionId,
  query,
  facets,
  canWrite,
  onBack,
}: {
  projectId: string;
  executionId: string;
  query: UseQueryResult<
    RouterOutputs["topics"]["execution"],
    { message: string }
  >;
  facets: TopicFacet[];
  canWrite: boolean;
  onBack: () => void;
}) {
  const utils = api.useUtils();
  const retry = api.topics.retry.useMutation({
    onSuccess: () =>
      Promise.all([
        query.refetch(),
        utils.topics.executions.invalidate({ projectId }),
      ]),
  });
  // Trace errors start expanded for failed runs until the user toggles them.
  const [traceErrorsToggled, setTraceErrorsToggled] = useState<boolean | null>(
    null,
  );
  const execution = query.data;
  const traceErrorsOpen =
    traceErrorsToggled ??
    (execution?.status === "failed" &&
      execution.facets.some((facet) => facet.counts.failed > 0));
  const traceErrors = api.topics.traceErrors.useQuery(
    { projectId, executionId },
    { enabled: traceErrorsOpen },
  );
  if (query.error || !execution) {
    return (
      <>
        <header className="flex items-center border-b py-3.5 pr-12 pl-3">
          <IconButton
            icon={ChevronLeft}
            label="All runs"
            variant="ghost"
            size="sm"
            onClick={onBack}
          />
        </header>
        {query.error ? (
          <div className="p-4">
            <TopicsErrorMessage message={query.error.message} />
          </div>
        ) : (
          <p className="p-4 text-sm">Loading execution…</p>
        )}
      </>
    );
  }
  return (
    <TopicRunDetails
      execution={execution}
      facets={facets}
      projectId={projectId}
      canWrite={canWrite}
      traceErrors={{
        open: traceErrorsOpen,
        onOpenChange: setTraceErrorsToggled,
        isPending: traceErrors.isPending,
        errorMessage: traceErrors.error?.message,
        data: traceErrors.data,
      }}
      retry={{
        isPending: retry.isPending,
        errorMessage: retry.error?.message,
        onRetry: () => retry.mutate({ projectId, executionId }),
      }}
      onBack={onBack}
    />
  );
}

function startBlockedReason(running: boolean, automaticOn: boolean) {
  if (running)
    return "Analysis is running. Topics appear here when it finishes.";
  if (automaticOn)
    return "Automatic processing is on. Topics appear here as traces are summarized.";
  return null;
}
