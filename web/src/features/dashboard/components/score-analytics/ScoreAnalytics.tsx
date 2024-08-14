import { api } from "@/src/utils/api";

import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { type FilterState } from "@langfuse/shared";
import { type DashboardDateRangeAggregationOption } from "@/src/utils/date-range-utils";
import useLocalStorage from "@/src/components/useLocalStorage";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import React, { useMemo } from "react";
import { Separator } from "@/src/components/ui/separator";
import { Card } from "@/src/components/ui/card";
import {
  isBooleanDataType,
  isCategoricalDataType,
  isNumericDataType,
} from "@/src/features/scores/lib/helpers";
import { getScoreDataTypeIcon } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { NumericScoreTimeSeriesChart } from "@/src/features/dashboard/components/score-analytics/NumericScoreTimeSeriesChart";
import { CategoricalScoreChart } from "@/src/features/dashboard/components/score-analytics/CategoricalScoreChart";
import { NumericScoreHistogram } from "@/src/features/dashboard/components/score-analytics/NumericScoreHistogram";
import { NoData } from "@/src/features/dashboard/components/NoData";

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
    selectedTimeOption: { option: props.agg, filterSource: "DASHBOARD" },
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
      description="Aggregate scores and averages over time"
      isLoading={scoreKeysAndProps.isLoading}
      headerClassName={"grid grid-cols-[1fr,auto,auto] items-center"}
      headerChildren={
        !scoreKeysAndProps.isLoading &&
        Boolean(scoreKeysAndProps.data?.length) && (
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
      {Boolean(scoreKeysAndProps.data?.length) &&
      Boolean(scoreAnalyticsValues.length) ? (
        <div className="grid grid-flow-row gap-4">
          {scoreAnalyticsValues.map(({ key: scoreKey }, index) => {
            const scoreData = scoreKeyToData.get(scoreKey);
            if (!scoreData) return null;
            const { name, dataType, source } = scoreData;

            return (
              <div key={scoreKey}>
                <div>{`${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`}</div>
                <div className="mt-2 grid grid-cols-2 gap-4">
                  {/* aggregate */}
                  <div>
                    <div className="mb-2 text-sm text-muted-foreground">
                      Total aggregate scores
                    </div>
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
                        <NumericScoreHistogram
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
                    <div className="mb-2 text-sm text-muted-foreground">
                      {isNumericDataType(dataType)
                        ? "Moving average over time"
                        : "Scores added over time"}
                    </div>
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
                {scoreAnalyticsValues.length - 1 > index && (
                  <Separator className="mt-6 opacity-70" />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <NoData
          noDataText={
            Boolean(scoreKeysAndProps.data?.length)
              ? "Select a score to view analytics"
              : "No data"
          }
        ></NoData>
      )}
    </DashboardCard>
  );
}
