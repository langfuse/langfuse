import {
  type StudioResult,
  type StudioRow,
  type StudioWidgetConfig,
} from "@langfuse/shared";
import { type Visualization } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import {
  type ChartProps,
  type MetricFormatterFunction,
} from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  toFullMetricString,
  parseMetricUnit,
} from "@/src/features/widgets/chart-library/utils";
import { seriesColor } from "@/src/features/widgets/chart-library/seriesColors";
import { readableField } from "./catalog";
import { formatIntervalSeconds } from "@/src/utils/dates";

function chartDimension(
  row: StudioRow,
  config: StudioWidgetConfig,
  bucketUnit: string | undefined,
) {
  if (config.display.chartType === "HISTOGRAM") {
    const label = row.dimension ?? row.label;
    const suffix = bucketUnit === "milliseconds" ? "ms" : bucketUnit;
    const bin = suffix && label !== "No value" ? `${label} ${suffix}` : label;
    return `${row.label} · ${bin}`;
  }
  if (
    config.display.timeSeries ||
    config.display.chartType.endsWith("TIME_SERIES")
  )
    return row.seriesId;
  return row.label;
}

export function studioMetricFormatter(
  unit: string | undefined,
): MetricFormatterFunction {
  return (value, options) => {
    if (unit === "milliseconds" && Math.abs(value) >= 1000)
      return {
        main: `${value < 0 ? "-" : ""}${formatIntervalSeconds(Math.abs(value) / 1000)}`,
      };
    if (unit === "percent" || unit === "%")
      return {
        main: new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(
          value * 100,
        ),
        suffix: "%",
      };
    return formatMetric(value, { ...options, unit: parseMetricUnit(unit) });
  };
}

export function formatStudioValue(
  value: number | null,
  unit: string | undefined,
) {
  return value === null
    ? "—"
    : toFullMetricString(
        studioMetricFormatter(unit)(value, { style: "compact" }),
      );
}

export function prepareStudioChart(
  result: StudioResult | undefined,
  config: StudioWidgetConfig,
) {
  const availableSeries = (result?.series ?? []).filter((series) => {
    const query = config.queries.find((query) => query.id === series.queryId);
    const expression = config.expressions.find(
      (expression) =>
        expression.id === series.id || expression.id === series.queryId,
    );
    return (
      !query?.hidden &&
      !expression?.hidden &&
      (Boolean(expression) ||
        !config.display.activeQueryIds?.length ||
        config.display.activeQueryIds.includes(series.queryId))
    );
  });
  const hiddenIds = new Set(config.display.hiddenSeriesIds ?? []);
  const visibleSeries = availableSeries.filter(
    (series) => !hiddenIds.has(series.id),
  );
  const visibleIds = new Set(visibleSeries.map((series) => series.id));
  const seriesById = new Map(
    visibleSeries.map((series) => [series.id, series]),
  );
  const unitsByMetric = new Map(
    visibleSeries.map((series) => [
      `${series.queryId}.${series.metricId}`,
      series.unit,
    ]),
  );
  const selectedRows = (result?.rows ?? []).filter((row) =>
    visibleIds.has(row.seriesId),
  );
  const visibleMetricRefs = new Set(
    visibleSeries.map((series) => `${series.queryId}.${series.metricId}`),
  );
  const partiallyHiddenMetricRefs = new Set(
    availableSeries
      .filter(
        (series) =>
          hiddenIds.has(series.id) &&
          visibleMetricRefs.has(`${series.queryId}.${series.metricId}`),
      )
      .map((series) => `${series.queryId}.${series.metricId}`),
  );
  const visibilitySummaries = (result?.summaries ?? []).filter((row) =>
    visibleMetricRefs.has(`${row.queryId}.${row.metricId}`),
  );
  const summaries = visibilitySummaries.filter(
    (row) => !partiallyHiddenMetricRefs.has(`${row.queryId}.${row.metricId}`),
  );
  const data: ChartProps["data"] = selectedRows.map((row) => ({
    dimension: chartDimension(
      row,
      config,
      seriesById.get(row.seriesId)?.bucketUnit,
    ),
    time_dimension: row.time ?? undefined,
    metric: row.value,
  }));
  const colors = Object.fromEntries(
    visibleSeries.map((series, index) => [
      series.id,
      { label: series.label, color: seriesColor(index) },
    ]),
  );
  const units = new Set(visibleSeries.map((series) => series.unit));
  const hasIncompatibleUnits = units.size > 1;
  const unit = hasIncompatibleUnits
    ? undefined
    : (config.display.unit ?? visibleSeries[0]?.unit);
  let headlineCandidate: StudioRow | undefined;
  if (config.display.headlineMetricRef)
    headlineCandidate = visibilitySummaries.find(
      (row) =>
        `${row.queryId}.${row.metricId}` === config.display.headlineMetricRef,
    );
  else if (
    visibleMetricRefs.size === 1 &&
    visibilitySummaries.length === 1 &&
    !hasIncompatibleUnits
  )
    headlineCandidate = visibilitySummaries[0];
  const headline =
    headlineCandidate &&
    !partiallyHiddenMetricRefs.has(
      `${headlineCandidate.queryId}.${headlineCandidate.metricId}`,
    )
      ? headlineCandidate
      : undefined;
  const headlineSuppressed = Boolean(
    (config.display.showHeadline || config.display.chartType === "NUMBER") &&
    headlineCandidate &&
    partiallyHiddenMetricRefs.has(
      `${headlineCandidate.queryId}.${headlineCandidate.metricId}`,
    ),
  );
  const tableRows =
    config.display.chartType === "NUMBER" ? summaries : selectedRows;
  const table: Visualization = {
    type: "table",
    columns: [
      ...(tableRows.some((row) => row.time)
        ? [{ id: "time", label: "Time" }]
        : []),
      { id: "series", label: "Series" },
      ...(tableRows.some((row) => row.dimension)
        ? [{ id: "dimension", label: "Breakdown" }]
        : []),
      { id: "value", label: "Value", align: "right" },
    ],
    rows: tableRows
      .slice(0, config.display.rowLimit ?? 100)
      .map((row, index) => ({
        id: `${row.seriesId}_${index}`,
        cells: [
          {
            columnId: "time",
            value: row.time ? new Date(row.time).toLocaleString() : "",
          },
          { columnId: "series", value: row.label },
          { columnId: "dimension", value: row.dimension ?? "" },
          {
            columnId: "value",
            value: formatStudioValue(
              row.value,
              hasIncompatibleUnits
                ? unitsByMetric.get(`${row.queryId}.${row.metricId}`)
                : (config.display.unit ??
                    unitsByMetric.get(`${row.queryId}.${row.metricId}`)),
            ),
          },
        ],
      })),
  };
  const dimensionFields = [
    ...new Set(selectedRows.flatMap((row) => Object.keys(row.dimensions))),
  ];
  const metricColumns = [
    ...new Map(
      visibleSeries.map((series) => {
        const query = config.queries.find(
          (query) => query.id === series.queryId,
        );
        const metric = query?.metrics.find(
          (metric) => metric.id === series.metricId,
        );
        const metricName =
          metric?.label ||
          (metric
            ? `${metric.percentile ? `p${metric.percentile}` : metric.aggregation} ${readableField(metric.measure)}`
            : series.label);
        const label =
          config.queries.filter((item) => !item.hidden).length > 1 && query
            ? `${query.label} · ${metricName}`
            : metricName;
        return [
          `${series.queryId}.${series.metricId}`,
          {
            id: `${series.queryId}.${series.metricId}`,
            label,
            unit:
              units.size > 1
                ? series.unit
                : (config.display.unit ?? series.unit),
          },
        ] as const;
      }),
    ).values(),
  ];
  const pivotGroups = new Map<
    string,
    {
      time: string | null;
      dimensions: StudioRow["dimensions"];
      values: Map<string, number | null>;
    }
  >();
  for (const row of selectedRows) {
    const key = JSON.stringify([
      row.time,
      dimensionFields.map((field) => row.dimensions[field] ?? null),
    ]);
    const group = pivotGroups.get(key) ?? {
      time: row.time,
      dimensions: row.dimensions,
      values: new Map<string, number | null>(),
    };
    group.values.set(`${row.queryId}.${row.metricId}`, row.value);
    pivotGroups.set(key, group);
  }
  const hasTime = selectedRows.some((row) => row.time);
  const pivotTable: Visualization = {
    type: "table",
    columns: [
      ...(hasTime ? [{ id: "time", label: "Time" }] : []),
      ...dimensionFields.map((field) => ({
        id: `dimension.${field}`,
        label: readableField(field),
      })),
      ...metricColumns.map((column) => ({
        id: column.id,
        label: column.label,
        align: "right" as const,
      })),
    ],
    rows: [...pivotGroups.entries()]
      .slice(0, config.display.rowLimit ?? 100)
      .map(([id, group]) => ({
        id,
        cells: [
          ...(hasTime
            ? [
                {
                  columnId: "time",
                  value: group.time
                    ? new Date(group.time).toLocaleString()
                    : "",
                },
              ]
            : []),
          ...dimensionFields.map((field) => ({
            columnId: `dimension.${field}`,
            value: group.dimensions[field] ?? "—",
          })),
          ...metricColumns.map((column) => ({
            columnId: column.id,
            value: formatStudioValue(
              group.values.get(column.id) ?? null,
              column.unit,
            ),
          })),
        ],
      })),
  };
  return {
    data,
    colors,
    unit,
    table,
    pivotTable,
    summaries,
    visibleSeries,
    availableSeries,
    headline,
    headlineSuppressed,
    hasIncompatibleUnits,
  };
}

/** Pages exact executed aggregates without changing query selection or chart formatting. */
export function prepareStudioData(
  result: StudioResult | undefined,
  config: StudioWidgetConfig,
  page: {
    scope: "rows" | "summaries";
    reference: string;
    pageIndex: number;
    pageSize: number;
  },
) {
  const expressions = new Set(
    config.expressions.map((expression) => expression.id),
  );
  const referenceOf = (row: Pick<StudioRow, "queryId" | "metricId">) =>
    expressions.has(row.queryId)
      ? row.queryId
      : `${row.queryId}.${row.metricId}`;
  const seriesByReference = new Map(
    (result?.series ?? []).map((series) => [referenceOf(series), series]),
  );
  const rows = result?.[page.scope] ?? [];
  const labels = new Map([
    ...config.queries.flatMap((query) =>
      query.metrics.map(
        (metric) =>
          [
            `${query.id}.${metric.id}`,
            `${query.label} · ${metric.label ?? `${metric.aggregation} ${readableField(metric.measure)}`}`,
          ] as const,
      ),
    ),
    ...config.expressions.map(
      (expression) => [expression.id, expression.label] as const,
    ),
  ]);
  const present = new Map<string, number>();
  for (const row of rows) {
    const ref = referenceOf(row);
    present.set(ref, (present.get(ref) ?? 0) + 1);
  }
  const referenceOptions = [
    { value: "all", label: "All executed values" },
    ...[...labels.keys()]
      .filter((value) => present.has(value))
      .map((value) => ({
        value,
        label: `${value} · ${labels.get(value) ?? value}`,
      })),
  ];
  const reference = present.has(page.reference) ? page.reference : "all";
  const rowCount =
    reference === "all" ? rows.length : (present.get(reference) ?? 0);
  const pageIndex = Math.min(
    Math.max(0, page.pageIndex),
    Math.max(0, Math.ceil(rowCount / page.pageSize) - 1),
  );
  const pageRows: StudioRow[] = [];
  let matchingIndex = 0;
  for (const row of rows) {
    if (reference !== "all" && referenceOf(row) !== reference) continue;
    if (matchingIndex++ < pageIndex * page.pageSize) continue;
    pageRows.push(row);
    if (pageRows.length === page.pageSize) break;
  }
  const table: Extract<Visualization, { type: "table" }> = {
    type: "table",
    columns: [
      { id: "reference", label: "Reference" },
      { id: "series", label: "Series" },
      { id: "time", label: page.scope === "summaries" ? "Period" : "Time" },
      { id: "dimension", label: "Breakdown" },
      { id: "value", label: "Raw value", align: "right" },
      { id: "unit", label: "Unit" },
    ],
    rows: pageRows.map((row, index) => {
      const reference = referenceOf(row);
      const descriptor = seriesByReference.get(reference);
      return {
        id: `${row.seriesId}_${index}`,
        cells: [
          { columnId: "reference", value: reference },
          { columnId: "series", value: row.label },
          { columnId: "time", value: row.time ?? "Full time range" },
          {
            columnId: "dimension",
            value: Object.keys(row.dimensions).length
              ? JSON.stringify(row.dimensions)
              : "—",
            detail: descriptor?.bucketUnit
              ? `Bin boundaries use ${descriptor.bucketUnit}`
              : undefined,
          },
          { columnId: "value", value: row.value ?? "null" },
          {
            columnId: "unit",
            value: descriptor?.rawUnit ?? descriptor?.unit ?? "—",
          },
        ],
      };
    }),
  };
  return {
    table,
    referenceOptions,
    reference,
    rowCount,
    pageIndex,
    pageSize: page.pageSize,
  };
}
