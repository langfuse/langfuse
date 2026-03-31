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
import { Button } from "@/src/components/ui/button";
import { X } from "lucide-react";
import useIsExperimentV4Enabled from "@/src/features/feature-flags/hooks/useIsExperimentV4Enabled";

export default function ExperimentResults() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const { isEnabled } = useIsExperimentV4Enabled();

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

  // Fetch experiment to get dataset ID and other details
  const { data: experiment } = api.experiments.byId.useQuery(
    {
      projectId,
      experimentId: baselineId ?? "",
    },
    {
      enabled: Boolean(projectId && baselineId) && isEnabled,
    },
  );

  if (!isEnabled) {
    return (
      <Page headerProps={{ title: "Experiments" }}>
        <div className="p-4">Experiments Pages coming soon.</div>
      </Page>
    );
  }

  return (
    <Page
      headerProps={{
        title: hasBaseline
          ? (experiment?.name ?? baselineId ?? "Experiment Results")
          : "Experiment Results",
        itemType: "EXPERIMENT",
        breadcrumb: [
          { name: "Experiments", href: `/project/${projectId}/experiments` },
        ],
        help: {
          description:
            "View and analyze experiment items with traces, scores, and metrics.",
          href: "https://langfuse.com/docs/datasets/experiments",
        },
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
