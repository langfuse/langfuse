import { Button } from "@/src/components/ui/button";
import { DatasetCompareRunsTable } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { api } from "@/src/utils/api";
import { FlaskConical, List } from "lucide-react";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import { useQueryParams, withDefault, ArrayParam } from "use-query-params";
import { MarkdownJsonView } from "@/src/components/ui/MarkdownJsonView";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { CreateExperimentsForm } from "@/src/features/experiments/components/CreateExperimentsForm";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { DatasetAnalytics } from "@/src/features/datasets/components/DatasetAnalytics";
import { getScoreDataTypeIcon } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { TimeseriesChart } from "@/src/features/scores/components/TimeseriesChart";
import {
  isNumericDataType,
  toOrderedScoresList,
} from "@/src/features/scores/lib/helpers";
import { CompareViewAdapter } from "@/src/features/scores/adapters";
import {
  RESOURCE_METRICS,
  transformAggregatedRunMetricsToChartData,
} from "@/src/features/dashboard/lib/score-analytics-utils";
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

export default function DatasetCompare() {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const [runState, setRunState] = useQueryParams({
    runs: withDefault(ArrayParam, []),
  });

  const [isCreateExperimentDialogOpen, setIsCreateExperimentDialogOpen] =
    useState(false);
  const [localRuns, setLocalRuns] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const [selectedMetrics, setSelectedMetrics] = useLocalStorage<string[]>(
    `${projectId}-dataset-compare-metrics`,
    RESOURCE_METRICS.map((metric) => metric.key),
  );
  const runIds = runState.runs as undefined | string[];

  const hasExperimentWriteAccess = useHasProjectAccess({
    projectId,
    scope: "promptExperiments:CUD",
  });

  const dataset = api.datasets.byId.useQuery({
    datasetId,
    projectId,
  });

  const runsData = api.datasets.baseRunDataByDatasetId.useQuery(
    {
      projectId,
      datasetId,
    },
    {
      enabled: !!dataset.data,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  );
  const utils = api.useUtils();

  const runMetrics = api.datasets.runsByDatasetIdMetrics.useQuery(
    {
      projectId,
      datasetId,
      runIds: runIds,
    },
    {
      enabled: runIds && runIds.length > 1,
    },
  );

  // LFE-3236: refactor to filter query to only include scores for runs in runIds
  const scoreKeysAndProps = api.scores.getScoreKeysAndProps.useQuery(
    {
      projectId: projectId,
      selectedTimeOption: { option: "All time", filterSource: "TABLE" },
    },
    {
      enabled: runIds && runIds.length > 1,
    },
  );

  const scoreIdToName = useMemo(() => {
    return new Map(
      scoreKeysAndProps.data?.map((obj) => [obj.key, obj.name]) ?? [],
    );
  }, [scoreKeysAndProps.data]);

  const runAggregatedMetrics = useMemo(() => {
    return transformAggregatedRunMetricsToChartData(
      runMetrics.data?.runs.filter((run) => runIds?.includes(run.id)) ?? [],
      scoreIdToName,
    );
  }, [runMetrics.data, runIds, scoreIdToName]);

  const { scoreAnalyticsOptions, scoreKeyToData } = useMemo(() => {
    const scoreAnalyticsOptions = scoreKeysAndProps.data
      ? toOrderedScoresList(scoreKeysAndProps.data).map(
          ({ key, name, dataType, source }) => ({
            key,
            value: `${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`,
          }),
        )
      : [];

    return {
      scoreAnalyticsOptions,
      scoreKeyToData: new Map(
        scoreKeysAndProps.data?.map((obj) => [obj.key, obj]) ?? [],
      ),
    };
  }, [scoreKeysAndProps.data]);

  const handleExperimentSettled = async (data?: {
    success: boolean;
    datasetId: string;
    runId: string;
    runName: string;
  }) => {
    setIsCreateExperimentDialogOpen(false);
    if (!data) return;
    void utils.datasets.baseRunDataByDatasetId.invalidate();
    setLocalRuns((prev) => [...prev, { key: data.runId, value: data.runName }]);
    setRunState({
      runs: [...(runIds ?? []), data.runId],
    });
  };

  const runs = useMemo(() => {
    const apiRuns =
      runsData.data?.map((run) => ({
        key: run.id,
        value: run.name,
      })) ?? [];

    return [...apiRuns, ...localRuns];
  }, [runsData.data, localRuns]);

  if (!runsData.data || !router.isReady || runs.length === 0) {
    return <span>Loading...</span>;
  }

  return (
    <Page
      headerProps={{
        title: `Compare runs: ${dataset.data?.name ?? datasetId}`,
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
        <div className="flex h-full flex-col overflow-hidden">
          <DatasetCompareRunsTable
            key={runIds?.join(",") ?? "empty"}
            projectId={projectId}
            datasetId={datasetId}
            runsData={runsData.data}
            runIds={runIds ?? []}
            localExperiments={localRuns}
          />
        </div>
        <SidePanel
          mobileTitle="Compare Experiments"
          id="compare-experiments"
          scrollable={false}
        >
          <SidePanelHeader>
            <SidePanelTitle>Compare Experiments</SidePanelTitle>
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

            <>
              <DatasetAnalytics
                key="dataset-analytics"
                projectId={projectId}
                scoreOptions={scoreAnalyticsOptions}
                selectedMetrics={selectedMetrics}
                setSelectedMetrics={setSelectedMetrics}
              />

              {Boolean(selectedMetrics.length) &&
              Boolean(runAggregatedMetrics?.size) ? (
                <div className="grid w-full grid-cols-1 gap-4">
                  {selectedMetrics.map((key) => {
                    const adapter = new CompareViewAdapter(
                      runAggregatedMetrics,
                      key,
                    );
                    const { chartData, chartLabels } = adapter.toChartData();

                    const scoreData = scoreKeyToData.get(key);
                    if (!scoreData)
                      return (
                        <div
                          key={key}
                          className="max-h-52 min-h-0 min-w-0 max-w-full"
                        >
                          <TimeseriesChart
                            key={key}
                            chartData={chartData}
                            chartLabels={chartLabels}
                            title={
                              RESOURCE_METRICS.find(
                                (metric) => metric.key === key,
                              )?.label ?? key
                            }
                            type="numeric"
                            maxFractionDigits={
                              RESOURCE_METRICS.find(
                                (metric) => metric.key === key,
                              )?.maxFractionDigits
                            }
                          />
                        </div>
                      );

                    return (
                      <div
                        key={key}
                        className="max-h-52 min-h-0 min-w-0 max-w-full"
                      >
                        <TimeseriesChart
                          key={key}
                          chartData={chartData}
                          chartLabels={chartLabels}
                          title={`${getScoreDataTypeIcon(scoreData.dataType)} ${scoreData.name} (${scoreData.source.toLowerCase()})`}
                          type={
                            isNumericDataType(scoreData.dataType)
                              ? "numeric"
                              : "categorical"
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <span className="-mt-2 text-sm text-muted-foreground">
                  {Boolean(runAggregatedMetrics?.size)
                    ? "All charts hidden. Enable them in settings."
                    : "Select more than one run to generate charts."}
                </span>
              )}
            </>
          </SidePanelContent>
        </SidePanel>
      </div>
    </Page>
  );
}
