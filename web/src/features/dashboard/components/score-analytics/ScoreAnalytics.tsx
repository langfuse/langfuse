import { api } from "@/src/utils/api";

import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { type FilterState } from "@langfuse/shared";
import { type DashboardDateRangeAggregationOption } from "@/src/utils/date-range-utils";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import React, { useMemo } from "react";
import { Separator } from "@/src/components/ui/separator";
import {
  isBooleanDataType,
  isCategoricalDataType,
  isNumericDataType,
  toOrderedScoresList,
} from "@/src/features/scores/lib/helpers";
import { getScoreDataTypeIcon } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { NumericScoreTimeSeriesChart } from "@/src/features/dashboard/components/score-analytics/NumericScoreTimeSeriesChart";
import { CategoricalScoreChart } from "@/src/features/dashboard/components/score-analytics/CategoricalScoreChart";
import { NumericScoreHistogram } from "@/src/features/dashboard/components/score-analytics/NumericScoreHistogram";
import DocPopup from "@/src/components/layouts/doc-popup";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { Flex, Text } from "@tremor/react";
import useLocalStorage from "@/src/components/useLocalStorage";

export function ScoreAnalytics(props: {
  className?: string;
  agg: DashboardDateRangeAggregationOption;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  projectId: string;
  isLoading?: boolean;
}) {
  // Stale score selections in localStorage are ignored as we only show scores that exist in scoreAnalyticsOptions
  const [selectedDashboardScoreKeys, setSelectedDashboardScoreKeys] =
    useLocalStorage<string[]>(
      `selectedDashboardScoreKeys-${props.projectId}`,
      [],
    );

  const scoreKeysAndProps = api.scores.getScoreKeysAndProps.useQuery(
    {
      projectId: props.projectId,
      selectedTimeOption: { option: props.agg, filterSource: "DASHBOARD" },
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: !props.isLoading,
    },
  );

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

  const scoreAnalyticsValues = scoreAnalyticsOptions?.filter((option) =>
    selectedDashboardScoreKeys.includes(option.key),
  );

  return (
    <DashboardCard
      className={props.className}
      title="Scores Analytics"
      description="Aggregate scores and averages over time"
      isLoading={props.isLoading || scoreKeysAndProps.isLoading}
      headerClassName={"grid grid-cols-[1fr,auto,auto] items-center"}
      headerChildren={
        !scoreKeysAndProps.isLoading &&
        !props.isLoading &&
        Boolean(scoreKeysAndProps.data?.length) && (
          <MultiSelectKeyValues
            placeholder="Search score..."
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
                <div className="mt-2 grid gap-2 lg:grid-cols-2 lg:gap-4">
                  {/* aggregate */}
                  <div>
                    <div className="mb-2 text-sm text-muted-foreground">
                      Total aggregate scores
                      {isNumericDataType(dataType) && (
                        <DocPopup description="Aggregate of up to 10,000 scores" />
                      )}
                    </div>
                    {isCategoricalDataType(dataType) && (
                      <CategoricalScoreChart
                        projectId={props.projectId}
                        scoreData={scoreData}
                        globalFilterState={props.globalFilterState}
                        fromTimestamp={props.fromTimestamp}
                        toTimestamp={props.toTimestamp}
                      />
                    )}
                    {(isNumericDataType(dataType) ||
                      isBooleanDataType(dataType)) && (
                      <NumericScoreHistogram
                        projectId={props.projectId}
                        source={source}
                        name={name}
                        dataType={dataType}
                        globalFilterState={props.globalFilterState}
                      />
                    )}
                  </div>
                  {/* timeseries */}
                  <div>
                    <div className="mb-2 text-sm text-muted-foreground">
                      {isNumericDataType(dataType)
                        ? "Moving average over time"
                        : "Scores over time"}
                    </div>
                    {isCategoricalDataType(dataType) && (
                      <CategoricalScoreChart
                        projectId={props.projectId}
                        agg={props.agg}
                        scoreData={scoreData}
                        globalFilterState={props.globalFilterState}
                        fromTimestamp={props.fromTimestamp}
                        toTimestamp={props.toTimestamp}
                      />
                    )}
                    {(isNumericDataType(dataType) ||
                      isBooleanDataType(dataType)) && (
                      <NumericScoreTimeSeriesChart
                        agg={props.agg}
                        source={source}
                        name={name}
                        dataType={dataType}
                        projectId={props.projectId}
                        globalFilterState={props.globalFilterState}
                        fromTimestamp={props.fromTimestamp}
                        toTimestamp={props.toTimestamp}
                      />
                    )}
                  </div>
                </div>
                {scoreAnalyticsValues.length - 1 > index && (
                  <Separator className="mt-6 opacity-70" />
                )}
              </div>
            );
          })}
        </div>
      ) : Boolean(scoreKeysAndProps.data?.length) ? (
        <Flex
          alignItems="center"
          justifyContent="center"
          className="min-h-[9rem] w-full flex-1 rounded-tremor-default border"
        >
          <Text className="text-tremor-content">
            Select a score to view analytics
          </Text>
        </Flex>
      ) : (
        <NoDataOrLoading isLoading={scoreKeysAndProps.isLoading} />
      )}
    </DashboardCard>
  );
}
