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
import { Button } from "@/src/components/ui/button";
import { X, Loader2 } from "lucide-react";
import { useExperimentAccess } from "@/src/features/experiments/hooks/useExperimentAccess";
import { ExperimentsBetaSwitch } from "@/src/features/experiments/components/ExperimentsBetaSwitch";
import {
  EXPERIMENT_RUN_TABS,
  getExperimentRunTabs,
} from "@/src/features/navigation/utils/experiment-run-tabs";

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
  } = useExperimentResultsState();

  const [isOverviewOpen, setIsOverviewOpen] = useSessionStorage(
    "overview-panel-experiment-detail",
    true,
  );

  const [, setLastResultsUrl] = useSessionStorage<string | null>(
    "experiment-results-url",
    `/project/${projectId}/datasets`,
  );

  // Store current URL for back navigation from analytics
  useEffect(() => {
    setLastResultsUrl(window.location.pathname + window.location.search);
  }, [setLastResultsUrl]);

  const {
    canUseExperimentsBetaToggle,
    isExperimentsBetaEnabled,
    setExperimentsBetaEnabled,
    isExperimentsBetaActive,
  } = useExperimentAccess();

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

  // Auto-redirect to datasets page when beta is off
  useEffect(() => {
    if (!isExperimentsBetaActive) {
      void router.push(`/project/${projectId}/datasets`);
    }
  }, [isExperimentsBetaActive, projectId, router]);

  // Show spinner while redirecting when beta is off
  if (!isExperimentsBetaActive) {
    return (
      <Page headerProps={{ title: "Experiments" }}>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      </Page>
    );
  }

  const handleBetaSwitchChange = (enabled: boolean) => {
    setExperimentsBetaEnabled(enabled);

    // When switching OFF, redirect to datasets page
    if (!enabled) {
      void router.push(`/project/${projectId}/datasets`);
    }
  };

  return (
    <Page
      headerProps={{
        title: hasBaseline
          ? (experiment?.name ?? baselineId ?? "Results")
          : "Results",
        itemType: "EXPERIMENT",
        breadcrumb: [
          { name: "Experiments", href: `/project/${projectId}/experiments` },
        ],
        tabsProps: {
          tabs: getExperimentRunTabs(projectId),
          activeTab: EXPERIMENT_RUN_TABS.RESULTS,
        },
        actionButtonsLeft: canUseExperimentsBetaToggle ? (
          <ExperimentsBetaSwitch
            enabled={isExperimentsBetaEnabled}
            onEnabledChange={handleBetaSwitchChange}
          />
        ) : undefined,
        actionButtonsRight: (
          <>
            {hasBaseline && comparisonIds.length > 0 && (
              <Button variant="outline" onClick={clearBaseline}>
                <X className="h-4 w-4" />
                <span className="ml-2 hidden md:inline">Clear baseline</span>
              </Button>
            )}

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
            projectId={projectId}
            hasBaseline={hasBaseline}
            experiment={experiment ?? undefined}
            comparisonIds={comparisonIds}
            onComparisonIdsChange={setComparisonIds}
            onBaselineChange={setBaseline}
            onBaselineClear={clearBaseline}
          />
        }
        defaultMainSize={75}
        defaultSidebarSize={25}
        minMainSize={50}
        maxSidebarSize={40}
      />
    </Page>
  );
}
