/* eslint-disable @repo/no-style-props */
import {
  DataCard,
  type DataCardActions,
} from "@/src/components/design-system/DataCard/DataCard";
import {
  ObservationType,
  type FilterState,
  getGenerationLikeTypes,
} from "@langfuse/shared";

import { formatIntervalSeconds } from "@/src/utils/dates";

import { cn } from "@/src/utils/tailwind";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";

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
        .map((item) => ({
          id: JSON.stringify([item.type, item[nameField]]),
          cells: [
            {
              columnId: "name",
              value: String(item[nameField]),
              prefix: item.type ? String(item.type) : undefined,
              truncateAt: 16,
              detail: item.type
                ? `${String(item.type)} · ${String(item[nameField])}`
                : String(item[nameField]),
            },
            {
              columnId: "p50",
              value: item.p50_latency
                ? formatIntervalSeconds(Number(item.p50_latency) / 1000, 2)
                : "-",
            },
            {
              columnId: "p90",
              value: item.p90_latency
                ? formatIntervalSeconds(Number(item.p90_latency) / 1000, 2)
                : "-",
            },
            {
              columnId: "p95",
              value: item.p95_latency
                ? formatIntervalSeconds(Number(item.p95_latency) / 1000, 2)
                : "-",
            },
            {
              columnId: "p99",
              value: item.p99_latency
                ? formatIntervalSeconds(Number(item.p99_latency) / 1000, 2)
                : "-",
            },
          ],
        }))
    : [];
};

export const LatencyTableCard = ({
  actions,
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
  actions?: DataCardActions;
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

  const rows = generateLatencyData(nameField(metricsVersion), latencies.data);

  return (
    <div className={cn(className, "h-full")}>
      <DataCard
        actions={actions}
        title={title(metricsVersion)}
        content={(() => {
          if (isLoading || latencies.isPending)
            return { type: "loading", progress: { type: "spinner" } };
          if (!rows.length) return { type: "empty" };
          return {
            type: "table",
            columns: [
              { id: "name", label: nameHeader },
              { id: "p50", label: "p50", align: "right" },
              { id: "p90", label: "p90", align: "right" },
              { id: "p95", label: "p95", align: "right", sort: "desc" },
              { id: "p99", label: "p99", align: "right" },
            ],
            rows,
            collapse: { collapsed: 5, expanded: 20 },
          };
        })()}
      />
    </div>
  );
};
