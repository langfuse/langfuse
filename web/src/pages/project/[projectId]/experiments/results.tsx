import { useState, useMemo, useEffect } from "react";
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
import { ExperimentDisplaySettings } from "@/src/features/experiments/components/ExperimentDisplaySettings";

export default function ExperimentResults() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const {
    baselineId,
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

  // Fetch experiment to get dataset ID and other details
  const { data: experiment } = api.experiments.byId.useQuery(
    {
      projectId,
      experimentId: baselineId ?? "",
    },
    {
      enabled: Boolean(projectId && baselineId),
    },
  );

  // Show loading state while redirecting
  if (!baselineId) {
    return (
      <Page
        headerProps={{
          title: "Experiment Results",
          itemType: "EXPERIMENT",
        }}
      >
        <div className="p-4">Loading...</div>
      </Page>
    );
  }

  return (
    <Page
      headerProps={{
        title: experiment?.name ?? baselineId,
        itemType: "EXPERIMENT",
        breadcrumb: [
          { name: "Experiments", href: `/project/${projectId}/experiments` },
        ],
        help: {
          description:
            "View and analyze experiment items with traces, scores, and metrics.",
          href: "https://langfuse.com/docs/datasets/experiments",
        },
        actionButtonsRight: experiment?.datasetId ? (
          <>
            <ExperimentDisplaySettings
              layout={layout}
              onLayoutChange={setLayout}
              itemVisibility={itemVisibility}
              onItemVisibilityChange={setItemVisibility}
              hasComparisons={comparisonIds.length > 0}
            />

            <OverviewPanelToggle
              open={isOverviewOpen}
              onOpenChange={setIsOverviewOpen}
            />
          </>
        ) : undefined,
      }}
    >
      {experiment?.datasetId ? (
        <OverviewPanelLayout
          open={isOverviewOpen}
          persistId={`experiment-detail-${baselineId}`}
          mainContent={
            <ExperimentItemsTable
              projectId={projectId}
              experimentId={baselineId}
              datasetId={experiment.datasetId}
            />
          }
          overviewContent={
            <ExperimentOverviewPanel
              projectId={projectId}
              experiment={experiment}
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
      ) : (
        <div className="p-4">Loading experiment...</div>
      )}
    </Page>
  );
}
