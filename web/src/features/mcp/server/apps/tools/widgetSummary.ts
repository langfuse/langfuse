import { type DashboardWidgetChartType } from "@langfuse/shared";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";

/**
 * The text a `renderWidget` result gives the model: a summary of what the
 * chart shows, so the model can talk about it without re-querying. The full
 * rows go only to the MCP App view.
 */

const MAX_SERIES = 10;
const MAX_ENTRIES = 15;

type Row = Record<string, unknown>;

type Point = { time: string; value: number };

/** A query cell as a finite number, or null for empty and non-numeric values. */
const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

// Empty dimensions read "n/a", as in the chart's legend.
const toLabel = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "n/a";
  return Array.isArray(value) ? value.join(", ") : String(value);
};

const round = (value: number) => Number(value.toPrecision(6));

/** Aggregations whose bucket values may be added up into a total. */
const isAdditive = (aggregation: string) =>
  aggregation === "sum" || aggregation === "count";

/**
 * How the rows relate to the data: whether a dimension value can repeat a
 * source row (array and key-value dimensions), and whether the query's row
 * limit cut the rows off. Either way, the rows do not add up to a total.
 */
type RowShape = { repeatsRows: boolean; limited: boolean };

const peakOf = (points: Point[]) =>
  points.reduce<Point | undefined>(
    (peak, point) => (!peak || point.value > peak.value ? point : peak),
    undefined,
  );

const summarizeSeries = (
  rows: Row[],
  metricField: string,
  aggregation: string,
  dimensionField: string | undefined,
  shape: RowShape,
) => {
  const bySeries = new Map<string, Point[]>();
  // Every bucket's summed value, also for buckets without data.
  const bucketSums = new Map<string, number>();
  for (const row of rows) {
    const time =
      typeof row.time_dimension === "string" ? row.time_dimension : undefined;
    const value = toNumber(row[metricField]);
    if (!time) continue;
    bucketSums.set(time, (bucketSums.get(time) ?? 0) + (value ?? 0));
    if (value === null) continue;
    const name = dimensionField ? toLabel(row[dimensionField]) : "total";
    const points = bySeries.get(name);
    if (points) points.push({ time, value });
    else bySeries.set(name, [{ time, value }]);
  }
  const sortedBuckets = [...bucketSums.keys()].sort();
  const additive = isAdditive(aggregation);

  const series = [...bySeries.entries()].map(([name, points]) => {
    const ordered = points.sort((a, b) => a.time.localeCompare(b.time));
    const peak = peakOf(ordered);
    const latest = ordered.at(-1);
    return {
      name,
      ...(additive
        ? { total: round(ordered.reduce((sum, p) => sum + p.value, 0)) }
        : {}),
      peak: peak && { time: peak.time, value: round(peak.value) },
      latest: latest && { time: latest.time, value: round(latest.value) },
    };
  });
  // Biggest series first: by total when values add up, else by peak.
  series.sort(
    (a, b) => (b.total ?? b.peak?.value ?? 0) - (a.total ?? a.peak?.value ?? 0),
  );

  // Series overlap when a dimension repeats rows, so buckets then have no
  // meaningful total across series.
  const addsAcrossSeries = additive && !shape.repeatsRows;
  const bucketTotals = addsAcrossSeries
    ? sortedBuckets.map((time) => ({ time, value: bucketSums.get(time) ?? 0 }))
    : [];
  const peakBucket = peakOf(bucketTotals);

  return {
    buckets: {
      count: sortedBuckets.length,
      first: sortedBuckets[0] ?? null,
      last: sortedBuckets.at(-1) ?? null,
    },
    ...(addsAcrossSeries
      ? {
          total: round(bucketTotals.reduce((sum, b) => sum + b.value, 0)),
          peakBucket: peakBucket && {
            time: peakBucket.time,
            value: round(peakBucket.value),
          },
        }
      : {}),
    series: series.slice(0, MAX_SERIES),
    ...(series.length > MAX_SERIES
      ? { seriesOmitted: series.length - MAX_SERIES }
      : {}),
  };
};

const summarizeBreakdown = (
  rows: Row[],
  metricField: string,
  aggregation: string,
  dimensionField: string | undefined,
  shape: RowShape,
) => {
  const entries = rows
    .map((row) => ({
      label: dimensionField ? toLabel(row[dimensionField]) : "total",
      value: toNumber(row[metricField]),
    }))
    .filter((entry): entry is { label: string; value: number } =>
      Boolean(entry.value !== null),
    )
    .sort((a, b) => b.value - a.value)
    .map((entry) => ({ ...entry, value: round(entry.value) }));
  const addsUp =
    isAdditive(aggregation) && !shape.repeatsRows && !shape.limited;
  return {
    ...(addsUp
      ? { total: round(entries.reduce((sum, e) => sum + e.value, 0)) }
      : {}),
    ...(shape.limited ? { rowsLimited: true } : {}),
    entries: entries.slice(0, MAX_ENTRIES),
    ...(entries.length > MAX_ENTRIES
      ? { entriesOmitted: entries.length - MAX_ENTRIES }
      : {}),
  };
};

/** Every row with all its dimension labels and metric values, as a table shows them. */
const summarizeTable = (
  rows: Row[],
  dimensionFields: string[],
  metricFields: string[],
  shape: RowShape,
) => ({
  ...(shape.limited ? { rowsLimited: true } : {}),
  rows: rows.slice(0, MAX_ENTRIES).map((row) => ({
    ...Object.fromEntries(
      dimensionFields.map((field) => [field, toLabel(row[field])]),
    ),
    ...Object.fromEntries(
      metricFields.map((field) => {
        const value = toNumber(row[field]);
        return [field, value === null ? null : round(value)];
      }),
    ),
  })),
  ...(rows.length > MAX_ENTRIES
    ? { rowsOmitted: rows.length - MAX_ENTRIES }
    : {}),
});

/** A histogram's bins, which a query returns as `[lower, upper, count]` tuples. */
const summarizeHistogram = (rows: Row[], metricField: string) => {
  const value = rows[0]?.[metricField];
  const bins = (Array.isArray(value) ? value : [])
    .filter((bin): bin is unknown[] => Array.isArray(bin) && bin.length >= 3)
    .map(([lower, upper, count]) => ({
      from: round(Number(lower)),
      to: round(Number(upper)),
      count: round(Number(count)),
    }));
  return { bins };
};

/**
 * Summarizes a widget's rows by chart shape: a value, a time series, a
 * histogram, a table or a breakdown. The first metric and dimension are
 * charted; a table summarizes all of them.
 */
export function summarizeWidget(params: {
  rows: Row[];
  chartType: DashboardWidgetChartType;
  metrics: { measure: string; agg: string }[];
  dimensions: { field: string }[];
  /** The query's row limit, if any. */
  rowLimit?: number;
  /** Whether the first dimension can return one source row more than once. */
  dimensionRepeatsRows?: boolean;
}) {
  const { rows, chartType } = params;
  const shape: RowShape = {
    repeatsRows: params.dimensionRepeatsRows ?? false,
    limited: params.rowLimit !== undefined && rows.length >= params.rowLimit,
  };
  const metricFields = params.metrics.map((m) => `${m.agg}_${m.measure}`);
  const dimensionFields = params.dimensions.map((d) => d.field);
  const metricField = metricFields[0] ?? "";
  const aggregation = params.metrics[0]?.agg ?? "";
  const dimensionField = dimensionFields[0];
  if (chartType === "NUMBER" && !dimensionField) {
    const value = toNumber(rows[0]?.[metricField]);
    return { value: value === null ? null : round(value) };
  }
  if (chartType === "HISTOGRAM") {
    return summarizeHistogram(rows, metricField);
  }
  if (chartType === "PIVOT_TABLE") {
    return summarizeTable(rows, dimensionFields, metricFields, shape);
  }
  return isTimeSeriesChart(chartType)
    ? summarizeSeries(rows, metricField, aggregation, dimensionField, shape)
    : summarizeBreakdown(rows, metricField, aggregation, dimensionField, shape);
}
