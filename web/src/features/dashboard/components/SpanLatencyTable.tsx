import { RightAlignedCell } from "@/src/features/dashboard/components/RightAlignedCell";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { DashboardTable } from "@/src/features/dashboard/components/cards/DashboardTable";
import { type FilterState } from "@/src/features/filters/types";
import { api } from "@/src/utils/api";

import { type DatabaseRow } from "@/src/server/api/services/query-builder";
import { formatIntervalSeconds } from "@/src/utils/dates";

export const LatencyTables = ({
  className,
  projectId,
  globalFilterState,
}: {
  className: string;
  projectId: string;
  globalFilterState: FilterState;
}) => {
  const generationsLatencies = api.dashboard.chart.useQuery(
    {
      projectId,
      from: "observations",
      select: [
        { column: "duration", agg: "50thPercentile" },
        { column: "duration", agg: "75thPercentile" },
        { column: "duration", agg: "90thPercentile" },
        { column: "duration", agg: "95thPercentile" },
        { column: "duration", agg: "99thPercentile" },
        { column: "name" },
      ],
      filter: [
        ...globalFilterState,
        {
          type: "string",
          column: "type",
          operator: "=",
          value: "GENERATION",
        },
      ],
      groupBy: [{ type: "string", column: "name" }],
      orderBy: [
        { column: "duration", agg: "95thPercentile", direction: "DESC" },
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

  const spansLatencies = api.dashboard.chart.useQuery(
    {
      projectId,
      from: "observations",
      select: [
        { column: "duration", agg: "50thPercentile" },
        { column: "duration", agg: "75thPercentile" },
        { column: "duration", agg: "90thPercentile" },
        { column: "duration", agg: "95thPercentile" },
        { column: "duration", agg: "99thPercentile" },
        { column: "name" },
      ],
      filter: [
        ...globalFilterState,
        {
          type: "string",
          column: "type",
          operator: "=",
          value: "SPAN",
        },
      ],
      groupBy: [{ type: "string", column: "name" }],
      orderBy: [
        { column: "duration", agg: "95thPercentile", direction: "DESC" },
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

  const generateLatencyData = (data?: DatabaseRow[]) => {
    return data
      ? data
          .filter((item) => item.name !== null)
          .map((item, i) => [
            item.name as string,
            ...[
              "percentile50Duration",
              "percentile75Duration",
              "percentile90Duration",
              "percentile95Duration",
              "percentile99Duration",
            ].map((percentile) => (
              <RightAlignedCell key={`${i}-${percentile}`}>
                {item[percentile]
                  ? formatIntervalSeconds(item[percentile] as number, 4)
                  : "-"}
              </RightAlignedCell>
            )),
          ])
      : [];
  };

  return (
    <>
      <DashboardCard
        className={className}
        title="Generation latencies"
        isLoading={generationsLatencies.isLoading}
      >
        <DashboardTable
          headers={[
            "Generation Name",
            <RightAlignedCell key="50th">50th</RightAlignedCell>,
            <RightAlignedCell key="75th">75th</RightAlignedCell>,
            <RightAlignedCell key="90th">90th</RightAlignedCell>,
            <RightAlignedCell key="95th">
              95th<span className="ml-1">▼</span>
            </RightAlignedCell>,
            <RightAlignedCell key="99th">99th</RightAlignedCell>,
          ]}
          rows={generateLatencyData(generationsLatencies.data)}
          collapse={{ collapsed: 5, expanded: 20 }}
        />
      </DashboardCard>
      <DashboardCard
        className={className}
        title="Span latencies"
        isLoading={spansLatencies.isLoading}
      >
        <DashboardTable
          headers={[
            "Span Name",
            <RightAlignedCell key="50th">50th</RightAlignedCell>,
            <RightAlignedCell key="75th">75th</RightAlignedCell>,
            <RightAlignedCell key="90th">90th</RightAlignedCell>,
            <RightAlignedCell key="95th">
              95th<span className="ml-1">▼</span>
            </RightAlignedCell>,
            <RightAlignedCell key="99th">99th</RightAlignedCell>,
          ]}
          rows={generateLatencyData(spansLatencies.data)}
          collapse={{ collapsed: 5, expanded: 20 }}
        />
      </DashboardCard>
    </>
  );
};
