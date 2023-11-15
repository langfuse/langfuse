import { api } from "@/src/utils/api";
import { type FilterState } from "@/src/features/filters/types";
import { TotalMetric } from "./TotalMetric";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { DashboardTable } from "@/src/features/dashboard/components/cards/DashboardTable";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { NoData } from "@/src/features/dashboard/components/NoData";
import { RightAlignedCell } from "./RightAlignedCell";
import DocPopup from "@/src/components/layouts/doc-popup";

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
      { column: "scoreName" },
      { column: "scoreId", agg: "COUNT" },
      { column: "value", agg: "AVG" },
    ],
    filter: localFilters ?? [],
    groupBy: [{ type: "string", column: "scoreName" }],
    orderBy: [{ column: "scoreId", direction: "DESC", agg: "COUNT" }],
  });

  const [zeroValueScores, oneValueScores] = [0, 1].map((i) =>
    api.dashboard.chart.useQuery({
      projectId,
      from: "traces_scores",
      select: [{ column: "scoreName" }, { column: "scoreId", agg: "COUNT" }],
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

  const data = joinRequestData();

  const totalScores = data.reduce(
    (acc, curr) => acc + (curr.countScoreId as number),
    0,
  );

  return (
    <DashboardCard
      className={className}
      title="Scores"
      isLoading={
        metrics.isLoading ||
        zeroValueScores.isLoading ||
        oneValueScores.isLoading
      }
    >
      <DashboardTable
        headers={[
          "Name",
          <RightAlignedCell key={0}>#</RightAlignedCell>,
          <RightAlignedCell key={0}>Avg</RightAlignedCell>,
          <RightAlignedCell key={0}>0</RightAlignedCell>,
          <RightAlignedCell key={0}>1</RightAlignedCell>,
        ]}
        rows={
          data.map((item, i) => [
            item.scoreName,
            <RightAlignedCell key={i}>
              {compactNumberFormatter(item.countScoreId as number)}
            </RightAlignedCell>,
            <RightAlignedCell key={i}>
              {compactNumberFormatter(item.avgValue)}
            </RightAlignedCell>,
            <RightAlignedCell key={i}>
              {compactNumberFormatter(item.zeroValueScore as number)}
            </RightAlignedCell>,
            <RightAlignedCell key={i}>
              {compactNumberFormatter(item.oneValueScore)}
            </RightAlignedCell>,
          ]) ?? []
        }
        collapse={{ collapsed: 5, expanded: 20 }}
        noDataChildren={
          <DocPopup
            description="Scores evaluate LLM quality and can be created manually or using the SDK."
            link="https://langfuse.com/docs/scores"
          />
        }
        noDataClassName="mt-0"
      >
        <TotalMetric
          metric={totalScores ? compactNumberFormatter(totalScores) : "0"}
          description="Total scores tracked"
        />
      </DashboardTable>
    </DashboardCard>
  );
};
