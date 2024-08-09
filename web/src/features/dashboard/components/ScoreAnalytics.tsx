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

function convertDateToStringTimestamp(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
  });
}

function transformScoresToChartData(data: DatabaseRow[]) {
  const chartLabels = new Set<string>();

  const groupedData = data.reduce(
    (acc, row) => {
      const timestamp = row["scoreTimestamp"];
      const key =
        timestamp instanceof Date
          ? convertDateToStringTimestamp(timestamp)
          : "noTimestamp";
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(row);
      return acc;
    },
    {} as Record<string, DatabaseRow[]>,
  );

  const chartData = Object.values(groupedData).map((group) => {
    return group.reduce((acc, row) => {
      const label = row["stringValue"];
      const timestamp = row["scoreTimestamp"];
      const scoreTimestamp =
        timestamp instanceof Date
          ? convertDateToStringTimestamp(timestamp)
          : "Aggregation";

      const newAcc = { ...acc, scoreTimestamp };
      if (typeof label === "string") {
        chartLabels.add(label);
        return { ...newAcc, [label]: row["countStringValue"] };
      }
      return { ...newAcc };
    }, {});
  });

  return { chartData, chartLabels: Array.from(chartLabels) };
}

function CategoricalScoreChart(props: {
  projectId: string;
  name: string;
  source: ScoreSource;
  dataType: ScoreDataType;
  globalFilterState: FilterState;
  barCategoryGap?: string | number;
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
        ...createTracesTimeFilter(props.globalFilterState, "scoreTimestamp"),
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
                column: "scoreTimestamp",
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
    ? transformScoresToChartData(scores.data)
    : { chartData: [], chartLabels: [] };

  return (
    <BarChart
      className="mt-6"
      data={chartData}
      index="scoreTimestamp"
      categories={chartLabels}
      colors={["blue", "teal", "amber", "rose", "indigo", "emerald"]}
      valueFormatter={(number: number) =>
        Intl.NumberFormat("en-US").format(number).toString()
      }
      yAxisWidth={48}
      barCategoryGap={props.barCategoryGap}
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
      isLoading={scoreKeysAndProps.isLoading} // likely move loading to individual chart level
      headerClassName={cn(
        "grid grid-cols-[1fr,auto,auto] items-center",
        // scoreKeysAndProps.isLoading && "gap-6",
      )}
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
                        barCategoryGap={"40%"}
                      />
                    )}
                    {isNumericDataType(dataType) && (
                      <div className="p-2 text-xs">
                        Histogram placeholder...
                      </div>
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
