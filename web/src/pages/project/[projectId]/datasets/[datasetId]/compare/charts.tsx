import { Button } from "@/src/components/ui/button";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { FlaskConical, List } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { MarkdownJsonView } from "@/src/components/ui/MarkdownJsonView";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { CreateExperimentsForm } from "@/src/features/experiments/components/CreateExperimentsForm";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { DatasetAnalytics } from "@/src/features/datasets/components/DatasetAnalytics";
import { CompareViewAdapter } from "@/src/features/scores/adapters";
import {
  RESOURCE_METRICS,
  isEmptyChart,
} from "@/src/features/dashboard/lib/score-analytics-utils";
import { compareViewChartDataToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import {
  compactNumberFormatter,
  latencyFormatter,
  usdFormatter,
} from "@/src/utils/numbers";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import Page from "@/src/components/layouts/page";
import { SubHeaderLabel } from "@/src/components/layouts/header";
import {
  SidePanel,
  SidePanelContent,
  SidePanelHeader,
  SidePanelTitle,
} from "@/src/components/ui/side-panel";
import useLocalStorage from "@/src/components/useLocalStorage";
import { getScoreDataTypeIcon } from "@/src/features/scores/lib/scoreColumns";
import { useDatasetRunsCompare } from "@/src/features/datasets/hooks/useDatasetRunsCompare";
import { useDatasetRunCompareChartData } from "@/src/features/datasets/hooks/useDatasetRunCompareChartData";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  DATASET_RUN_COMPARE_TABS,
  getDatasetRunCompareTabs,
} from "@/src/features/navigation/utils/dataset-run-compare-tabs";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";

export default function DatasetCompare() {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;

  const [isCreateExperimentDialogOpen, setIsCreateExperimentDialogOpen] =
    useState(false);

  const [selectedMetrics, setSelectedMetrics] = useLocalStorage<string[]>(
    `${projectId}-dataset-compare-metrics`,
    RESOURCE_METRICS.map((metric) => metric.key),
  );

  const hasExperimentWriteAccess = useHasProjectAccess({
    projectId,
    scope: "promptExperiments:CUD",
  });

  const {
    runIds,
    runs,
    dataset,
    handleExperimentSettled: handleExperimentSettledBase,
    setRunState,
    setLocalRuns,
  } = useDatasetRunsCompare(projectId, datasetId);

  const { chartDataMap, scoreAnalyticsOptions, scoreKeyToData, isLoading } =
    useDatasetRunCompareChartData(projectId, datasetId, runIds);

  const handleExperimentSettled = async (data?: {
    success: boolean;
    datasetId: string;
    runId: string;
    runName: string;
  }) => {
    setIsCreateExperimentDialogOpen(false);
    await handleExperimentSettledBase(data);
  };

  return (
    <Page
      headerProps={{
        title: `Compare runs: ${dataset.data?.name ?? datasetId}`,
        tabsProps: {
          tabs: getDatasetRunCompareTabs(projectId, datasetId),
          activeTab: DATASET_RUN_COMPARE_TABS.CHARTS,
        },
        breadcrumb: [
          {
            name: "Datasets",
            href: `/project/${projectId}/datasets`,
          },
          {
            name: dataset.data?.name ?? datasetId,
            href: `/project/${projectId}/datasets/${datasetId}`,
          },
        ],
        help: {
          description: "Compare your dataset runs side by side",
        },
        actionButtonsRight: (
          <>
            <Dialog
              key="create-experiment-dialog"
              open={isCreateExperimentDialogOpen}
              onOpenChange={setIsCreateExperimentDialogOpen}
            >
              <DialogTrigger asChild disabled={!hasExperimentWriteAccess}>
                <Button
                  variant="outline"
                  disabled={!hasExperimentWriteAccess}
                  onClick={() => capture("dataset_run:new_form_open")}
                >
                  <FlaskConical className="h-4 w-4" />
                  <span className="ml-2 hidden md:block">New experiment</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <CreateExperimentsForm
                  key={`create-experiment-form-${datasetId}`}
                  projectId={projectId as string}
                  setFormOpen={setIsCreateExperimentDialogOpen}
                  defaultValues={{
                    datasetId,
                  }}
                  handleExperimentSettled={handleExperimentSettled}
                  showSDKRunInfoPage
                />
              </DialogContent>
            </Dialog>
            <MultiSelectKeyValues
              key="select-runs"
              title="Runs"
              showSelectedValueStrings={false}
              placeholder="Select runs to compare"
              className="w-fit"
              variant="outline"
              hideClearButton
              iconLeft={<List className="mr-2 h-4 w-4" />}
              options={runs.map((run) => ({
                key: run.key,
                value: run.value,
                disabled: runIds?.includes(run.key) && runIds.length === 1,
              }))}
              values={runs.filter((run) => runIds?.includes(run.key))}
              onValueChange={(values, changedValueId, selectedValueKeys) => {
                if (values.length === 0) return;
                if (changedValueId) {
                  if (selectedValueKeys?.has(changedValueId)) {
                    capture("dataset_run:compare_run_added");
                    setRunState({
                      runs: [...(runIds ?? []), changedValueId],
                    });
                    setLocalRuns([]);
                  } else {
                    capture("dataset_run:compare_run_removed");
                    setRunState({
                      runs: runIds?.filter((id) => id !== changedValueId) ?? [],
                    });
                    setLocalRuns([]);
                  }
                }
              }}
            />
          </>
        ),
      }}
    >
      <div className="grid flex-1 grid-cols-[1fr,auto] overflow-hidden">
        <div className="flex h-full flex-col gap-2 overflow-hidden px-3 py-2">
          <div className="flex w-full justify-end">
            <DatasetAnalytics
              key="dataset-analytics"
              projectId={projectId}
              scoreOptions={scoreAnalyticsOptions}
              selectedMetrics={selectedMetrics}
              setSelectedMetrics={setSelectedMetrics}
            />
          </div>
          <div className="overflow-y-auto">
            {Boolean(selectedMetrics.length) && Boolean(chartDataMap?.size) ? (
              <div className="grid w-full grid-cols-2 gap-4 xl:grid-cols-3">
                {selectedMetrics.map((key) => {
                  if (isLoading) {
                    return <Skeleton key={key} className="h-52 w-full" />;
                  }

                  const adapter = new CompareViewAdapter(chartDataMap, key);
                  const { chartData, chartLabels } = adapter.toChartData();

                  const scoreData = scoreKeyToData.get(key);
                  const title = scoreData
                    ? `${getScoreDataTypeIcon(scoreData.dataType)} ${scoreData.name} (${scoreData.source.toLowerCase()})`
                    : (RESOURCE_METRICS.find((metric) => metric.key === key)
                        ?.label ?? key);

                  const valueFormatter =
                    key === "latency"
                      ? latencyFormatter
                      : key === "cost"
                        ? usdFormatter
                        : (v: number) =>
                            compactNumberFormatter(
                              v,
                              RESOURCE_METRICS.find((m) => m.key === key)
                                ?.maxFractionDigits,
                            );

                  if (isEmptyChart({ data: chartData })) {
                    return (
                      <div
                        key={key}
                        className="flex min-h-[200px] min-w-0 max-w-full flex-col gap-2"
                      >
                        <span className="shrink-0 text-sm font-medium">
                          {title}
                        </span>
                        <NoDataOrLoading
                          isLoading={false}
                          className="min-h-32 flex-1"
                        />
                      </div>
                    );
                  }

                  const dataPoints =
                    chartLabels.length === 1
                      ? chartData.map((d) => ({
                          time_dimension: d.binLabel,
                          dimension: chartLabels[0]!,
                          metric: (d[chartLabels[0]!] as number) ?? 0,
                        }))
                      : compareViewChartDataToDataPoints(
                          chartData,
                          chartLabels,
                        );
                  const chartType =
                    chartLabels.length === 1
                      ? "LINE_TIME_SERIES"
                      : "BAR_TIME_SERIES";

                  return (
                    <div
                      key={key}
                      className="flex min-h-[200px] min-w-0 max-w-full flex-col gap-2"
                    >
                      <span className="shrink-0 text-sm font-medium">
                        {title}
                      </span>
                      <div className="min-h-[200px] min-w-0 flex-1">
                        <Chart
                          chartType={chartType}
                          data={dataPoints}
                          rowLimit={Math.max(dataPoints.length, 1)}
                          chartConfig={{ type: chartType }}
                          valueFormatter={valueFormatter}
                          legendPosition={
                            chartLabels.length > 1 ? "above" : "none"
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <span className="-mt-2 text-sm text-muted-foreground">
                {Boolean(chartDataMap?.size)
                  ? "All charts hidden. Enable them in the Charts dropdown."
                  : "Select more than one run to generate charts."}
              </span>
            )}
          </div>
        </div>
        <SidePanel
          mobileTitle={dataset.data?.name ?? datasetId}
          id="compare-dataset-runs"
          scrollable={false}
        >
          <SidePanelHeader>
            <SidePanelTitle>{dataset.data?.name}</SidePanelTitle>
          </SidePanelHeader>
          <SidePanelContent className="overflow-y-auto p-1">
            <div className="w-full space-y-4">
              <div>
                <SubHeaderLabel title="Description" />
                <span className="text-sm text-muted-foreground">
                  {dataset.data?.description ?? "No description"}
                </span>
              </div>
              {dataset.data?.metadata && (
                <div>
                  <SubHeaderLabel title="Metadata" />
                  <MarkdownJsonView content={dataset.data?.metadata} />
                </div>
              )}
            </div>
          </SidePanelContent>
        </SidePanel>
      </div>
    </Page>
  );
}
