import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { ExperimentItemsTable } from "@/src/features/experiments/components/table";
import { ExperimentOverviewPanel } from "@/src/features/experiments/components/ExperimentOverviewPanel";
import {
  OverviewPanelLayout,
  OverviewPanelToggle,
} from "@/src/components/layouts/overview-panel";
import useSessionStorage from "@/src/components/useSessionStorage";
import { useExperimentResultsState } from "@/src/features/experiments/hooks/useExperimentResultsState";
import { useEffect } from "react";
import { ExperimentDisplaySettings } from "@/src/features/experiments/components/ExperimentDisplaySettings";
import { useExperimentAccess } from "@/src/features/experiments/hooks/useExperimentAccess";
import {
  EXPERIMENT_RUN_TABS,
  getExperimentRunTabs,
} from "@/src/features/navigation/utils/experiment-run-tabs";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { ExperimentSelectionControls } from "@/src/features/experiments/components/ExperimentSelectionControls";

export default function ExperimentResults() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const {
    baselineId,
    hasBaseline,
    setBaseline,
    clearBaseline,
    comparisonIds,
    setComparisonIds,
    layout,
    setLayout,
    itemVisibility,
    setItemVisibility,
    allExperimentIds,
  } = useExperimentResultsState();

  const [isOverviewOpen, setIsOverviewOpen] = useSessionStorage(
    "overview-panel-experiment-detail",
    false,
  );

  const [, setLastResultsUrl] = useSessionStorage<string | null>(
    "experiment-results-url",
    `/project/${projectId}/datasets`,
  );

  // Store current URL for back navigation from analytics
  useEffect(() => {
    setLastResultsUrl(window.location.pathname + window.location.search);
  }, [setLastResultsUrl]);

  const { isExperimentsBetaActive, isInitializing } = useExperimentAccess();

  useEffect(() => {
    if (isInitializing || isExperimentsBetaActive || !projectId) return;

    router.replace(`/project/${projectId}/datasets`);
  }, [isExperimentsBetaActive, isInitializing, projectId, router]);

  useEffect(() => {
    if (
      !router.isReady ||
      isInitializing ||
      !isExperimentsBetaActive ||
      !projectId ||
      allExperimentIds.length > 0
    ) {
      return;
    }

    // A bare Results URL has no meaningful content. Return to the experiment
    // list instead of leaving users on an empty comparison screen.
    router.replace(`/project/${projectId}/experiments`);
  }, [
    allExperimentIds.length,
    isExperimentsBetaActive,
    isInitializing,
    projectId,
    router,
  ]);

  // Fetch experiment to get dataset ID and other details
  const { data: experiment } = api.experiments.byId.useQuery(
    {
      projectId,
      experimentId: baselineId ?? "",
    },
    {
      enabled: Boolean(projectId && baselineId) && isExperimentsBetaActive,
    },
  );

  // Show spinner while session loads or while redirecting when beta is off
  if (!isExperimentsBetaActive || allExperimentIds.length === 0) {
    return (
      <Page headerProps={{ title: "Experiments" }}>
        <div className="flex h-full items-center justify-center">
          <Spinner size="xl" variant="muted" />
        </div>
      </Page>
    );
  }

  return (
    <Page
      headerProps={{
        title: "Results",
        itemType: "EXPERIMENT",
        breadcrumb: [
          { name: "Experiments", href: `/project/${projectId}/experiments` },
        ],
        tabsProps: {
          tabs: getExperimentRunTabs(projectId),
          activeTab: EXPERIMENT_RUN_TABS.RESULTS,
        },
        actionButtonsLeft: (
          <ExperimentSelectionControls
            projectId={projectId}
            baselineId={baselineId}
            baselineName={experiment?.name}
            comparisonIds={comparisonIds}
            onBaselineChange={setBaseline}
            onBaselineClear={clearBaseline}
            onComparisonIdsChange={setComparisonIds}
          />
        ),
        actionButtonsRight: (
          <>
            <ExperimentDisplaySettings
              layout={layout}
              onLayoutChange={setLayout}
              itemVisibility={itemVisibility}
              onItemVisibilityChange={setItemVisibility}
              hasComparisons={comparisonIds.length > 0}
              hasBaseline={hasBaseline}
            />

            <OverviewPanelToggle
              open={isOverviewOpen}
              onOpenChange={setIsOverviewOpen}
            />
          </>
        ),
      }}
    >
      <OverviewPanelLayout
        open={isOverviewOpen}
        persistId={`experiment-detail-${baselineId ?? "none"}`}
        mainContent={<ExperimentItemsTable projectId={projectId} />}
        overviewContent={
          <ExperimentOverviewPanel
            key={baselineId ?? "no-baseline"}
            projectId={projectId}
            experiment={experiment ?? undefined}
          />
        }
        defaultPrimarySize={75}
        defaultSecondarySize={25}
        minPrimarySize={50}
        maxSecondarySize={40}
      />
    </Page>
  );
}
