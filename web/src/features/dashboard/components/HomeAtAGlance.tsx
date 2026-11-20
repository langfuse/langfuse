import Link from "next/link";
import { type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, LayoutDashboard } from "@langfuse/icons";
import {
  type FilterState,
  type ScoreDataTypeType,
  getGenerationLikeTypes,
} from "@langfuse/shared";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";

import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import {
  createTracesTimeFilter,
  traceViewQuery,
} from "@/src/features/dashboard/lib/dashboard-utils";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { isCategoricalDataType } from "@/src/features/scores/lib/helpers";
import { api } from "@/src/utils/api";
import {
  compactNumberFormatter,
  costFormatter,
  numberFormatter,
} from "@/src/utils/numbers";

// Same row limit as the Home presets these cards summarise, so a dashboard
// that shows them shares one cache entry with this section.
const PRESET_ROW_LIMIT = 20;
const ROWS_SHOWN = 3;

function GlanceCard({
  title,
  href,
  value,
  caption,
  isPending,
  isEmpty,
  children,
}: {
  title: string;
  href: string;
  value: string;
  caption: string;
  isPending: boolean;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <article className="bg-card flex flex-col gap-4 rounded-lg border p-5">
      <h3 className="text-base font-bold">
        <Link
          href={href}
          className="inline-flex items-center gap-1 underline-offset-3 hover:underline"
        >
          <span>{title}</span>
          <ArrowUpRight size="sm" color="muted" aria-hidden />
        </Link>
      </h3>
      {isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            <span className="text-3xl font-bold">{value}</span>
            <span className="text-muted-foreground text-sm">{caption}</span>
          </div>
          {isEmpty ? (
            <p className="text-muted-foreground text-sm">
              No data in this time range
            </p>
          ) : (
            children
          )}
        </>
      )}
    </article>
  );
}

function GlanceTable({
  columns,
  rows,
}: {
  columns: readonly [string, string, string];
  rows: { id: string; cells: readonly [string, string, string] }[];
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-muted-foreground">
          <th className="pb-1.25 text-left font-normal">{columns[0]}</th>
          <th className="pb-1.25 pl-5 text-right font-normal">{columns[1]}</th>
          <th className="pb-1.25 pl-5 text-right font-normal">{columns[2]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td
              className="w-full max-w-0 truncate py-1.25"
              title={row.cells[0]}
            >
              {row.cells[0]}
            </td>
            <td className="py-1.25 pl-5 text-right font-mono whitespace-nowrap">
              {row.cells[1]}
            </td>
            <td className="py-1.25 pl-5 text-right font-mono whitespace-nowrap">
              {row.cells[2]}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Home's summary under the Ask section: the three overview presets of the
 * Langfuse Home dashboard, reduced to a headline number and their top rows.
 */
export function HomeAtAGlance({
  projectId,
  dashboard,
  filterState,
  dateRange,
  metricsVersion,
  isLoading,
}: {
  projectId: string;
  dashboard: { id: string; name: string };
  filterState: FilterState;
  dateRange: { from: Date; to: Date } | undefined;
  metricsVersion: ViewVersion;
  isLoading: boolean;
}) {
  const isEnabled = !isLoading && dateRange !== undefined;
  const fromTimestamp = dateRange?.from.toISOString() ?? "";
  const toTimestamp = dateRange?.to.toISOString() ?? "";
  const queryOptions = {
    trpc: { context: { skipBatch: true } },
    enabled: isEnabled,
  };
  const dashboardHref = `/project/${projectId}/dashboards/${encodeURIComponent(dashboard.id)}`;

  const isV2 = metricsVersion === "v2";
  const traceNameField = isV2 ? "traceName" : "name";
  const traceCountField = isV2 ? "uniq_traceId" : "count_count";

  const totalTracesQuery: QueryType = {
    ...traceViewQuery({ metricsVersion, globalFilterState: filterState }),
    dimensions: [],
    timeDimension: null,
    fromTimestamp,
    toTimestamp,
    orderBy: null,
  };
  const totalTraces = useScheduledDashboardExecuteQuery(
    { projectId, query: totalTracesQuery, version: metricsVersion },
    { ...queryOptions, queryId: "home:at-a-glance:traces:total" },
  );

  const tracesByNameQuery: QueryType = {
    ...traceViewQuery({
      metricsVersion,
      globalFilterState: filterState,
      groupedByName: true,
    }),
    dimensions: [{ field: traceNameField }],
    timeDimension: null,
    fromTimestamp,
    toTimestamp,
    orderBy: [{ field: traceCountField, direction: "desc" }],
    chartConfig: { type: "table", row_limit: PRESET_ROW_LIMIT },
  };
  const tracesByName = useScheduledDashboardExecuteQuery(
    { projectId, query: tracesByNameQuery, version: metricsVersion },
    { ...queryOptions, queryId: "home:at-a-glance:traces:grouped" },
  );

  const modelCostQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "providedModelName" }],
    metrics: [
      { measure: "totalCost", aggregation: "sum" },
      { measure: "totalTokens", aggregation: "sum" },
    ],
    filters: [
      ...mapLegacyUiTableFilterToView("observations", filterState),
      {
        column: "type",
        operator: "any of",
        value: getGenerationLikeTypes(),
        type: "stringOptions",
      },
    ],
    timeDimension: null,
    fromTimestamp,
    toTimestamp,
    orderBy: [{ field: "sum_totalCost", direction: "desc" }],
    chartConfig: { type: "table", row_limit: PRESET_ROW_LIMIT },
  };
  const modelCosts = useScheduledDashboardExecuteQuery(
    { projectId, query: modelCostQuery, version: metricsVersion },
    { ...queryOptions, queryId: "home:at-a-glance:model-costs" },
  );

  const scoreFilters: FilterState = dateRange
    ? [
        ...filterState,
        {
          type: "datetime",
          column: "startTime",
          operator: ">",
          value: dateRange.from,
        },
        {
          type: "datetime",
          column: "startTime",
          operator: "<",
          value: dateRange.to,
        },
      ]
    : filterState;
  const scores = api.dashboard.chart.useQuery(
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
      filter: createTracesTimeFilter(scoreFilters, "scoreTimestamp"),
      groupBy: [
        { type: "string", column: "scoreName" },
        { type: "string", column: "scoreSource" },
        { type: "string", column: "scoreDataType" },
      ],
      orderBy: [{ column: "scoreId", direction: "DESC", agg: "COUNT" }],
      queryName: "score-aggregate",
      version: metricsVersion,
    },
    queryOptions,
  );

  const totalTraceCount = Number(totalTraces.data?.[0]?.[traceCountField] ?? 0);
  const traceRows = (tracesByName.data ?? [])
    .slice(0, ROWS_SHOWN)
    .map((row) => ({
      name: row[traceNameField] ? String(row[traceNameField]) : "Unknown",
      count: Number(row[traceCountField]),
    }));

  const modelRows = (modelCosts.data ?? []).filter(
    (row) => row.providedModelName !== null,
  );
  const totalModelCost = (modelCosts.data ?? []).reduce(
    (total, row) => total + Number(row.sum_totalCost ?? 0),
    0,
  );

  const scoreRows = scores.data ?? [];
  const totalScoreCount = scoreRows.reduce(
    (total, row) => total + Number(row.countScoreId ?? 0),
    0,
  );

  return (
    <section
      aria-labelledby="home-at-a-glance-title"
      className="@container flex flex-col gap-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="home-at-a-glance-title" className="text-lg font-bold">
          At a glance
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <TextLink
            path={dashboardHref}
            value={`Open ${dashboard.name} dashboard`}
            icon={LayoutDashboard}
          />
          <TextLink
            path={`/project/${projectId}/dashboards`}
            value="All dashboards"
            icon={ArrowRight}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
        <GlanceCard
          title="Traces"
          href={`/project/${projectId}/traces`}
          value={compactNumberFormatter(totalTraceCount)}
          caption="Total traces tracked"
          isPending={
            !isEnabled || totalTraces.isPending || tracesByName.isPending
          }
          isEmpty={traceRows.length === 0}
        >
          <ul className="flex flex-col gap-2 text-sm">
            {traceRows.map((row) => (
              <li key={row.name} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate" title={row.name}>
                    {row.name}
                  </span>
                  <span className="text-foreground-secondary font-mono">
                    {numberFormatter(row.count, 0)}
                  </span>
                </div>
                {/* Share of all traces. An SVG so the width is an attribute. */}
                <svg aria-hidden className="text-muted-blue h-1.5 w-full">
                  <rect
                    width={`${totalTraceCount > 0 ? Math.max(1, (row.count / totalTraceCount) * 100) : 0}%`}
                    height="100%"
                    rx="3"
                    fill="currentColor"
                  />
                </svg>
              </li>
            ))}
          </ul>
        </GlanceCard>
        <GlanceCard
          title="Model costs"
          href={dashboardHref}
          value={costFormatter(totalModelCost)}
          caption="Total cost"
          isPending={!isEnabled || modelCosts.isPending}
          isEmpty={modelRows.length === 0}
        >
          <GlanceTable
            columns={["Model", "Tokens", "USD"]}
            rows={modelRows.slice(0, ROWS_SHOWN).map((row) => ({
              id: String(row.providedModelName),
              cells: [
                String(row.providedModelName),
                compactNumberFormatter(Number(row.sum_totalTokens ?? 0)),
                costFormatter(Number(row.sum_totalCost ?? 0)),
              ],
            }))}
          />
        </GlanceCard>
        <GlanceCard
          title="Scores"
          href={`/project/${projectId}/scores`}
          value={compactNumberFormatter(totalScoreCount)}
          caption="Total scores tracked"
          isPending={!isEnabled || scores.isPending}
          isEmpty={scoreRows.length === 0}
        >
          <GlanceTable
            columns={["Name", "#", "Avg"]}
            rows={scoreRows.slice(0, ROWS_SHOWN).map((row) => ({
              id: JSON.stringify([
                row.scoreName,
                row.scoreSource,
                row.scoreDataType,
              ]),
              cells: [
                `${String(row.scoreName)} (${String(row.scoreSource).toLowerCase()})`,
                numberFormatter(Number(row.countScoreId ?? 0), 0),
                isCategoricalDataType(row.scoreDataType as ScoreDataTypeType)
                  ? "–"
                  : compactNumberFormatter(Number(row.avgValue ?? 0)),
              ],
            }))}
          />
        </GlanceCard>
      </div>
    </section>
  );
}
