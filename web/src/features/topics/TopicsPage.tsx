/* eslint-disable react/no-unstable-nested-components */
import { useEffect, useState } from "react";
import { ChevronLeft } from "@langfuse/icons";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { TablePeekViewTraceDetail } from "@/src/components/table/peek/TablePeekViewTraceDetail";
import { useRouter } from "next/router";
import useSessionStorage from "@/src/components/useSessionStorage";
import Page from "@/src/components/layouts/Page";
import { ErrorPage } from "@/src/components/ErrorPage";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import { api, type RouterOutputs } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useCanViewTopics } from "@/src/features/topics/topicsAccess";
import { TOPICS_MAX_RULES, type TopicFacet } from "@langfuse/shared/topics";
import { cn } from "@/src/utils/tailwind";
import { useIsHandheld } from "@/src/hooks/use-mobile";
import { TopicsFacetTabs } from "./TopicsFacetTabs";
import { TopicsMobileControls } from "./TopicsMobileControls";
import { resolveTopicFacetId } from "./topic-facet-selection";
import { Spinner } from "@/src/components/layouts/Spinner";
import { TopicsHeaderActions } from "./TopicsHeaderActions";
import {
  TopicsResultsViewSelect,
  useTopicsResultsView,
} from "./TopicsResultsViewSelect";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { useTopicSettings } from "./useTopicSettings";
import { AutomaticProcessingDialogController } from "./AutomaticProcessingDialogController";
import { ConfigureTopicsDialogController } from "./ConfigureTopicsDialogController";
import { TopicSetupFlowController } from "./TopicSetupFlowController";
import { TopicSetupNotice } from "./TopicSetupNotice";
import {
  topicRuleSetupProgress,
  type TopicSetupStage,
} from "./topic-setup-flow";
import { TopicSetupProgressView } from "./TopicSetupProgressView";
import { CurrentTopics, useCurrentTopics } from "./CurrentTopics";
import { TopicsActionsMenu } from "./TopicsActionsMenu";
import {
  prepareTopicsActions,
  refreshMapDisabledReason,
} from "./prepare-topics-actions";
import { useOpenTopicsFeedback } from "./useOpenTopicsFeedback";
import { TopicsWorkspaceGate } from "./TopicsWorkspaceGate";
import { useTopicTraceFilters } from "./useTopicTraceFilters";
import { TopicRunDetails } from "./TopicRunDetails";
import { TopicRunHistoryList } from "./TopicRunHistoryList";
import { TopicsErrorMessage } from "./TopicsErrorMessage";
import {
  busy,
  createsSummaries,
  formatTopicCost,
  formatTopicRunCost,
  runLabel,
  type TopicRunCost,
  type TopicRunWithCost,
} from "./topic-run-labels";
import {
  resolveTopicMapSelection,
  topicMapQuery,
  type TopicAnalysisMap,
  type TopicMapSelection,
} from "./topic-maps";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  TopicsMapPicker,
  type UsePickerCost,
  type UsePreviewTopics,
} from "./TopicsMapPicker";
import { TopicMapStrip, topicRuleStatus } from "./TopicMapStrip";
import { TopicRuleBuildingState } from "./TopicRuleBuildingState";
import { TopicAnalysisState } from "./TopicAnalysisState";
import { TopicSliceDialogController } from "./TopicSliceDialogController";
import { type TopicsPageState } from "./topicsAnalytics";
import { useTopicsCapture, useTopicsViewCapture } from "./useTopicsCapture";

const COST_POLL_INTERVAL_MS = 30_000;
const COST_STALE_TIME_MS = 5 * 60_000;

const loadingPage = (
  <Page headerProps={{ title: "Topics" }}>
    <Spinner message="Loading topics" />
  </Page>
);

/** One map's results for the picker preview, cached for a minute. */
const usePreviewTopics: UsePreviewTopics = (projectId, map) => {
  const rule = api.topics.currentResults.useQuery(
    { projectId, ruleId: map?.kind === "rule" ? map.id : undefined },
    { enabled: map?.kind === "rule", staleTime: 60_000 },
  );
  const analysis = api.topics.analysisResults.useQuery(
    { projectId, executionId: map?.kind === "analysis" ? map.id : "" },
    { enabled: map?.kind === "analysis", staleTime: 60_000 },
  );
  const query = map?.kind === "analysis" ? analysis : rule;
  return { facets: query.data?.facets, loading: query.isLoading };
};

const usePickerCost: UsePickerCost = (projectId, map) => {
  const snapshot = map && "timeRange" in map ? map : undefined;
  const liveCosts = api.topics.ruleMapCosts.useQuery(
    { projectId },
    {
      enabled: Boolean(map && !snapshot),
      staleTime: COST_STALE_TIME_MS,
      refetchOnWindowFocus: false,
    },
  );
  const costFor = useVisibleRunCosts(projectId, snapshot ? [snapshot] : []);
  if (snapshot) return formatTopicRunCost(costFor(snapshot.id));
  if (map && liveCosts.data)
    return formatTopicCost(liveCosts.data[map.id] ?? null);
  return formatTopicCost(liveCosts.isError ? null : undefined);
};

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
  const modelSettings = useTopicSettings({
    projectId,
    canWrite,
    facets: facets.data ?? [],
    facetsReady: facets.isSuccess,
  });
  // The workspace mounts while facets load so its requests start alongside
  // them. It remounts when the project later gains or loses its facets, but
  // not when the first facets response arrives.
  const hasFacets = facets.data ? facets.data.length > 0 : undefined;
  const [loadedWithFacets, setLoadedWithFacets] = useState(hasFacets);
  if (loadedWithFacets === undefined && hasFacets !== undefined)
    setLoadedWithFacets(hasFacets);
  const facetsChanged =
    hasFacets !== undefined && hasFacets !== (loadedWithFacets ?? hasFacets);
  return (
    <TopicSetupFlowController
      projectId={projectId}
      canWrite={canWrite}
      settings={modelSettings.configure.settings}
      onSaveSampling={modelSettings.automaticProcessing.save}
    >
      {({ openSetup }) => (
        <TopicsWorkspaceView
          key={facetsChanged ? "facets-changed" : "first-load"}
          projectId={projectId}
          facets={facets}
          canWrite={canWrite}
          modelSettings={modelSettings}
          openSetup={openSetup}
        />
      )}
    </TopicSetupFlowController>
  );
}

type TopicsWorkspaceViewProps = {
  projectId: string;
  facets: UseQueryResult<TopicFacet[], { message: string }>;
  canWrite: boolean;
  modelSettings: ReturnType<typeof useTopicSettings>;
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
  const openFeedback = useOpenTopicsFeedback();
  const [resultsView, setResultsView] = useTopicsResultsView();
  const isHandheld = useIsHandheld();
  const [showUnassigned, setShowUnassigned] = useSessionStorage(
    `topics-show-unassigned:${projectId}`,
    true,
  );
  const [tracePanel, setTracePanel] = useState<HTMLElement | null>(null);
  const peekNavigation = usePeekNavigation({
    tableName: "topics-traces",
    isV4: true,
    queryParams: ["observation", "display", "timestamp", "traceId"],
    expandConfig: { basePath: `/project/${projectId}/traces`, reader: "trace" },
  });
  const router = useRouter();
  const utils = api.useUtils();
  const executions = api.topics.executions.useQuery(
    { projectId, includeCosts: false },
    {
      refetchInterval: (query) =>
        (query.state.data ?? []).some((execution) => busy(execution.status))
          ? 3000
          : false,
    },
  );
  const [mountedAt] = useState(Date.now);
  const facetName = (facetId: string) =>
    facets.data?.find((item) => item.id === facetId)?.name ?? "Facet";
  const executionId =
    typeof router.query.executionId === "string"
      ? router.query.executionId
      : null;
  const selectedExecution = api.topics.execution.useQuery(
    { projectId, executionId: executionId ?? "", includeCosts: false },
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
    ? runLabel(selectedExecution.data.input)
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
  // Runs that finished before the run list first loaded are already in the
  // first results request; only later completions start a new one.
  const [listedCompletedAt, setListedCompletedAt] = useState<number | null>(
    null,
  );
  if (executions.data && listedCompletedAt === null)
    setListedCompletedAt(completedAt);
  const refreshAfter =
    listedCompletedAt === null || completedAt === listedCompletedAt
      ? 0
      : completedAt;
  const running =
    Boolean(executions.data?.some((execution) => busy(execution.status))) ||
    busy(selectedExecution.data?.status ?? "");
  const maps = api.topics.maps.useQuery(
    { projectId },
    {
      // A rule whose setup built its map polls until the map's refit shows.
      refetchInterval: (query) =>
        query.state.data?.analyses.some((analysis) => busy(analysis.status)) ||
        query.state.data?.rules.some(
          (rule) =>
            rule.refresh.running ||
            (!rule.lastRefitAt &&
              setupBuiltMap(
                utils.topics.ruleSetupStatus.getData({
                  projectId,
                  ruleId: rule.id,
                }),
              )),
        )
          ? 3000
          : false,
    },
  );

  const mapSelection = resolveTopicMapSelection(
    maps.data,
    typeof router.query.map === "string" ? router.query.map : undefined,
  );
  const selectedRule =
    mapSelection?.kind === "rule"
      ? maps.data?.rules.find((rule) => rule.id === mapSelection.id)
      : undefined;
  // A refit (refresh or nightly) is no execution; its completion shows as a new lastRefitAt.
  const lastRefitAt = selectedRule?.lastRefitAt
    ? Date.parse(selectedRule.lastRefitAt)
    : 0;
  const [listedRefit, setListedRefit] = useState<{
    ruleId: string;
    at: number;
  } | null>(null);
  if (selectedRule && listedRefit?.ruleId !== selectedRule.id)
    setListedRefit({ ruleId: selectedRule.id, at: lastRefitAt });
  const refitAfter =
    listedRefit?.ruleId === selectedRule?.id && listedRefit?.at !== lastRefitAt
      ? lastRefitAt
      : 0;
  const refreshAvailableAt = selectedRule?.refresh.availableAt;
  const [, setCooldownEnded] = useState<string | null>(null);
  useEffect(() => {
    if (!refreshAvailableAt) return;
    const timer = setTimeout(
      () => setCooldownEnded(refreshAvailableAt),
      Math.max(0, Date.parse(refreshAvailableAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [refreshAvailableAt]);
  const selectedAnalysis =
    mapSelection?.kind === "analysis"
      ? maps.data?.analyses.find((analysis) => analysis.id === mapSelection.id)
      : undefined;
  const analysisId = mapSelection?.kind === "analysis" ? mapSelection.id : null;
  const historyRuns =
    historyOpen && !executionId ? (executions.data ?? []) : [];
  const costFor = useVisibleRunCosts(
    projectId,
    executionId && selectedExecution.data
      ? [selectedExecution.data]
      : historyRuns,
  );
  // Onboarding has no selection yet; the first rule is the one setup created.
  const setupRuleId = analysisId
    ? undefined
    : (selectedRule?.id ?? maps.data?.rules[0]?.id);
  const ruleSetup = api.topics.ruleSetupStatus.useQuery(
    { projectId, ruleId: setupRuleId ?? "" },
    {
      enabled: setupRuleId !== undefined,
      refetchInterval: (query) =>
        query.state.data && topicRuleSetupProgress(query.state.data).active
          ? 5000
          : false,
    },
  );
  const setup = ruleSetup.data ? topicRuleSetupProgress(ruleSetup.data) : null;
  // A finished setup hands over to results; a failure from this visit stays until retried.
  const showSetupProgress =
    setup !== null &&
    (setup.active ||
      (setup.stage === "failed" &&
        Date.parse(ruleSetup.data!.startedAt) > mountedAt));
  const setupRetry = api.topics.startRuleSetup.useMutation({
    onSuccess: () => utils.topics.ruleSetupStatus.invalidate({ projectId }),
  });
  const setupFacets =
    setup?.facets.map((facet) => ({
      key: facet.facetId,
      name: facetName(facet.facetId),
      complete: facet.complete,
      requested: facet.requested,
    })) ?? [];
  const analysisResults = api.topics.analysisResults.useQuery(
    { projectId, executionId: analysisId ?? "" },
    {
      enabled: analysisId !== null,
      // The results area already explains a run it can't find.
      meta: { silentHttpCodes: [404] },
      refetchInterval: (query) =>
        query.state.data && busy(query.state.data.execution.status)
          ? 3000
          : false,
    },
  );
  const selectMap = (selection: TopicMapSelection) => {
    const query: Record<string, string | string[] | undefined> = {
      ...router.query,
      ...topicMapQuery(selection),
    };
    delete query.run;
    delete query.executionId;
    router.push({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
  };
  const setupBlockedReason = startBlockedReason(
    running,
    modelSettings.automaticProcessing.state.status === "on",
  );
  const awaitingSetupMap =
    selectedRule !== undefined &&
    !selectedRule.lastRefitAt &&
    setupBuiltMap(ruleSetup.data);
  const results = useCurrentTopics({
    projectId,
    // Setup and refresh fits are no executions; poll through them until their map shows.
    running:
      running ||
      Boolean(setup?.active) ||
      Boolean(selectedRule?.refresh?.running) ||
      awaitingSetupMap,
    pollForSummaries: modelSettings.automaticProcessing.state.status === "on",
    refreshAfter: Math.max(refreshAfter, refitAfter),
    ruleId: selectedRule?.id,
    enabled: !analysisId,
  });
  const shownResults = analysisId
    ? {
        data: analysisResults.data,
        isLoading: analysisResults.isLoading,
        error: analysisResults.error,
      }
    : results;
  const scope = analysisId ? { analysisId } : { ruleId: selectedRule?.id };
  const traceFilters = useTopicTraceFilters(
    projectId,
    shownResults.data?.facets ?? [],
  );
  const { selectedFacetId } = traceFilters;
  const capture = useTopicsCapture();
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
  const automaticProcessing = modelSettings.automaticProcessing;
  function turnAutomaticProcessingBackOn() {
    openAutomaticProcessing(true);
  }

  const mapCount =
    (maps.data?.rules.length ?? 0) + (maps.data?.analyses.length ?? 0);
  const mapLimitReason =
    (maps.data?.rules.length ?? 0) >= TOPICS_MAX_RULES
      ? `A project can have at most ${TOPICS_MAX_RULES} maps.`
      : undefined;
  const hasStoredSummaries = Boolean(results.data?.hasStoredSummaries);
  const shownFacets = shownResults.data?.facets ?? [];
  const showLanding =
    !analysisId &&
    results.data !== undefined &&
    !results.isLoading &&
    !results.error &&
    !hasStoredSummaries;
  // Without a tracked setup run, automatic processing still shows progress.
  const waitingForTraces =
    showLanding &&
    !showSetupProgress &&
    modelSettings.automaticProcessing.state.status === "on";
  // A setup keeps the header while other maps exist, so they stay reachable.
  const setupInline =
    showSetupProgress &&
    Boolean(
      (maps.data?.analyses.length ?? 0) > 0 ||
      maps.data?.rules.some(
        (rule) => rule.id !== setupRuleId && rule.lastRefitAt,
      ),
    );
  const showOnboarding = (showSetupProgress && !setupInline) || showLanding;
  // Only once results loaded; loading and errors stay with CurrentTopics.
  // Setup's outcome decides the copy, so it waits for the status.
  const showBuilding =
    shownResults.data !== undefined &&
    ruleSetup.data !== undefined &&
    !shownResults.error &&
    !showOnboarding &&
    !showSetupProgress &&
    selectedRule !== undefined &&
    selectedRule.enabled !== false &&
    !selectedRule.lastRefitAt &&
    !shownFacets.some((facet) => facet.map);
  const landingShown = showLanding && !showSetupProgress && !waitingForTraces;
  const pageResolved =
    maps.data !== undefined &&
    shownResults.data !== undefined &&
    !ruleSetup.isLoading;
  const setupStage = (showSetupProgress && setup?.stage) || null;
  const pageState = pageResolved
    ? topicsPageState({
        snapshot: analysisId !== null,
        setup: setupStage,
        waitingForTraces,
        landing: showLanding,
        building: showBuilding,
      })
    : null;
  useTopicsViewCapture(pageState === null ? null : "page", () => {
    if (pageState)
      capture("topics:page_viewed", { pageState, canWrite, mapCount });
  });
  const workspace = (
    <TopicSliceDialogController
      projectId={projectId}
      facets={facets.data ?? []}
      mapDisabledReason={mapLimitReason}
      onAnalysisStarted={(executionId) =>
        selectMap({ kind: "analysis", id: executionId })
      }
      onRuleCreated={(ruleId) => selectMap({ kind: "rule", id: ruleId })}
    >
      {({ openSliceDialog }) => {
        const headerFacetId = resolveTopicFacetId(shownFacets, selectedFacetId);
        const hasStrip =
          (!showOnboarding && selectedRule !== undefined) ||
          selectedAnalysis !== undefined;
        // Below md only the page menu's Show unassigned row carries this setting.
        const unassignedSwitch = (
          <label className="text-muted-foreground flex shrink-0 items-center gap-2 text-sm whitespace-nowrap">
            <Switch
              size="sm"
              checked={showUnassigned}
              onCheckedChange={setShowUnassigned}
            />
            Unassigned
          </label>
        );
        const viewControls = (
          <>
            {headerFacetId && (
              <span className="text-muted-foreground flex shrink-0 items-center gap-2.5 text-sm whitespace-nowrap">
                Analyze
                <TopicsFacetTabs
                  facets={shownFacets}
                  selectedFacet={headerFacetId}
                  onSelectFacet={traceFilters.selectFacet}
                />
              </span>
            )}
            {/* Handheld results pick their visualization from their own Visualize tab. */}
            {!isHandheld && (
              <span className="text-muted-foreground flex shrink-0 items-center gap-2 text-sm whitespace-nowrap">
                Visualize as
                <TopicsResultsViewSelect
                  value={resultsView}
                  onValueChange={setResultsView}
                />
              </span>
            )}
          </>
        );
        // A scan's question without topics shows where the scan stands, not the live-map empty state;
        // a no-topics result still has a completed map with no topics.
        const analysisFacet = shownFacets.find(
          (facet) => facet.facetId === headerFacetId,
        );
        const analysisState =
          analysisId &&
          analysisResults.data &&
          !analysisResults.error &&
          !analysisFacet?.map?.topics.length
            ? {
                status: analysisResults.data.execution.status,
                outcome: analysisFacet?.outcome,
              }
            : null;
        // Onboarding hides both picker placements.
        const mapPickerShown =
          !showOnboarding && Boolean(maps.data && mapSelection);
        const actions = prepareTopicsActions({
          automaticProcessing,
          canWrite,
          configureAvailable: modelSettings.configure.settings !== null,
          // Settings only edits models and idle time; setup starts from onboarding.
          onConfigure: openConfigure,
          onHistory: openHistory,
          onGiveFeedback: openFeedback,
          onEditRun:
            selectedRule && !showOnboarding
              ? () => openSliceDialog({ kind: "rule", rule: selectedRule })
              : undefined,
          refreshMap: (rule) => ({
            onSelect: () => openSliceDialog({ kind: "refresh", rule }),
            disabledReason: refreshMapDisabledReason({
              canWrite,
              state: automaticProcessing.state,
              rule,
              // Setup progress is only loaded for the selected map; another map without a fit is still building.
              setupActive:
                rule.id === setupRuleId
                  ? Boolean(setup?.active)
                  : !rule.lastRefitAt,
              now: Date.now(),
            }),
          }),
          onNewMap: () => openSliceDialog({ kind: "map" }),
          onNewSnapshot: () => openSliceDialog({ kind: "snapshot" }),
          mapDisabledReason: mapLimitReason,
          mapPickerShown,
          showUnassigned,
          onShowUnassignedChange: setShowUnassigned,
        });
        const mapPicker =
          maps.data && mapSelection && mapPickerShown ? (
            <TopicsMapPicker
              projectId={projectId}
              overview={maps.data}
              selection={mapSelection}
              facetId={selectedFacetId}
              onSelect={(selection) => {
                capture("topics:map_selected", {
                  mapKind: selection.kind,
                  mapCount,
                });
                selectMap(selection);
              }}
              usePreviewTopics={usePreviewTopics}
              usePickerCost={usePickerCost}
              processingOn={automaticProcessing.state.status === "on"}
              create={{
                map: actions.newMap,
                snapshot: actions.newSnapshot,
              }}
              refresh={actions.refreshMap}
            />
          ) : null;
        const now = Date.now();
        const mapShown = shownFacets.some((facet) => facet.map);
        const mapStatus =
          !showOnboarding && selectedRule
            ? topicRuleStatus(selectedRule, now, mapShown)
            : "";
        return (
          <Page
            headerProps={{
              title: "Topics",
              help: {
                description:
                  "Topics clusters your traces into named topics, so you can spot recurring patterns without reading every trace.",
                href: "https://langfuse.com/topics",
              },
              className: "@container/topics-header",
              mobileActionButtons: mapStatus ? (
                <span
                  title={mapStatus}
                  className="ph-no-capture text-muted-foreground block max-w-[50vw] truncate text-sm"
                >
                  {mapStatus}
                </span>
              ) : undefined,
              actionButtonsLeft: showOnboarding ? null : (
                <div className="flex items-center gap-3">
                  {mapPicker}
                  {!hasStrip && viewControls}
                  {!hasStrip && unassignedSwitch}
                </div>
              ),
              actionButtonsRight: <TopicsHeaderActions actions={actions} />,
              actionButtonsMenu: ({ closeMenu }) => (
                <TopicsActionsMenu actions={actions} closeMenu={closeMenu} />
              ),
            }}
          >
            <div className="ph-no-capture flex min-h-0 flex-1 flex-col overflow-hidden">
              {!showOnboarding && selectedRule && (
                <TopicMapStrip.Rule
                  rule={selectedRule}
                  now={now}
                  mapShown={mapShown}
                  controls={viewControls}
                  options={unassignedSwitch}
                />
              )}
              <div
                className={cn(
                  "flex min-h-0 flex-1 flex-col gap-2 overflow-hidden",
                  showOnboarding && "p-2",
                )}
              >
                {!showOnboarding && (mapPicker || headerFacetId) && (
                  <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 pt-2 md:hidden">
                    {mapPicker}
                    {headerFacetId && (
                      <TopicsMobileControls
                        facets={shownFacets}
                        selectedFacet={headerFacetId}
                        onSelectFacet={traceFilters.selectFacet}
                      />
                    )}
                  </div>
                )}
                {selectedAnalysis && (
                  <TopicMapStrip.Analysis
                    analysis={selectedAnalysis}
                    onViewRun={() => openExecution(selectedAnalysis.id)}
                    controls={viewControls}
                    options={unassignedSwitch}
                  />
                )}
                <TopicSetupNotice
                  notice={modelSettings.notice}
                  canWrite={canWrite}
                  canConfigure={modelSettings.configure.settings !== null}
                  onStart={openSetup}
                  startBlockedReason={setupBlockedReason}
                  onKeepOff={automaticProcessing.clearPause}
                  onTurnBackOn={turnAutomaticProcessingBackOn}
                  showOnboarding={landingShown}
                />
                {waitingForTraces ? (
                  <TopicSetupProgressView
                    waiting
                    stage="summarizing"
                    facets={[]}
                    retrying={false}
                    canRetry={false}
                  />
                ) : null}
                {showSetupProgress && setup && setupRuleId ? (
                  <TopicSetupProgressView
                    stage={setup.stage}
                    facets={setupFacets}
                    fits={setup.fits}
                    retrying={setupRetry.isPending}
                    canRetry
                    onRetry={() =>
                      setupRetry.mutate({ projectId, ruleId: setupRuleId })
                    }
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
                          costBreakdown={costFor(executionId)}
                          facets={facets.data ?? []}
                          canWrite={canWrite}
                          onBack={() => showExecutionList(true)}
                        />
                      ) : (
                        <TopicRunHistoryList
                          executions={historyRuns.map((run) => ({
                            ...run,
                            costBreakdown: costFor(run.id),
                          }))}
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
                    // Setup progress takes the space, so it stays centered.
                    showOnboarding || setupInline
                      ? "contents"
                      : "flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2 overflow-hidden"
                  }
                >
                  <TablePeekViewTraceDetail
                    {...peekNavigation}
                    itemType="TRACE"
                    projectId={projectId}
                    defaultWidthTarget={tracePanel}
                    // v2 drops widths saved before the peek matched the list, so it opens beside the map.
                    widthStorageKey="topicsPeekViewWidthFraction-v2"
                  />
                  {showBuilding && selectedRule ? (
                    <TopicRuleBuildingState
                      rule={selectedRule}
                      mapBuilt={awaitingSetupMap}
                    />
                  ) : null}
                  {analysisState &&
                  analysisId &&
                  analysisResults.data &&
                  busy(analysisState.status) ? (
                    <TopicSetupProgressView
                      variant="snapshot"
                      {...snapshotProgress(
                        analysisResults.data.execution,
                        facets.data ?? [],
                      )}
                      retrying={false}
                      canRetry={false}
                      onViewDetails={() => openExecution(analysisId)}
                    />
                  ) : null}
                  {analysisState &&
                  analysisId &&
                  !busy(analysisState.status) ? (
                    <TopicAnalysisState
                      status={analysisState.status}
                      outcome={analysisState.outcome}
                      traceCount={selectedAnalysis?.traceCount ?? 0}
                      onViewRun={() => openExecution(analysisId)}
                    />
                  ) : null}
                  {!showOnboarding &&
                    !showBuilding &&
                    !setupInline &&
                    !analysisState && (
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                        <CurrentTopics
                          projectId={projectId}
                          scope={scope}
                          result={shownResults}
                          selectedFacetId={selectedFacetId}
                          view={resultsView}
                          traceFilters={traceFilters}
                          tracePanelRef={setTracePanel}
                          showUnassigned={showUnassigned}
                          mapActions={actions}
                        />
                      </div>
                    )}
                  {facets.error && (
                    <TopicsErrorMessage message={facets.error.message} />
                  )}
                </div>
              </div>
            </div>
          </Page>
        );
      }}
    </TopicSliceDialogController>
  );
  return (
    <TopicsWorkspaceGate isLoading={facets.isLoading} fallback={loadingPage}>
      {workspace}
    </TopicsWorkspaceGate>
  );
}

/** Batch cost reads for visible runs and refresh active runs as they progress. */
function useVisibleRunCosts(
  projectId: string,
  runs: (TopicRunWithCost | TopicAnalysisMap)[],
) {
  const utils = api.useUtils();
  const queryClient = useQueryClient();
  const revisions = Object.fromEntries(
    runs.map((run) => [run.id, busy(run.status) ? null : run.updatedAt]),
  );
  const executionIds = Object.keys(revisions).sort();
  const summaryIds = new Set(
    runs
      .filter((run) =>
        "input" in run ? createsSummaries(run.input) : run.summarize,
      )
      .map((run) => run.id),
  );
  const input = {
    projectId,
    executionIds,
    includeSummaryCosts: summaryIds.size > 0,
  };
  const runKey = (id: string) =>
    ["topics-run-cost-breakdown", projectId, id, revisions[id]] as const;
  const { data, isError } = useQuery({
    queryKey: [
      ...getQueryKey(api.topics.executionCostBreakdown, input, "query"),
      revisions,
    ],
    queryFn: async ({ signal }) => {
      const estimates: Record<string, TopicRunCost | null> = {};
      const due: string[] = [];
      for (const id of executionIds) {
        const cached = queryClient.getQueryState<TopicRunCost | null>(
          runKey(id),
        );
        const maxAge =
          revisions[id] === null ? COST_POLL_INTERVAL_MS : COST_STALE_TIME_MS;
        if (
          cached?.data !== undefined &&
          Date.now() - cached.dataUpdatedAt < maxAge
        ) {
          estimates[id] = cached.data;
        } else {
          due.push(id);
        }
      }
      if (due.length) {
        const amounts = await utils.client.topics.executionCostBreakdown.query(
          {
            projectId,
            executionIds: due,
            includeSummaryCosts: due.some((id) => summaryIds.has(id)),
          },
          { signal },
        );
        signal.throwIfAborted();
        for (const id of due) {
          estimates[id] = amounts[id] ?? null;
          queryClient.setQueryData(runKey(id), estimates[id]);
        }
      }
      return { projectId, revisions, estimates };
    },
    enabled: executionIds.length > 0,
    placeholderData: keepPreviousData,
    staleTime: Object.values(revisions).includes(null)
      ? COST_POLL_INTERVAL_MS
      : COST_STALE_TIME_MS,
    refetchInterval: Object.values(revisions).includes(null)
      ? COST_POLL_INTERVAL_MS
      : false,
    meta: { silentAllErrors: true },
  });
  return (id: string) => {
    const cost = queryClient.getQueryData<TopicRunCost | null>(runKey(id));
    if (cost !== undefined) return cost;
    // The last visible batch can still be on screen after the individual cache entries expire.
    if (data?.projectId === projectId && data.revisions[id] === revisions[id])
      return data.estimates[id];
    return isError ? null : undefined;
  };
}

function ExecutionPanel({
  projectId,
  executionId,
  query,
  costBreakdown,
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
  costBreakdown: TopicRunCost | null | undefined;
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
  const execution = query.data;
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
      execution={{ ...execution, costBreakdown }}
      facets={facets}
      canWrite={canWrite}
      retry={{
        isPending: retry.isPending,
        errorMessage: retry.error?.message,
        onRetry: () => retry.mutate({ projectId, executionId }),
      }}
      onBack={onBack}
    />
  );
}

function topicsPageState(shown: {
  snapshot: boolean;
  setup: TopicSetupStage | null;
  waitingForTraces: boolean;
  landing: boolean;
  building: boolean;
}): TopicsPageState {
  if (shown.snapshot) return "snapshot";
  if (shown.setup === "failed") return "setup_failed";
  if (shown.setup) return "setup_running";
  if (shown.waitingForTraces) return "waiting_for_traces";
  if (shown.landing) return "landing";
  if (shown.building) return "building";
  return "results";
}

function startBlockedReason(running: boolean, automaticOn: boolean) {
  if (running)
    return "Snapshot is running. Topics appear here when it finishes.";
  if (automaticOn)
    return "Automatic processing is on. Topics appear here as traces are summarized.";
  return null;
}

/** A busy snapshot's stage and per-facet counts for the progress view. */
function snapshotProgress(
  execution: {
    phase: string;
    progress: {
      facetId: string;
      outcome: string;
      requested: number;
      complete: number;
    }[];
  },
  facets: { id: string; name: string }[],
) {
  // Clustering and naming read as one step, as in a map's setup.
  const stage: TopicSetupStage =
    execution.phase === "summarizing" ? "summarizing" : "grouping";
  return {
    stage,
    facets: execution.progress.map((facet) => ({
      key: facet.facetId,
      name:
        facets.find(({ id }) => id === facet.facetId)?.name ?? facet.facetId,
      complete: facet.complete,
      requested: facet.requested,
    })),
    fits: {
      done: execution.progress.filter((facet) => facet.outcome !== "pending")
        .length,
      total: execution.progress.length,
    },
  };
}

function setupBuiltMap(
  setup: RouterOutputs["topics"]["ruleSetupStatus"] | undefined,
) {
  return Boolean(
    setup?.facets.some((facet) => facet.runStatus === "completed"),
  );
}
