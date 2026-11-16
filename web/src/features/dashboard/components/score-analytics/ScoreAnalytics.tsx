/* eslint-disable @repo/no-style-props */
import { api } from "@/src/utils/api";
import { MultiSelectTagInput } from "@/src/components/design-system/MultiSelectTagInput/MultiSelectTagInput";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { GripVerticalIcon, MoreVerticalIcon } from "@langfuse/icons";
import { VisualizationFrame } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import { type FilterState, type ScoreDataTypeType } from "@langfuse/shared";
import { type DashboardDateRangeAggregationOption } from "@/src/utils/date-range-utils";
import {
  convertScoreColumnsToAnalyticsData,
  getScoreDataTypeIcon,
} from "@/src/features/scores/lib/scoreColumns";
import {
  isBooleanDataType,
  isCategoricalDataType,
  isNumericDataType,
} from "@/src/features/scores/lib/helpers";
import React, { useMemo } from "react";
import { Separator } from "@/src/components/ui/separator";
import { NumericScoreTimeSeriesCard } from "@/src/features/dashboard/components/score-analytics/NumericScoreTimeSeriesCard";
import { CategoricalScoreCard } from "@/src/features/dashboard/components/score-analytics/CategoricalScoreCard";
import { NumericScoreHistogramCard } from "@/src/features/dashboard/components/score-analytics/NumericScoreHistogramCard";
import useLocalStorage from "@/src/components/useLocalStorage";
import { type ViewVersion } from "@langfuse/shared/query";

export function ScoreAnalytics(props: {
  actions?: DataCardActions;
  className?: string;
  agg: DashboardDateRangeAggregationOption;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  projectId: string;
  isLoading?: boolean;
  metricsVersion: ViewVersion;
  schedulerId?: string;
  /** Shared hover-sync group so the per-score line charts join the dashboard crosshair. */
  syncId?: string;
  sync?: {
    activeKey: string | undefined;
    onActiveKeyChange: (key: string | undefined) => void;
  };
}) {
  // Stale score selections in localStorage are ignored as we only show scores that exist in scoreAnalyticsOptions
  const [selectedDashboardScoreKeys, setSelectedDashboardScoreKeys] =
    useLocalStorage<string[]>(
      `selectedDashboardScoreKeys-${props.projectId}`,
      [],
    );

  const scoreKeysAndProps = api.scores.getScoreColumns.useQuery(
    {
      projectId: props.projectId,
      fromTimestamp: props.fromTimestamp,
      toTimestamp: props.toTimestamp,
    },
    {
      enabled: !props.isLoading,
    },
  );

  const { scoreAnalyticsOptions, scoreKeyToData } = useMemo(
    () =>
      convertScoreColumnsToAnalyticsData(scoreKeysAndProps.data?.scoreColumns),
    [scoreKeysAndProps.data],
  );

  const scoreAnalyticsValues = scoreAnalyticsOptions?.filter((option) =>
    selectedDashboardScoreKeys.includes(option.key),
  );

  const scoreSelectorOptions = useMemo(() => {
    const scoreNameCounts = new Map<string, number>();
    scoreKeyToData.forEach(({ name }) => {
      scoreNameCounts.set(name, (scoreNameCounts.get(name) ?? 0) + 1);
    });

    return scoreAnalyticsOptions.map(({ key }) => {
      const scoreData = scoreKeyToData.get(key);
      if (!scoreData) return { value: key, label: key };

      // Scores with the same name can differ by type or source, so only disambiguate duplicates to keep unique labels concise.
      const hasDuplicateName = (scoreNameCounts.get(scoreData.name) ?? 0) > 1;
      if (!hasDuplicateName) return { value: key, label: scoreData.name };

      const suffix = [
        getScoreDataTypeIcon(scoreData.dataType),
        scoreData.source.toLowerCase(),
      ]
        .filter(Boolean)
        .join(" · ");

      return {
        value: key,
        label: `${scoreData.name} (${suffix})`,
      };
    });
  }, [scoreAnalyticsOptions, scoreKeyToData]);

  return (
    <div className={props.className}>
      <div className="group flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold">Scores Analytics</h3>
            <p className="text-muted-foreground text-sm">
              Aggregate scores and averages over time
            </p>
          </div>
          <div className="text-muted-foreground flex items-center gap-2">
            {props.actions?.draggable && (
              <GripVerticalIcon
                size="base"
                __rawClassName="drag-handle hidden cursor-grab active:cursor-grabbing lg:block"
              />
            )}
            {props.actions?.buttons?.map(
              ({ id, label, icon: Icon, onClick, disabled }) => (
                <button
                  key={id}
                  type="button"
                  aria-label={label}
                  title={label}
                  onClick={onClick}
                  disabled={disabled}
                  className="hover:text-foreground disabled:opacity-50"
                >
                  <Icon size="base" />
                </button>
              ),
            )}
            {Boolean(props.actions?.menu?.length) && (
              <DropdownMenu
                placement="bottom-end"
                items={props.actions?.menu ?? []}
              >
                {({ getTriggerProps }) => (
                  <button
                    type="button"
                    aria-label="Widget actions"
                    className="hover:text-foreground"
                    {...getTriggerProps()}
                  >
                    <MoreVerticalIcon size="base" />
                  </button>
                )}
              </DropdownMenu>
            )}
          </div>
        </div>
        {!props.isLoading &&
          !scoreKeysAndProps.isPending &&
          Boolean(scoreSelectorOptions.length) && (
            <div className="w-full max-w-80">
              <MultiSelectTagInput
                aria-label="Scores"
                value={scoreAnalyticsValues.map(({ key }) => key)}
                options={scoreSelectorOptions}
                onValueChange={setSelectedDashboardScoreKeys}
                placeholder="Select scores"
                searchPlaceholder="Search scores..."
                emptyMessage="No scores found."
              />
            </div>
          )}
        {(props.isLoading || scoreKeysAndProps.isPending) && (
          <VisualizationFrame
            content={{ type: "loading", progress: { type: "spinner" } }}
          />
        )}
        {!props.isLoading &&
          !scoreKeysAndProps.isPending &&
          scoreKeysAndProps.isError && (
            <VisualizationFrame
              content={{
                type: "error",
                message: scoreKeysAndProps.error.message,
              }}
            />
          )}
        {!props.isLoading &&
          !scoreKeysAndProps.isPending &&
          !scoreKeysAndProps.isError &&
          !scoreAnalyticsValues.length && (
            <VisualizationFrame
              content={{
                type: "empty",
                message: scoreSelectorOptions.length
                  ? "Select a score to view analytics"
                  : "No data",
              }}
            />
          )}
        {!props.isLoading &&
          !scoreKeysAndProps.isPending &&
          !scoreKeysAndProps.isError && (
            <div className="[&_text]:fill-muted-foreground [&_tspan]:fill-muted-foreground grid grid-flow-row gap-4">
              {scoreAnalyticsValues.map(({ key: scoreKey }, index) => {
                const scoreData = scoreKeyToData.get(scoreKey);
                if (!scoreData) return null;
                const { name, dataType, source } = scoreData;

                return (
                  <div key={scoreKey}>
                    <div>{`${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`}</div>
                    <div className="mt-2 grid gap-2 lg:grid-cols-2 lg:gap-4">
                      {/* aggregate */}
                      <div className="h-96 min-w-0">
                        {isCategoricalDataType(dataType) && (
                          <CategoricalScoreCard
                            projectId={props.projectId}
                            scoreData={scoreData}
                            globalFilterState={props.globalFilterState}
                            fromTimestamp={props.fromTimestamp}
                            toTimestamp={props.toTimestamp}
                            metricsVersion={props.metricsVersion}
                            schedulerId={props.schedulerId}
                          />
                        )}
                        {(isNumericDataType(dataType) ||
                          isBooleanDataType(dataType)) && (
                          <NumericScoreHistogramCard
                            projectId={props.projectId}
                            source={source}
                            name={name}
                            dataType={
                              dataType as Extract<
                                ScoreDataTypeType,
                                "NUMERIC" | "BOOLEAN"
                              >
                            }
                            globalFilterState={props.globalFilterState}
                            metricsVersion={props.metricsVersion}
                          />
                        )}
                      </div>
                      {/* timeseries */}
                      <div className="h-96 min-w-0">
                        {isCategoricalDataType(dataType) && (
                          <CategoricalScoreCard
                            projectId={props.projectId}
                            agg={props.agg}
                            scoreData={scoreData}
                            globalFilterState={props.globalFilterState}
                            fromTimestamp={props.fromTimestamp}
                            toTimestamp={props.toTimestamp}
                            metricsVersion={props.metricsVersion}
                            schedulerId={props.schedulerId}
                          />
                        )}
                        {(isNumericDataType(dataType) ||
                          isBooleanDataType(dataType)) && (
                          <NumericScoreTimeSeriesCard
                            agg={props.agg}
                            source={source}
                            name={name}
                            dataType={
                              dataType as Extract<
                                ScoreDataTypeType,
                                "NUMERIC" | "BOOLEAN"
                              >
                            }
                            projectId={props.projectId}
                            globalFilterState={props.globalFilterState}
                            fromTimestamp={props.fromTimestamp}
                            toTimestamp={props.toTimestamp}
                            metricsVersion={props.metricsVersion}
                            schedulerId={props.schedulerId}
                            syncId={props.syncId}
                            sync={props.sync}
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
          )}
      </div>
    </div>
  );
}
