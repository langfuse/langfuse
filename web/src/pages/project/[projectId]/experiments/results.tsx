import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { DeleteDatasetRunButton } from "@/src/features/datasets/components/DeleteDatasetRunButton";
import { ExperimentItemsTable } from "@/src/features/experiments/components/table";
import { ExperimentOverviewPanel } from "@/src/features/experiments/components/ExperimentOverviewPanel";
import {
  OverviewPanelLayout,
  OverviewPanelToggle,
} from "@/src/components/layouts/overview-panel";
import useSessionStorage from "@/src/components/useSessionStorage";
import { useExperimentResultsState } from "@/src/features/experiments/hooks/useExperimentResultsState";

export default function ExperimentResults() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  // URL state for experiment results
  const {
    baselineId,
    setBaseline,
    clearBaseline,
    comparisonIds,
    setComparisonIds,
  } = useExperimentResultsState();

  const [isOverviewOpen, setIsOverviewOpen] = useSessionStorage(
    "overview-panel-experiment-detail",
    true,
  );

  const [comparisonSearchQuery, setComparisonSearchQuery] = useState("");

  // Redirect to experiments list if no baseline is provided
  const isLoading = !router.isReady;
  useEffect(() => {
    if (!baselineId && !isLoading) {
      void router.push(`/project/${projectId}/experiments`);
    }
  }, [baselineId, projectId, router, isLoading]);

  // TODO: Replace with actual query - api.experiments.byDatasetId.useQuery(...)
  // Mock data for testing the comparison selector UI
  const mockExperiments = [
    {
      id: "demo-dataset-run-1-demo-countries-dataset-950dc53a",
      name: "demo-dataset-run-1-demo-countries-dataset",
    },
    {
      id: "demo-dataset-run-0-demo-countries-dataset-950dc53a",
      name: "demo-dataset-run-0-demo-countries-dataset",
    },
    { id: "exp-003", name: "Claude-3 Sonnet Test" },
    { id: "exp-004", name: "Claude-3 Opus Test" },
    { id: "exp-005", name: "Gemini Pro Evaluation" },
    { id: "exp-006", name: "Llama-2 70B Benchmark" },
    { id: "exp-007", name: "Mistral Large Test" },
    { id: "exp-008", name: "Temperature 0.7 Run" },
    { id: "exp-009", name: "Temperature 1.0 Run" },
    { id: "exp-010", name: "Few-shot Prompting Test" },
  ];

  // Filter mock experiments by search query (simulating API search)
  const availableExperiments = mockExperiments.filter(
    (exp) =>
      !comparisonSearchQuery ||
      exp.name.toLowerCase().includes(comparisonSearchQuery.toLowerCase()),
  );
  const isLoadingExperiments = false;

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

  // Build the list of available experiments for filter targeting
  // This includes the baseline (current experiment) + any comparison experiments
  const availableExperimentsForTable = useMemo(() => {
    const result: { id: string; name: string }[] = [];

    // Add baseline experiment
    if (experiment) {
      result.push({
        id: experiment.id,
        name: experiment.name,
      });
    }

    // Add comparison experiments from the available list
    // (matched by IDs in comparisonIds)
    for (const compId of comparisonIds) {
      const compExp = availableExperiments.find((exp) => exp.id === compId);
      if (compExp) {
        result.push(compExp);
      } else {
        // If not found in available list, create a placeholder with ID as name
        result.push({ id: compId, name: compId });
      }
    }

    return result;
  }, [experiment, comparisonIds, availableExperiments]);

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
            <OverviewPanelToggle
              open={isOverviewOpen}
              onOpenChange={setIsOverviewOpen}
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem asChild>
                  <DeleteDatasetRunButton
                    projectId={projectId}
                    datasetRunId={baselineId}
                    datasetId={experiment.datasetId}
                    redirectUrl={`/project/${projectId}/datasets/${experiment.datasetId}`}
                  />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
              availableExperiments={availableExperimentsForTable}
            />
          }
          overviewContent={
            <ExperimentOverviewPanel
              projectId={projectId}
              experiment={experiment}
              comparisonIds={comparisonIds}
              onComparisonIdsChange={setComparisonIds}
              comparisonSearchQuery={comparisonSearchQuery}
              onComparisonSearchQueryChange={setComparisonSearchQuery}
              availableExperiments={availableExperiments}
              isLoadingExperiments={isLoadingExperiments}
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
