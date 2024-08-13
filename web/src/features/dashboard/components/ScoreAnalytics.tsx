import { api } from "@/src/utils/api";

import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import {
  type ScoreSource,
  type FilterState,
  type ScoreDataType,
} from "@langfuse/shared";
import {
  extractTimeSeriesData,
  fillMissingValuesAndTransform,
  isEmptyTimeSeries,
} from "@/src/features/dashboard/components/hooks";
import { NoData } from "@/src/features/dashboard/components/NoData";
import DocPopup from "@/src/components/layouts/doc-popup";
import { createTracesTimeFilter } from "@/src/features/dashboard/lib/dashboard-utils";
import {
  type DashboardDateRangeAggregationOption,
  dashboardDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import { cn } from "@/src/utils/tailwind";
import useLocalStorage from "@/src/components/useLocalStorage";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import React, { useMemo } from "react";
import { Separator } from "@/src/components/ui/separator";
import { Card } from "@/src/components/ui/card";
import { BarChart } from "@tremor/react";
import {
  isBooleanDataType,
  isCategoricalDataType,
  isNumericDataType,
} from "@/src/features/scores/lib/helpers";
import { getScoreDataTypeIcon } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { type DatabaseRow } from "@/src/server/api/services/query-builder";
import { getColorsForCategories } from "@/src/features/dashboard/utils/getColorsForCategories";

const SCORE_TIMESTAMP_ACCESSOR = "scoreTimestamp";

function convertDateToStringTimestamp(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
  });
}

function padChartData(chartData: HistogramBin[]) {
  const emptyBin = { bin: "", empty: 0 };
  if (chartData.length < 3) {
    return [emptyBin, emptyBin, ...chartData, emptyBin, emptyBin];
  }

  if (chartData.length < 5) {
    return [emptyBin, ...chartData, emptyBin];
  }

  return chartData;
}

type HistogramBin = { bin: string; count: number };
type CategoryCounts = Record<string, number>;
type ChartBin = { binLabel: string } & CategoryCounts;

function aggregateScoreData(
  data: DatabaseRow[],
  previousTimestampChartBin?: ChartBin,
): { categoryCounts: CategoryCounts; labels: string[] } {
  const labels: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let { binLabel, ...categoryCounts } =
    previousTimestampChartBin || ({} as ChartBin);

  data.forEach((row) => {
    const label = row["stringValue"];
    if (typeof label === "string") {
      labels.push(label);
      const previousChartBinCount = categoryCounts[label] ?? 0;
      const count = previousChartBinCount + (row["countStringValue"] as number);
      categoryCounts = { ...categoryCounts, [label]: count };
    }
  });

  return { categoryCounts, labels };
}

function transformScoresToChartData(
  data: DatabaseRow[],
  agg?: DashboardDateRangeAggregationOption,
) {
  if (!agg) {
    const { categoryCounts, labels } = aggregateScoreData(data);
    return {
      chartData: [{ ...categoryCounts, binLabel: "Aggregation" }],
      chartLabels: Array.from(new Set(labels)),
    };
  } else {
    const chartData: ChartBin[] = [];
    const chartLabels: string[] = [];

    const scoreDataByTimestamp = groupScoreDataByTimestamp(data);

    Object.entries(scoreDataByTimestamp).forEach(([timestamp, data], index) => {
      const previousTimestampData = chartData[index - 1] || {};

      const { categoryCounts, labels } = aggregateScoreData(
        data,
        previousTimestampData,
      );
      chartLabels.push(...labels);
      chartData.push({ ...categoryCounts, binLabel: timestamp } as ChartBin);
    });

    return { chartData, chartLabels: Array.from(new Set(chartLabels)) };
  }
}

function groupScoreDataByTimestamp(
  data: DatabaseRow[],
): Record<string, DatabaseRow[]> {
  return data.reduce(
    (acc, row) => {
      const timestamp = row[SCORE_TIMESTAMP_ACCESSOR];
      if (!(timestamp instanceof Date)) return acc;
      const key = convertDateToStringTimestamp(timestamp);
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(row);
      return acc;
    },
    {} as Record<string, DatabaseRow[]>,
  );
}

function CategoricalScoreChart(props: {
  projectId: string;
  name: string;
  source: ScoreSource;
  dataType: ScoreDataType;
  globalFilterState: FilterState;
  agg?: DashboardDateRangeAggregationOption;
}) {
  const scores = api.dashboard.chart.useQuery(
    {
      projectId: props.projectId,
      from: "traces_scores",
      select: [
        { column: "scoreName" },
        { column: "scoreDataType" },
        { column: "scoreSource" },
        { column: "stringValue" },
        { column: "stringValue", agg: "COUNT" },
      ],
      filter: [
        ...createTracesTimeFilter(
          props.globalFilterState,
          SCORE_TIMESTAMP_ACCESSOR,
        ),
        {
          type: "string",
          column: "scoreName",
          value: props.name,
          operator: "=",
        },
        {
          type: "string",
          column: "castScoreSource",
          value: props.source,
          operator: "=",
        },
        {
          type: "string",
          column: "castScoreDataType",
          value: props.dataType,
          operator: "=",
        },
      ],
      groupBy: [
        { type: "string", column: "stringValue" },
        {
          type: "string",
          column: "scoreName",
        },
        {
          type: "string",
          column: "scoreSource",
        },
        {
          type: "string",
          column: "scoreDataType",
        },
        ...(props.agg
          ? [
              {
                type: "datetime",
                column: SCORE_TIMESTAMP_ACCESSOR,
                temporalUnit:
                  dashboardDateRangeAggregationSettings[props.agg].date_trunc,
              } as const,
            ]
          : []),
      ],
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const { chartData, chartLabels } = scores.data
    ? transformScoresToChartData(scores.data, props.agg)
    : { chartData: [], chartLabels: [] };

  console.log({ chartData, chartLabels });

  const barCategoryGap = (chartLength: number): string => {
    if (chartLength > 7) return "10%";
    if (chartLength > 5) return "20%";
    if (chartLength > 3) return "30%";
    else return "40%";
  };
  const colors = getColorsForCategories(chartLabels);

  return (
    <BarChart
      className="mt-6"
      data={chartData}
      index="binLabel"
      categories={chartLabels}
      colors={colors}
      valueFormatter={(number: number) =>
        Intl.NumberFormat("en-US").format(number).toString()
      }
      yAxisWidth={48}
      barCategoryGap={barCategoryGap(chartData.length)}
      stack={!!props.agg}
    />
  );
}

function round(value: number, precision = 2) {
  return parseFloat(value.toFixed(precision));
}

function createHistogramData(data: DatabaseRow[], minBins = 1, maxBins = 10) {
  const numericScoreValues = data.map((item) => item.value as number);
  if (!Boolean(numericScoreValues.length))
    return { chartData: [], chartLabels: [] };

  const min = round(Math.min(...numericScoreValues));
  const range = round(Math.max(...numericScoreValues)) - min;
  const bins = Math.min(Math.max(minBins, Math.ceil(range)), maxBins);
  const binSize = range / bins ?? 1;
  const histogramData = Array.from({ length: bins }, () => ({ count: 0 }));

  for (const value of numericScoreValues) {
    const shiftedValue = round(value) - min;
    const binIndex = Math.min(Math.floor(shiftedValue / binSize), bins - 1);
    histogramData[binIndex].count++;
  }

  const chartData = histogramData.reduce((acc, bin, i) => {
    const rangeStart = min + i * binSize;
    const rangeEnd = min + (i + 1) * binSize;
    const rangeStr = `[${rangeStart.toFixed(2)}, ${rangeEnd.toFixed(2)}]`;

    return [...acc, { bin: rangeStr, count: bin.count }];
  }, [] as HistogramBin[]);

  return {
    chartLabels: ["count"],
    chartData,
  };
}

function Histogram(props: {
  projectId: string;
  name: string;
  source: ScoreSource;
  dataType: ScoreDataType;
  globalFilterState: FilterState;
}) {
  const scores = api.dashboard.chart.useQuery(
    {
      projectId: props.projectId,
      from: "traces_scores",
      select: [{ column: "value" }],
      filter: [
        ...createTracesTimeFilter(
          props.globalFilterState,
          SCORE_TIMESTAMP_ACCESSOR,
        ),
        {
          type: "string",
          column: "scoreName",
          value: props.name,
          operator: "=",
        },
        {
          type: "string",
          column: "castScoreSource",
          value: props.source,
          operator: "=",
        },
        {
          type: "string",
          column: "castScoreDataType",
          value: props.dataType,
          operator: "=",
        },
      ],
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const { chartData, chartLabels } = scores.data
    ? createHistogramData(scores.data)
    : { chartData: [], chartLabels: [] };

  const colors = getColorsForCategories(chartLabels);
  const paddedChartData = padChartData(chartData);

  return (
    <BarChart
      className="mt-6"
      data={paddedChartData}
      index="bin"
      categories={chartLabels}
      colors={colors}
      valueFormatter={(number: number) =>
        Intl.NumberFormat("en-US").format(number).toString()
      }
      yAxisWidth={48}
      barCategoryGap={"0%"}
    />
  );
}

function NumericScoreTimeSeriesChart(props: {
  projectId: string;
  scoreKey: string;
  source: ScoreSource;
  dataType: ScoreDataType;
  name: string;
  agg: DashboardDateRangeAggregationOption;
  globalFilterState: FilterState;
}) {
  const scores = api.dashboard.chart.useQuery(
    {
      projectId: props.projectId,
      from: "traces_scores",
      select: [{ column: "scoreName" }, { column: "value", agg: "AVG" }],
      filter: [
        ...createTracesTimeFilter(props.globalFilterState),
        {
          type: "string",
          column: "scoreName",
          value: props.name,
          operator: "=",
        },
        {
          type: "string",
          column: "castScoreSource",
          value: props.source as string,
          operator: "=",
        },
        {
          type: "string",
          column: "castScoreDataType",
          value: props.dataType as string,
          operator: "=",
        },
      ],
      groupBy: [
        {
          type: "datetime",
          column: "timestamp",
          temporalUnit:
            dashboardDateRangeAggregationSettings[props.agg].date_trunc,
        },
        {
          type: "string",
          column: "scoreName",
        },
        {
          type: "string",
          column: "scoreSource",
        },
        {
          type: "string",
          column: "scoreDataType",
        },
      ],
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const extractedScores = scores.data
    ? fillMissingValuesAndTransform(
        extractTimeSeriesData(scores.data, "timestamp", [
          {
            labelColumn: "scoreName",
            valueColumn: "avgValue",
          },
        ]),
      )
    : [];

  return !isEmptyTimeSeries(extractedScores) ? (
    <BaseTimeSeriesChart agg={props.agg} data={extractedScores} connectNulls />
  ) : (
    <NoData noDataText="No data">
      <DocPopup
        description="Scores evaluate LLM quality and can be created manually or using the SDK."
        href="https://langfuse.com/docs/scores"
      />
    </NoData>
  );
}

export function ScoreAnalytics(props: {
  className?: string;
  agg: DashboardDateRangeAggregationOption;
  globalFilterState: FilterState;
  projectId: string;
}) {
  const [selectedDashboardScoreKeys, setSelectedDashboardScoreKeys] =
    useLocalStorage<string[]>(`selectedDashboardScores-${props.projectId}`, []);

  const scoreKeysAndProps = api.scores.getScoreKeysAndProps.useQuery({
    projectId: props.projectId,
  });

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

  const scoreAnalyticsValues = scoreAnalyticsOptions?.filter((option) =>
    selectedDashboardScoreKeys.includes(option.key),
  );

  return (
    <DashboardCard
      className={props.className}
      title="Scores Analytics"
      description="Summary statistics and timeseries"
      isLoading={scoreKeysAndProps.isLoading}
      headerClassName={"grid grid-cols-[1fr,auto,auto] items-center"}
      headerChildren={
        !scoreKeysAndProps.isLoading && (
          <MultiSelectKeyValues
            title="Search score..."
            onValueChange={(values, changedValueId, selectedValueKeys) => {
              if (values.length === 0) setSelectedDashboardScoreKeys([]);

              if (changedValueId) {
                if (selectedValueKeys?.has(changedValueId)) {
                  setSelectedDashboardScoreKeys([
                    ...selectedDashboardScoreKeys,
                    changedValueId,
                  ]);
                } else {
                  setSelectedDashboardScoreKeys(
                    selectedDashboardScoreKeys.filter(
                      (key) => key !== changedValueId,
                    ),
                  );
                }
              }
            }}
            values={scoreAnalyticsValues}
            options={scoreAnalyticsOptions}
          />
        )
      }
    >
      <div className="grid grid-flow-row gap-4">
        {selectedDashboardScoreKeys.map((scoreKey, index) => {
          const scoreData = scoreKeyToData.get(scoreKey);
          if (!scoreData) return null;
          const { name, dataType, source } = scoreData;

          return (
            <div key={scoreKey}>
              <div className="text-sm">{`${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`}</div>
              <div className="mt-2 grid grid-cols-2 gap-4">
                {/* aggregate */}
                <div>
                  <Card className="min-h-[9rem] w-full flex-1 rounded-tremor-default border">
                    {(isCategoricalDataType(dataType) ||
                      isBooleanDataType(dataType)) && (
                      <CategoricalScoreChart
                        source={source}
                        name={name}
                        dataType={dataType}
                        projectId={props.projectId}
                        globalFilterState={props.globalFilterState}
                      />
                    )}
                    {isNumericDataType(dataType) && (
                      <Histogram
                        source={source}
                        name={name}
                        dataType={dataType}
                        projectId={props.projectId}
                        globalFilterState={props.globalFilterState}
                      />
                    )}
                  </Card>
                </div>
                {/* timeseries */}
                <div>
                  <Card className="min-h-[9rem] w-full flex-1 rounded-tremor-default border">
                    {(isCategoricalDataType(dataType) ||
                      isBooleanDataType(dataType)) && (
                      <CategoricalScoreChart
                        agg={props.agg}
                        source={source}
                        name={name}
                        dataType={dataType}
                        projectId={props.projectId}
                        globalFilterState={props.globalFilterState}
                      />
                    )}
                    {isNumericDataType(dataType) && (
                      <NumericScoreTimeSeriesChart
                        agg={props.agg}
                        scoreKey={scoreKey}
                        source={source}
                        name={name}
                        dataType={dataType}
                        projectId={props.projectId}
                        globalFilterState={props.globalFilterState}
                      />
                    )}
                  </Card>
                </div>
              </div>
              {selectedDashboardScoreKeys.length - 1 > index && (
                <Separator className="mt-6" />
              )}
            </div>
          );
        })}
      </div>
    </DashboardCard>
  );
}
