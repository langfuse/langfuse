import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import Header from "@/src/components/layouts/header";
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
import { MarkdownOrJsonView } from "@/src/components/trace/IOPreview";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { CreateExperimentsForm } from "@/src/ee/features/experiments/components/CreateExperimentsForm";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";

import { DatasetAnalytics } from "@/src/features/datasets/components/DatasetAnalytics";
import { Card, CardContent } from "@/src/components/ui/card";
import { getScoreDataTypeIcon } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { useClickhouse } from "@/src/components/layouts/ClickhouseAdminToggle";
import {
  isBooleanDataType,
  isNumericDataType,
} from "@/src/features/scores/lib/helpers";
import { isCategoricalDataType } from "@/src/features/scores/lib/helpers";
import { getColorsForCategories } from "@/src/features/dashboard/utils/getColorsForCategories";
import { isEmptyBarChart } from "@/src/features/dashboard/lib/score-analytics-utils";
import { BarChart, LineChart } from "@tremor/react";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import Link from "next/link";
// import { isEmptyTimeSeries } from "@/src/features/dashboard/components/hooks";
import { compactNumberFormatter } from "@/src/utils/numbers";

// fix import
type CategoryCounts = Record<string, number>;
type ChartBin = { binLabel: string } & CategoryCounts;

const RESOURCE_KEY_TO_LABEL = new Map([
  ["latency", "Latency (ms)"],
  ["cost", "Total Cost ($)"],
]);

function CategoricalChart(props: {
  chartData: ChartBin[];
  chartLabels: string[];
}) {
  const barCategoryGap = (chartLength: number): string => {
    if (chartLength > 7) return "10%";
    if (chartLength > 5) return "20%";
    if (chartLength > 3) return "30%";
    else return "40%";
  };
  const colors = getColorsForCategories(props.chartLabels);

  return isEmptyBarChart({ data: props.chartData }) ? (
    <NoDataOrLoading isLoading={false} />
  ) : (
    <Card className="h-full w-full rounded-tremor-default border">
      <BarChart
        className="h-full"
        data={props.chartData}
        index="binLabel"
        categories={props.chartLabels}
        colors={colors}
        valueFormatter={(number: number) =>
          Intl.NumberFormat("en-US").format(number).toString()
        }
        yAxisWidth={48}
        barCategoryGap={barCategoryGap(props.chartData.length)}
        stack
      />
    </Card>
  );
}

function NumericChart(props: { chartData: ChartBin[]; chartLabels: string[] }) {
  const colors = getColorsForCategories(props.chartLabels);

  return (
    <Card className="h-full w-full rounded-tremor-default border">
      <LineChart
        className="h-full"
        data={props.chartData}
        index="binLabel"
        categories={props.chartLabels}
        colors={colors}
        valueFormatter={compactNumberFormatter}
        noDataText="No data"
        showAnimation={true}
        onValueChange={() => {}}
        enableLegendSlider={true}
      />
    </Card>
  );
}

function uniqueAndSort(labels: string[]): string[] {
  return Array.from(new Set(labels)).sort();
}

export default function DatasetCompare() {
  const router = useRouter();
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
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const runIds = runState.runs as undefined | string[];

  const hasExperimentWriteAccess = useHasProjectAccess({
    projectId,
    scope: "promptExperiments:CUD",
  });
  const hasEntitlement = useHasEntitlement("prompt-experiments");

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

  const runMetrics = api.datasets.runsByDatasetIdMetrics.useQuery({
    projectId,
    datasetId,
    queryClickhouse: useClickhouse(),
    page: 0,
    limit: 100, // need to drop this limit for the query to work properly
  });

  // TODO: refactor write new query to pull scores for runs
  const scoreKeysAndProps = api.scores.getScoreKeysAndProps.useQuery({
    projectId: projectId,
    selectedTimeOption: { option: "All time", filterSource: "TABLE" },
    queryClickhouse: useClickhouse(),
  });

  const scoreIdToName = useMemo(() => {
    return new Map(
      scoreKeysAndProps.data?.map((obj) => [obj.key, obj.name]) ?? [],
    );
  }, [scoreKeysAndProps.data]);

  const runAggregatedMetrics = useMemo(() => {
    return runMetrics.data?.runs
      .filter((run) => runIds?.includes(run.id))
      .reduce((acc, run) => {
        Object.entries(run.scores ?? {}).forEach(([scoreId, score]) => {
          if (!acc.has(scoreId)) {
            acc.set(scoreId, { chartData: [], chartLabels: [] });
          }
          const currentScores = acc.get(scoreId)?.chartData ?? [];
          let chartLabels: string[] = [];
          let chartBin: ChartBin | null = null;
          if (score.type === "NUMERIC") {
            const scoreName = scoreIdToName.get(scoreId) ?? "score";
            chartLabels = [scoreName];
            chartBin = {
              binLabel: run.name,
              [scoreName]: score.average,
            } as ChartBin;
          } else {
            const categoryCounts: CategoryCounts = {
              ...score.valueCounts.reduce(
                (counts, { value, count }) => ({
                  ...counts,
                  [value]: count,
                }),
                {},
              ),
            };
            chartLabels = [...score.values];
            chartBin = {
              binLabel: run.name,
              ...categoryCounts,
            } as ChartBin;
          }
          acc.set(scoreId, {
            chartData: [...currentScores, chartBin],
            chartLabels,
          });
        });

        // handle resource metrics
        const key = "latency";
        const currentResourceData = acc.get(key)?.chartData ?? [];
        const chartBin = {
          binLabel: run.name,
          [key]: run.avgLatency ?? 0,
        } as unknown as ChartBin;
        acc.set(key, {
          chartData: [...currentResourceData, chartBin],
          chartLabels: [key],
        });

        const costKey = "cost";
        const currentCostData = acc.get(costKey)?.chartData ?? [];
        const costChartBin = {
          binLabel: run.name,
          [costKey]: run.avgTotalCost ?? 0,
        } as unknown as ChartBin;
        acc.set(costKey, {
          chartData: [...currentCostData, costChartBin],
          chartLabels: [costKey],
        });

        return acc;
      }, new Map<string, { chartData: ChartBin[]; chartLabels: string[] }>());
  }, [runMetrics.data, runIds, scoreIdToName]);

  const { scoreAnalyticsOptions, scoreKeyToData } = useMemo(() => {
    const scoreAnalyticsOptions =
      scoreKeysAndProps.data?.map(({ key, name, dataType, source }) => ({
        key,
        value: `${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`,
      })) ?? [];

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

  if (!runsData.data || !router.isReady) {
    return <span>Loading...</span>;
  }

  return (
    <FullScreenPage key={runIds?.join(",") ?? "empty"}>
      <Header
        title={`Compare runs: ${dataset.data?.name ?? datasetId}`}
        breadcrumb={[
          {
            name: "Datasets",
            href: `/project/${projectId}/datasets`,
          },
          {
            name: dataset.data?.name ?? datasetId,
            href: `/project/${projectId}/datasets/${datasetId}`,
          },
        ]}
        help={{
          description: "Compare your dataset runs side by side",
        }}
        actionButtons={[
          hasEntitlement ? (
            <Dialog
              key="create-experiment-dialog"
              open={isCreateExperimentDialogOpen}
              onOpenChange={setIsCreateExperimentDialogOpen}
            >
              <DialogTrigger asChild disabled={!hasExperimentWriteAccess}>
                <Button
                  variant="secondary"
                  disabled={!hasExperimentWriteAccess}
                >
                  <FlaskConical className="h-4 w-4" />
                  <span className="ml-2">New experiment</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Set up experiment</DialogTitle>
                  <DialogDescription>
                    Create an experiment to test a prompt version on a dataset.
                    See{" "}
                    <Link
                      href="https://langfuse.com/docs/datasets/prompt-experiments"
                      target="_blank"
                      className="underline"
                    >
                      documentation
                    </Link>{" "}
                    to learn more.
                  </DialogDescription>
                </DialogHeader>
                <CreateExperimentsForm
                  key={`create-experiment-form-${datasetId}`}
                  projectId={projectId as string}
                  setFormOpen={setIsCreateExperimentDialogOpen}
                  defaultValues={{
                    datasetId,
                  }}
                  handleExperimentSettled={handleExperimentSettled}
                />
              </DialogContent>
            </Dialog>
          ) : null,
          <Popover key="show-dataset-details">
            <PopoverTrigger asChild>
              <Button variant="outline">
                <FolderKanban className="mr-2 h-4 w-4" />
                Dataset details
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
                  <MarkdownOrJsonView
                    content={dataset.data?.metadata ?? null}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>,
          <DatasetAnalytics
            key="dataset-analytics"
            projectId={projectId}
            scoreOptions={scoreAnalyticsOptions}
            selectedMetrics={selectedMetrics}
            setSelectedMetrics={setSelectedMetrics}
          />,
          <MultiSelectKeyValues
            key="select-runs"
            title="Select runs"
            placeholder="Select runs to compare"
            className="w-fit"
            hideClearButton
            options={runs.map((run) => ({
              key: run.key,
              value: run.value,
              disabled: runIds?.includes(run.key) && runIds.length === 2,
            }))}
            values={runs.filter((run) => runIds?.includes(run.key))}
            onValueChange={(values, changedValueId, selectedValueKeys) => {
              if (values.length === 0) return;
              if (changedValueId) {
                if (selectedValueKeys?.has(changedValueId)) {
                  setRunState({
                    runs: [...(runIds ?? []), changedValueId],
                  });
                  setLocalRuns([]);
                } else {
                  setRunState({
                    runs: runIds?.filter((id) => id !== changedValueId) ?? [],
                  });
                  setLocalRuns([]);
                }
              }
            }}
          />,
        ]}
      />
      {Boolean(selectedMetrics.length) &&
        Boolean(runAggregatedMetrics?.size) && (
          <Card className="my-4 max-h-[30dvh]">
            <CardContent className="mt-2 h-full">
              <div className="flex h-full w-full gap-4 overflow-x-auto">
                {selectedMetrics.map((key) => {
                  const scoreData = scoreKeyToData.get(key);
                  if (!scoreData) {
                    return (
                      <div
                        key={key}
                        className="mb-2 flex w-[45%] flex-none flex-col overflow-hidden"
                      >
                        <div className="shrink-0 text-sm font-medium">
                          {RESOURCE_KEY_TO_LABEL.get(key) ?? key}
                        </div>
                        <div className="mt-2 min-h-0 flex-1">
                          <NumericChart
                            chartLabels={uniqueAndSort(
                              runAggregatedMetrics?.get(key)?.chartLabels ?? [],
                            )}
                            chartData={
                              runAggregatedMetrics?.get(key)?.chartData ?? []
                            }
                          />
                        </div>
                      </div>
                    );
                  }
                  const { name, dataType, source } = scoreData;

                  return (
                    <div
                      key={key}
                      className="mb-2 flex w-[45%] flex-none flex-col overflow-hidden"
                    >
                      <div className="shrink-0 text-sm font-medium">
                        {`${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`}
                      </div>
                      <div className="mt-2 min-h-0 flex-1">
                        {/* timeseries */}
                        {(isCategoricalDataType(dataType) ||
                          isBooleanDataType(dataType)) && (
                          <CategoricalChart
                            chartLabels={uniqueAndSort(
                              runAggregatedMetrics?.get(key)?.chartLabels ?? [],
                            )}
                            chartData={
                              runAggregatedMetrics?.get(key)?.chartData ?? []
                            }
                          />
                        )}
                        {isNumericDataType(dataType) && (
                          <NumericChart
                            chartLabels={uniqueAndSort(
                              runAggregatedMetrics?.get(key)?.chartLabels ?? [],
                            )}
                            chartData={
                              runAggregatedMetrics?.get(key)?.chartData ?? []
                            }
                          />
                        )}
                      </div>
                    </div>
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
    </FullScreenPage>
  );
}
