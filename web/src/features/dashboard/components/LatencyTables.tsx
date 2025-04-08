import { RightAlignedCell } from "@/src/features/dashboard/components/RightAlignedCell";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { DashboardTable } from "@/src/features/dashboard/components/cards/DashboardTable";
import { type FilterState } from "@langfuse/shared";
import { api } from "@/src/utils/api";

import { formatIntervalSeconds } from "@/src/utils/dates";
import { truncate } from "@/src/utils/string";
import { Popup } from "@/src/components/layouts/doc-popup";
import {
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";

export const LatencyTables = ({
  projectId,
  globalFilterState,
  fromTimestamp,
  toTimestamp,
  isLoading = false,
}: {
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  isLoading?: boolean;
}) => {
  const generationsLatenciesQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "name" }],
    metrics: [
      { measure: "latency", aggregation: "p50" },
      { measure: "latency", aggregation: "p90" },
      { measure: "latency", aggregation: "p95" },
      { measure: "latency", aggregation: "p99" },
    ],
    filters: [
      ...mapLegacyUiTableFilterToView("observations", globalFilterState),
      {
        column: "type",
        operator: "=",
        value: "GENERATION",
        type: "string",
      },
    ],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: [{ field: "p95_latency", direction: "desc" }],
  };

  const generationsLatencies = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: generationsLatenciesQuery,
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

  const spansLatenciesQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "name" }],
    metrics: [
      { measure: "latency", aggregation: "p50" },
      { measure: "latency", aggregation: "p90" },
      { measure: "latency", aggregation: "p95" },
      { measure: "latency", aggregation: "p99" },
    ],
    filters: [
      ...mapLegacyUiTableFilterToView("observations", globalFilterState),
      {
        column: "type",
        operator: "=",
        value: "SPAN",
        type: "string",
      },
    ],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: [{ field: "p95_latency", direction: "desc" }],
  };

  const spansLatencies = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: spansLatenciesQuery,
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

  const tracesLatenciesQuery: QueryType = {
    view: "traces",
    dimensions: [{ field: "name" }],
    metrics: [
      { measure: "latency", aggregation: "p50" },
      { measure: "latency", aggregation: "p90" },
      { measure: "latency", aggregation: "p95" },
      { measure: "latency", aggregation: "p99" },
    ],
    filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: [{ field: "p95_latency", direction: "desc" }],
  };

  const tracesLatencies = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: tracesLatenciesQuery,
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

  const generateLatencyData = (data?: Record<string, unknown>[]) => {
    return data
      ? data
          .filter((item) => item.name !== null)
          .map((item, i) => [
            <div key={`${item.name as string}-${i}`}>
              <Popup
                triggerContent={truncate(item.name as string)}
                description={item.name as string}
              />
            </div>,
            <RightAlignedCell key={`${i}-p50`}>
              {item.p50_latency
                ? formatIntervalSeconds(Number(item.p50_latency) / 1000, 3)
                : "-"}
            </RightAlignedCell>,
            <RightAlignedCell key={`${i}-p90`}>
              {item.p90_latency
                ? formatIntervalSeconds(Number(item.p90_latency) / 1000, 3)
                : "-"}
            </RightAlignedCell>,
            <RightAlignedCell key={`${i}-p95`}>
              {item.p95_latency
                ? formatIntervalSeconds(Number(item.p95_latency) / 1000, 3)
                : "-"}
            </RightAlignedCell>,
            <RightAlignedCell key={`${i}-p99`}>
              {item.p99_latency
                ? formatIntervalSeconds(Number(item.p99_latency) / 1000, 3)
                : "-"}
            </RightAlignedCell>,
          ])
      : [];
  };

  return (
    <>
      <DashboardCard
        className="col-span-1 xl:col-span-2"
        title="Trace latency percentiles"
        isLoading={isLoading || tracesLatencies.isLoading}
      >
        <DashboardTable
          headers={[
            "Trace Name",
            <RightAlignedCell key="p50">p50</RightAlignedCell>,
            <RightAlignedCell key="p90">p90</RightAlignedCell>,
            <RightAlignedCell key="p95">
              p95<span className="ml-1">▼</span>
            </RightAlignedCell>,
            <RightAlignedCell key="p99">p99</RightAlignedCell>,
          ]}
          rows={generateLatencyData(tracesLatencies.data)}
          isLoading={isLoading || tracesLatencies.isLoading}
          collapse={{ collapsed: 5, expanded: 20 }}
        />
      </DashboardCard>
      <DashboardCard
        className="col-span-1 xl:col-span-2"
        title="Generation latency percentiles"
        isLoading={isLoading || generationsLatencies.isLoading}
      >
        <DashboardTable
          headers={[
            "Generation Name",
            <RightAlignedCell key="p50">p50</RightAlignedCell>,
            <RightAlignedCell key="p90">p90</RightAlignedCell>,
            <RightAlignedCell key="p95">
              p95<span className="ml-1">▼</span>
            </RightAlignedCell>,
            <RightAlignedCell key="p99">p99</RightAlignedCell>,
          ]}
          rows={generateLatencyData(generationsLatencies.data)}
          isLoading={isLoading || generationsLatencies.isLoading}
          collapse={{ collapsed: 5, expanded: 20 }}
        />
      </DashboardCard>
      <DashboardCard
        className="col-span-1 xl:col-span-2"
        title="Span latency percentiles"
        isLoading={isLoading || spansLatencies.isLoading}
      >
        <DashboardTable
          headers={[
            "Span Name",
            <RightAlignedCell key="p50">p50</RightAlignedCell>,
            <RightAlignedCell key="p90">p90</RightAlignedCell>,
            <RightAlignedCell key="p95">
              p95<span className="ml-1">▼</span>
            </RightAlignedCell>,
            <RightAlignedCell key="p99">p99</RightAlignedCell>,
          ]}
          rows={generateLatencyData(spansLatencies.data)}
          isLoading={isLoading || spansLatencies.isLoading}
          collapse={{ collapsed: 5, expanded: 20 }}
        />
      </DashboardCard>
    </>
  );
};
