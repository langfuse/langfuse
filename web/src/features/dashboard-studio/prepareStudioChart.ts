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
  return (value, options) =>
    unit === "percent" || unit === "%"
      ? {
          main: new Intl.NumberFormat("en", {
            maximumFractionDigits: 2,
          }).format(value * 100),
          suffix: "%",
        }
      : formatMetric(value, { ...options, unit: parseMetricUnit(unit) });
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
  const visibleSeries = (result?.series ?? []).filter((series) => {
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
  const summaries = (result?.summaries ?? []).filter((row) =>
    visibleSeries.some(
      (series) =>
        series.queryId === row.queryId && series.metricId === row.metricId,
    ),
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
    hasIncompatibleUnits,
  };
}
