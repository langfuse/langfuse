/* eslint-disable @repo/no-style-props */
import {
  DataCard,
  type DataCardActions,
} from "@/src/components/design-system/DataCard/DataCard";
import {
  type ScoreDataTypeType,
  type ScoreSourceType,
  type FilterState,
} from "@langfuse/shared";
import { type ViewVersion } from "@langfuse/shared/query";
import { api } from "@/src/utils/api";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";
import { createTracesTimeFilter } from "@/src/features/dashboard/lib/dashboard-utils";
import { getScoreDataTypeIcon } from "@/src/features/scores/lib/scoreColumns";
import {
  isBooleanDataType,
  isCategoricalDataType,
  isNumericDataType,
} from "@/src/features/scores/lib/helpers";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";

const dropValuesForCategoricalScores = (
  value: number,
  scoreDataType: ScoreDataTypeType,
): string => {
  if (isCategoricalDataType(scoreDataType)) return "-";
  if (isBooleanDataType(scoreDataType) || isNumericDataType(scoreDataType)) {
    return compactNumberFormatter(value);
  }
  return "-";
};

const scoreNameSourceDataTypeMatch =
  (
    scoreName: string,
    scoreSource: ScoreSourceType,
    scoreDataType: ScoreDataTypeType,
  ) =>
  (item: DatabaseRow) =>
    item.scoreName === scoreName &&
    item.scoreSource === scoreSource &&
    item.scoreDataType === scoreDataType;

export const ScoresTableCard = ({
  actions,
  className,
  projectId,
  globalFilterState,
  isLoading = false,
  metricsVersion,
}: {
  actions?: DataCardActions;
  className: string;
  projectId: string;
  globalFilterState: FilterState;
  isLoading?: boolean;
  metricsVersion: ViewVersion;
}) => {
  const localFilters = createTracesTimeFilter(
    globalFilterState,
    "scoreTimestamp",
  );

  const metrics = api.dashboard.chart.useQuery(
    {
      projectId,
      from: "traces_scores",
      select: [
        { column: "scoreName" },
        { column: "scoreId", agg: "COUNT" },
        { column: "value", agg: "AVG" },
        { column: "scoreSource" },
        { column: "scoreDataType" },
      ],
      filter: localFilters,
      groupBy: [
        { type: "string", column: "scoreName" },
        {
          type: "string",
          column: "scoreSource",
        },
        {
          type: "string",
          column: "scoreDataType",
        },
      ],
      orderBy: [{ column: "scoreId", direction: "DESC", agg: "COUNT" }],
      queryName: "score-aggregate",
      version: metricsVersion,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: !isLoading,
    },
  );

  const [zeroValueScores, oneValueScores] = [0, 1].map((i) =>
    api.dashboard.chart.useQuery(
      {
        projectId,
        from: "traces_scores",
        select: [
          { column: "scoreName" },
          { column: "scoreId", agg: "COUNT" },
          { column: "scoreSource" },
          { column: "scoreDataType" },
        ],
        filter: [
          ...localFilters,
          {
            column: "value",
            operator: "=",
            value: i,
            type: "number",
          },
        ],
        groupBy: [
          { type: "string", column: "scoreName" },
          {
            type: "string",
            column: "scoreSource",
          },
          {
            type: "string",
            column: "scoreDataType",
          },
        ],
        orderBy: [{ column: "scoreId", direction: "DESC", agg: "COUNT" }],
        queryName: "score-aggregate",
        version: metricsVersion,
      },
      {
        trpc: {
          context: {
            skipBatch: true,
          },
        },
        enabled: !isLoading,
      },
    ),
  );

  if (!zeroValueScores || !oneValueScores) {
    return (
      <DataCard content={{ type: "empty" }} title="Scores" actions={actions} />
    );
  }

  const joinRequestData = () => {
    if (!metrics.data || !zeroValueScores.data || !oneValueScores.data)
      return [];

    return metrics.data.map((metric) => {
      const scoreName = metric.scoreName as string;
      const scoreSource = metric.scoreSource as ScoreSourceType;
      const scoreDataType = metric.scoreDataType as ScoreDataTypeType;

      const zeroValueScore = zeroValueScores.data.find(
        scoreNameSourceDataTypeMatch(scoreName, scoreSource, scoreDataType),
      );
      const oneValueScore = oneValueScores.data.find(
        scoreNameSourceDataTypeMatch(scoreName, scoreSource, scoreDataType),
      );

      return {
        scoreName,
        scoreSource,
        scoreDataType,
        countScoreId: metric.countScoreId ? metric.countScoreId : 0,
        avgValue: metric.avgValue ? (metric.avgValue as number) : 0,
        zeroValueScore: zeroValueScore?.countScoreId
          ? zeroValueScore.countScoreId
          : 0,
        oneValueScore: oneValueScore?.countScoreId
          ? (oneValueScore.countScoreId as number)
          : 0,
      };
    });
  };

  const data = joinRequestData();

  const totalScores = data.reduce(
    (acc, curr) => acc + (curr.countScoreId as number),
    0,
  );

  const isPending =
    isLoading ||
    metrics.isPending ||
    zeroValueScores.isPending ||
    oneValueScores.isPending;
  return (
    <div className={cn(className, "h-full")}>
      <DataCard
        actions={actions}
        title="Scores"
        content={(() => {
          const columns = [
            { id: "name", label: "Name" },
            { id: "count", label: "#", align: "right" as const },
            { id: "average", label: "Avg", align: "right" as const },
            { id: "zero", label: "0", align: "right" as const },
            { id: "one", label: "1", align: "right" as const },
          ];
          if (isPending)
            return {
              type: "loading",
              skeleton: "table",
              columns,
              collapse: { collapsed: 5, expanded: 20 },
              progress: { type: "spinner" },
            };
          if (!data.length)
            return {
              type: "empty",
              description:
                "Scores evaluate LLM quality and can be created manually or using the SDK.",
              href: "https://langfuse.com/docs/evaluation/overview",
            };
          return {
            type: "table",
            columns,
            rows: data.map((item) => ({
              id: JSON.stringify([
                item.scoreName,
                item.scoreDataType,
                item.scoreSource,
              ]),
              cells: [
                {
                  columnId: "name",
                  value: `${getScoreDataTypeIcon(item.scoreDataType)} ${item.scoreName} (${item.scoreSource.toLowerCase()})`,
                },
                {
                  columnId: "count",
                  value: compactNumberFormatter(item.countScoreId as number),
                },
                {
                  columnId: "average",
                  value: dropValuesForCategoricalScores(
                    item.avgValue,
                    item.scoreDataType,
                  ),
                },
                {
                  columnId: "zero",
                  value: dropValuesForCategoricalScores(
                    item.zeroValueScore as number,
                    item.scoreDataType,
                  ),
                },
                {
                  columnId: "one",
                  value: dropValuesForCategoricalScores(
                    item.oneValueScore,
                    item.scoreDataType,
                  ),
                },
              ],
            })),
            collapse: { collapsed: 5, expanded: 20 },
          };
        })()}
        metric={{
          value: totalScores ? compactNumberFormatter(totalScores) : "0",
          description: "Total scores tracked",
        }}
      />
    </div>
  );
};
