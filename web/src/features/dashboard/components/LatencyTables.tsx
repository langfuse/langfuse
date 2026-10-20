/* eslint-disable @repo/no-style-props, @repo/component-file-structure */
import { RightAlignedCell } from "@/src/features/dashboard/components/RightAlignedCell";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { DashboardTable } from "@/src/features/dashboard/components/cards/DashboardTable";
import {
  ObservationType,
  type FilterState,
  getGenerationLikeTypes,
} from "@langfuse/shared";

import { formatIntervalSeconds } from "@/src/utils/dates";
import { truncate } from "@/src/utils/string";
import { cn } from "@/src/utils/tailwind";
import { Popup } from "@/src/components/layouts/doc-popup";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/useDashboardQueryScheduler";

export type LatencyTableKind = "traces" | "generations" | "observations";

const LATENCY_TABLE_KINDS: Record<
  LatencyTableKind,
  {
    title: (metricsVersion: ViewVersion) => string;
    nameHeader: string;
    /** Result field that carries the row label. */
    nameField: (metricsVersion: ViewVersion) => string;
    buildQuery: (
      globalFilterState: FilterState,
      fromTimestamp: Date,
      toTimestamp: Date,
      metricsVersion: ViewVersion,
    ) => QueryType;
  }
> = {
  traces: {
    title: (metricsVersion) =>
      metricsVersion === "v2"
        ? "Root observation latency percentiles"
        : "Trace latency percentiles",
    nameHeader: "Trace Name",
    nameField: (metricsVersion) =>
      metricsVersion === "v2" ? "traceName" : "name",
    buildQuery: (
      globalFilterState,
      fromTimestamp,
      toTimestamp,
      metricsVersion,
    ) => ({
      // v2 reads each trace's latency from its root observation instead of
      // grouping every event in the window by trace. A trace whose only root
      // is the synthetic trace span (no end time) has no root latency.
      ...(metricsVersion === "v2"
        ? {
            view: "observations",
            dimensions: [{ field: "traceName" }],
            filters: [
              ...mapLegacyUiTableFilterToView(
                "observations",
                globalFilterState,
              ),
              {
                column: "isRootObservation",
                operator: "=",
                value: true,
                type: "boolean",
              },
            ],
          }
        : {
            view: "traces",
            dimensions: [{ field: "name" }],
            filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
          }),
      metrics: [
        { measure: "latency", aggregation: "p50" },
        { measure: "latency", aggregation: "p90" },
        { measure: "latency", aggregation: "p95" },
        { measure: "latency", aggregation: "p99" },
      ],
      timeDimension: null,
      fromTimestamp: fromTimestamp.toISOString(),
      toTimestamp: toTimestamp.toISOString(),
      orderBy: [{ field: "p95_latency", direction: "desc" }],
      chartConfig: { type: "table", row_limit: 20 },
    }),
  },
  generations: {
    title: () => "Generation latency percentiles",
    nameHeader: "Generation Name",
    nameField: () => "name",
    buildQuery: (globalFilterState, fromTimestamp, toTimestamp) => ({
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
          operator: "any of",
          value: getGenerationLikeTypes(),
          type: "stringOptions",
        },
      ],
      timeDimension: null,
      fromTimestamp: fromTimestamp.toISOString(),
      toTimestamp: toTimestamp.toISOString(),
      orderBy: [{ field: "p95_latency", direction: "desc" }],
      chartConfig: { type: "table", row_limit: 20 },
    }),
  },
  observations: {
    title: () => "Observation latency percentiles",
    nameHeader: "Observation",
    nameField: () => "name",
    buildQuery: (globalFilterState, fromTimestamp, toTimestamp) => ({
      view: "observations",
      dimensions: [{ field: "type" }, { field: "name" }],
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
          operator: "none of",
          value: [ObservationType.GENERATION],
          type: "stringOptions",
        },
      ],
      timeDimension: null,
      fromTimestamp: fromTimestamp.toISOString(),
      toTimestamp: toTimestamp.toISOString(),
      orderBy: [{ field: "p95_latency", direction: "desc" }],
      chartConfig: { type: "table", row_limit: 20 },
    }),
  },
};

const generateLatencyData = (
  nameField: string,
  data?: Record<string, unknown>[],
) => {
  return data
    ? data
        .filter((item) => item[nameField] !== null)
        .map((item, i) => [
          <div key={`${item[nameField] as string}-${i}`}>
            <Popup
              triggerContent={
                item.type ? (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
                      {String(item.type)}
                    </span>
                    <span>{truncate(item[nameField] as string)}</span>
                  </div>
                ) : (
                  truncate(item[nameField] as string)
                )
              }
              description={
                item.type
                  ? `${String(item.type)} · ${item[nameField] as string}`
                  : (item[nameField] as string)
              }
            />
          </div>,
          <RightAlignedCell key={`${i}-p50`}>
            {item.p50_latency
              ? formatIntervalSeconds(Number(item.p50_latency) / 1000, 2)
              : "-"}
          </RightAlignedCell>,
          <RightAlignedCell key={`${i}-p90`}>
            {item.p90_latency
              ? formatIntervalSeconds(Number(item.p90_latency) / 1000, 2)
              : "-"}
          </RightAlignedCell>,
          <RightAlignedCell key={`${i}-p95`}>
            {item.p95_latency
              ? formatIntervalSeconds(Number(item.p95_latency) / 1000, 2)
              : "-"}
          </RightAlignedCell>,
          <RightAlignedCell key={`${i}-p99`}>
            {item.p99_latency
              ? formatIntervalSeconds(Number(item.p99_latency) / 1000, 2)
              : "-"}
          </RightAlignedCell>,
        ])
    : [];
};

export const LatencyTable = ({
  kind,
  className,
  projectId,
  globalFilterState,
  fromTimestamp,
  toTimestamp,
  isLoading = false,
  metricsVersion,
  schedulerId,
}: {
  kind: LatencyTableKind;
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  isLoading?: boolean;
  metricsVersion: ViewVersion;
  schedulerId?: string;
}) => {
  const { title, nameHeader, nameField, buildQuery } =
    LATENCY_TABLE_KINDS[kind];

  const latencies = useScheduledDashboardExecuteQuery(
    {
      projectId,
      query: buildQuery(
        globalFilterState,
        fromTimestamp,
        toTimestamp,
        metricsVersion,
      ),
      version: metricsVersion,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      queryId: schedulerId ?? `home:latency-table-${kind}`,
      enabled: !isLoading,
    },
  );

  return (
    <DashboardCard
      // h-full pins the card to the tile so the table fits its rows to the
      // AVAILABLE height instead of overflowing; min-h-0 lets the flex column
      // shrink so the row area scrolls internally. (LFE-11035)
      className={cn(className, "h-full")}
      cardContentClassName="min-h-0"
      title={title(metricsVersion)}
      isLoading={isLoading || latencies.isPending}
    >
      <DashboardTable
        headers={[
          nameHeader,
          <RightAlignedCell key="p50">p50</RightAlignedCell>,
          <RightAlignedCell key="p90">p90</RightAlignedCell>,
          <RightAlignedCell key="p95">
            p95<span className="ml-1">▼</span>
          </RightAlignedCell>,
          <RightAlignedCell key="p99">p99</RightAlignedCell>,
        ]}
        rows={generateLatencyData(nameField(metricsVersion), latencies.data)}
        isLoading={isLoading || latencies.isPending}
        collapse={{ collapsed: 5, expanded: 20 }}
      />
    </DashboardCard>
  );
};
