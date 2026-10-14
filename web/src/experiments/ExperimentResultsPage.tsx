import { useRouter } from "next/router";
import Page from "@/src/app/shell/layouts/page";
import { api } from "@/src/app/utils/api";
import { ExperimentItemsTable } from "@/src/experiments/components/table";
import { ExperimentOverviewPanel } from "@/src/experiments/components/ExperimentOverviewPanel";
import {
  OverviewPanelLayout,
  OverviewPanelToggle,
} from "@/src/app/shell/layouts/overview-panel";
import useSessionStorage from "@/src/app/components/useSessionStorage";
import { useCallback, useEffect } from "react";
import { ExperimentDisplaySettings } from "@/src/experiments/components/ExperimentDisplaySettings";
import { useExperimentAccess } from "@/src/experiments/hooks/useExperimentAccess";
import { Spinner } from "@/src/app/design-system/Spinner/Spinner";
import { ExperimentSelectionControls } from "@/src/experiments/components/ExperimentSelectionControls";
import { useIoRenderModeLocalStorage } from "@/src/app/tables/common-components/data-table-io-render-mode-switch";
import { usePostHogClientCapture } from "@/src/analytics/internal/posthog";
import {
  diffModeChangedProps,
  layoutChangedProps,
} from "@/src/experiments/lib/analytics";
import {
  useExperimentResultsState,
  type ExperimentDiffMode,
  type ExperimentResultsLayout,
} from "@/src/experiments/hooks/useExperimentResultsState";

export default function ExperimentResultsPage() {
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
    diffMode,
    setDiffMode,
    itemVisibility,
    setItemVisibility,
    allExperimentIds,
    colorExperimentIds,
  } = useExperimentResultsState();
  const [ioRenderMode, setIoRenderMode] = useIoRenderModeLocalStorage(
    "experiment-items",
    "json",
  );

  const [isOverviewOpen, setIsOverviewOpen] = useSessionStorage(
    "overview-panel-experiment-detail",
    false,
  );

  const capture = usePostHogClientCapture();

  // Is the new score-matrix layout adopted, and diff mode — Expected → Output
  // in particular — used at all? Captured on the menu pick rather than on the
  // URL state, which also changes on navigation, on a restored view, and (for
  // the layout) as a side effect of choosing Expected → Output.
  const handleLayoutChange = useCallback(
    (newLayout: ExperimentResultsLayout) => {
      if (newLayout !== layout) {
        capture(
          "experiment:layout_changed",
          layoutChangedProps({
            tableName: "experiment-items",
            layout: newLayout,
            comparisonCount: comparisonIds.length,
          }),
        );
      }
      setLayout(newLayout);
    },
    [capture, layout, comparisonIds.length, setLayout],
  );

  const handleDiffModeChange = useCallback(
    (newDiffMode: ExperimentDiffMode) => {
      if (newDiffMode !== diffMode) {
        capture(
          "experiment:diff_mode_changed",
          diffModeChangedProps({
            tableName: "experiment-items",
            mode: newDiffMode,
            comparisonCount: comparisonIds.length,
          }),
        );
      }
      setDiffMode(newDiffMode);
    },
    [capture, diffMode, comparisonIds.length, setDiffMode],
  );

  const { isExperimentsBetaActive, isInitializing } = useExperimentAccess();

  useEffect(() => {
    if (isInitializing || isExperimentsBetaActive || !projectId) return;

    router.replace(`/project/${projectId}/datasets`);
  }, [isExperimentsBetaActive, isInitializing, projectId, router]);

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
  if (!isExperimentsBetaActive) {
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
        title: "",
        itemType: "EXPERIMENT",
        breadcrumb: [
          { name: "Experiments", href: `/project/${projectId}/experiments` },
        ],
        actionButtonsLeft: (
          <ExperimentSelectionControls
            projectId={projectId}
            baselineId={baselineId}
            baselineName={experiment?.name}
            comparisonIds={comparisonIds}
            colorExperimentIds={colorExperimentIds}
            selectedExperimentCount={allExperimentIds.length}
            onBaselineChange={setBaseline}
            onBaselineClear={clearBaseline}
            onComparisonIdsChange={setComparisonIds}
          />
        ),
        actionButtonsRight: (
          <OverviewPanelToggle
            open={isOverviewOpen}
            onOpenChange={setIsOverviewOpen}
          />
        ),
      }}
    >
      <OverviewPanelLayout
        open={isOverviewOpen}
        persistId={`experiment-detail-${baselineId ?? "none"}`}
        mainContent={
          <ExperimentItemsTable
            // The shared table body's memo comparator does not look at the
            // column definitions, so a format change alone never reaches the
            // cells. Remounting is what makes the switch take effect.
            key={ioRenderMode}
            projectId={projectId}
            ioRenderMode={ioRenderMode}
            toolbarSettings={
              <ExperimentDisplaySettings
                layout={layout}
                onLayoutChange={handleLayoutChange}
                diffMode={diffMode}
                onDiffModeChange={handleDiffModeChange}
                itemVisibility={itemVisibility}
                onItemVisibilityChange={setItemVisibility}
                hasComparisons={comparisonIds.length > 0}
                hasBaseline={hasBaseline}
                ioRenderMode={ioRenderMode}
                onIoRenderModeChange={setIoRenderMode}
              />
            }
          />
        }
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
