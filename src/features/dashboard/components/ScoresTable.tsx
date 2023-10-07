import { api } from "@/src/utils/api";
import { type FilterState } from "@/src/features/filters/types";
import { TotalMetric } from "./TotalMetric";
import { numberFormatter } from "@/src/utils/numbers";
import { DashboardTable } from "@/src/features/dashboard/components/DashboardTable";
import { DashboardCard } from "@/src/features/dashboard/components/DashboardCard";
import { NoData } from "@/src/features/dashboard/components/NoData";
import { RightAlighnedCell } from "./RightAlighnedCell";

export const ScoresTable = ({
  className,
  projectId,
  globalFilterState,
}: {
  className: string;
  projectId: string;
  globalFilterState: FilterState;
}) => {
  const localFilters = globalFilterState.map((f) => ({
    ...f,
    column: "timestamp",
  }));

  const metrics = api.dashboard.chart.useQuery({
    projectId,
    from: "traces_scores",
    select: [
      { column: "scoreName", agg: null },
      { column: "scoreId", agg: "COUNT" },
      { column: "value", agg: "AVG" },
    ],
    filter: localFilters ?? [],
    groupBy: [{ type: "string", column: "scoreName" }],
    orderBy: [{ column: "scoreId", direction: "DESC", agg: "COUNT" }],
    limit: null,
  });

  const [zeroValueScores, oneValueScores] = [0, 1].map((i) =>
    api.dashboard.chart.useQuery({
      projectId,
      from: "traces_scores",
      select: [
        { column: "scoreName", agg: null },
        { column: "scoreId", agg: "COUNT" },
      ],
      filter:
        [
          ...localFilters,
          {
            column: "value",
            operator: "=",
            value: i,
            type: "number",
          },
        ] ?? [],
      groupBy: [{ type: "string", column: "scoreName" }],
      orderBy: [{ column: "scoreId", direction: "DESC", agg: "COUNT" }],
      limit: null,
    }),
  );

  if (!zeroValueScores || !oneValueScores) {
    return (
      <DashboardCard title={"Scores"} isLoading={false}>
        <NoData noDataText="No data" />
      </DashboardCard>
    );
  }

  const joinRequestData = () => {
    if (!metrics.data || !zeroValueScores.data || !oneValueScores.data)
      return [];

    return metrics.data.map((metric) => {
      const scoreName = metric.scoreName as string;

      const zeroValueScore = zeroValueScores.data.find(
        (item) => item.scoreName === scoreName,
      );
      const oneValueScore = oneValueScores.data.find(
        (item) => item.scoreName === scoreName,
      );

      return {
        scoreName: metric.scoreName as string,
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

  const joinedData = joinRequestData();
  const totalScores = joinedData.reduce(
    (acc, curr) => acc + (curr.countScoreId as number),
    0,
  );

  return (
    <DashboardTable
      className={className}
      title="Scores"
      isLoading={
        metrics.isLoading ||
        zeroValueScores.isLoading ||
        oneValueScores.isLoading
      }
      headers={[
        "Name",
        <RightAlighnedCell key={1}>Count</RightAlighnedCell>,
        <RightAlighnedCell key={1}>Average</RightAlighnedCell>,
        <RightAlighnedCell key={1}>0</RightAlighnedCell>,
        <RightAlighnedCell key={1}>1</RightAlighnedCell>,
      ]}
      rows={
        joinedData.map((item, i) => [
          item.scoreName,
          <RightAlighnedCell key={i}>
            {numberFormatter(item.countScoreId as number)}
          </RightAlighnedCell>,
          <RightAlighnedCell key={i}>
            {numberFormatter(item.avgValue)}
          </RightAlighnedCell>,
          <RightAlighnedCell key={i}>
            {numberFormatter(item.zeroValueScore as number)}
          </RightAlighnedCell>,
          <RightAlighnedCell key={i}>
            {numberFormatter(item.oneValueScore)}
          </RightAlighnedCell>,
        ]) ?? []
      }
    >
      <TotalMetric
        metric={totalScores ? numberFormatter(totalScores) : "0"}
        description="Scores tracked"
      />
    </DashboardTable>
  );
};
