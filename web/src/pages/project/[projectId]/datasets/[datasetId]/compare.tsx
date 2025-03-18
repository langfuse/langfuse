import { Button } from "@/src/components/ui/button";
import { DatasetCompareRunsTable } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { api } from "@/src/utils/api";
import { FlaskConical, FolderKanban } from "lucide-react";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import { useQueryParams, withDefault, ArrayParam } from "use-query-params";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/src/components/ui/popover";
import { MarkdownJsonView } from "@/src/components/ui/MarkdownJsonView";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { CreateExperimentsForm } from "@/src/ee/features/experiments/components/CreateExperimentsForm";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { DatasetAnalytics } from "@/src/features/datasets/components/DatasetAnalytics";
import { Card, CardContent } from "@/src/components/ui/card";
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
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(
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
        actionButtonsRight: [
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
          </Dialog>,
          <Popover key="show-dataset-details">
            <PopoverTrigger asChild>
              <Button variant="outline">
                <FolderKanban className="mr-2 h-4 w-4" />
                <span className="hidden md:block">Dataset details</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="mx-2 max-h-[50vh] w-[50vw] overflow-y-auto md:w-[25vw]">
              <div className="space-y-4">
                <div>
                  <h4 className="mb-1 font-medium">Description</h4>
                  <span className="text-sm text-muted-foreground">
                    {dataset.data?.description ?? "No description"}
                  </span>
                </div>
                <div>
                  <h4 className="mb-1 font-medium">Metadata</h4>
                  <MarkdownJsonView content={dataset.data?.metadata ?? null} />
                </div>
              </div>
            </PopoverContent>
          </Popover>,
          runIds && runIds.length > 1 ? (
            <DatasetAnalytics
              key="dataset-analytics"
              projectId={projectId}
              scoreOptions={scoreAnalyticsOptions}
              selectedMetrics={selectedMetrics}
              setSelectedMetrics={setSelectedMetrics}
            />
          ) : null,
          <MultiSelectKeyValues
            key="select-runs"
            title="Select runs"
            placeholder="Select runs to compare"
            className="w-fit"
            variant="outline"
            hideClearButton
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
          />,
        ],
      }}
    >
      {Boolean(selectedMetrics.length) &&
        Boolean(runAggregatedMetrics?.size) && (
          <Card className="my-4 max-h-64">
            <CardContent className="mt-2 h-full">
              <div className="flex h-full w-full gap-4 overflow-x-auto">
                {selectedMetrics.map((key) => {
                  const adapter = new CompareViewAdapter(
                    runAggregatedMetrics,
                    key,
                  );
                  const { chartData, chartLabels } = adapter.toChartData();

                  const scoreData = scoreKeyToData.get(key);
                  if (!scoreData)
                    return (
                      <TimeseriesChart
                        key={key}
                        chartData={chartData}
                        chartLabels={chartLabels}
                        title={
                          RESOURCE_METRICS.find((metric) => metric.key === key)
                            ?.label ?? key
                        }
                        type="numeric"
                      />
                    );

                  return (
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
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

      <DatasetCompareRunsTable
        key={runIds?.join(",") ?? "empty"}
        projectId={projectId}
        datasetId={datasetId}
        runsData={runsData.data}
        runIds={runIds ?? []}
        localExperiments={localRuns}
      />
    </Page>
  );
}
