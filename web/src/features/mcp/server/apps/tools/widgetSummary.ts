/**
 * The text a `renderWidget` result gives the model: a complete summary of
 * what the chart shows, so the model can talk about it without re-querying.
 * The full rows go only to the MCP App view.
 */

const MAX_SERIES = 10;
const MAX_ENTRIES = 15;

type Row = Record<string, unknown>;

type Point = { time: string; value: number };

/** A query cell as a finite number, or null for empty and non-numeric values. */
export const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const toLabel = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "(none)";
  return Array.isArray(value) ? value.join(", ") : String(value);
};

const round = (value: number) => Number(value.toPrecision(6));

/** Aggregations whose bucket values may be added up into a total. */
const isAdditive = (aggregation: string) =>
  aggregation === "sum" || aggregation === "count";

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
) => {
  const bySeries = new Map<string, Point[]>();
  const buckets = new Set<string>();
  for (const row of rows) {
    const time =
      typeof row.time_dimension === "string" ? row.time_dimension : undefined;
    const value = toNumber(row[metricField]);
    if (!time) continue;
    buckets.add(time);
    if (value === null) continue;
    const name = dimensionField ? toLabel(row[dimensionField]) : "total";
    bySeries.set(name, [...(bySeries.get(name) ?? []), { time, value }]);
  }
  const sortedBuckets = [...buckets].sort();
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

  const bucketTotals = additive
    ? sortedBuckets.map((time) => ({
        time,
        value: rows
          .filter((row) => row.time_dimension === time)
          .reduce((sum, row) => sum + (toNumber(row[metricField]) ?? 0), 0),
      }))
    : [];
  const peakBucket = peakOf(bucketTotals);

  return {
    buckets: {
      count: sortedBuckets.length,
      first: sortedBuckets[0] ?? null,
      last: sortedBuckets.at(-1) ?? null,
    },
    ...(additive
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
  return {
    ...(isAdditive(aggregation)
      ? { total: round(entries.reduce((sum, e) => sum + e.value, 0)) }
      : {}),
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
) => ({
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
 * Summarizes widget rows by chart shape: a value, a time series, a
 * histogram, a table or a breakdown.
 */
export function summarizeWidget(params: {
  rows: Row[];
  chartType: string;
  metricField: string;
  metricFields: string[];
  aggregation: string;
  dimensionField: string | undefined;
  dimensionFields: string[];
  isTimeSeries: boolean;
  kpi?: { value: number | null; previousValue: number | null };
}) {
  const { rows, metricField, aggregation, dimensionField, kpi } = params;
  if (kpi) {
    const change =
      kpi.value !== null && kpi.previousValue
        ? (kpi.value - kpi.previousValue) / Math.abs(kpi.previousValue)
        : null;
    return {
      value: kpi.value === null ? null : round(kpi.value),
      previousPeriodValue:
        kpi.previousValue === null ? null : round(kpi.previousValue),
      changeVsPreviousPeriod: change === null ? null : round(change),
    };
  }
  if (params.chartType === "HISTOGRAM") {
    return summarizeHistogram(rows, metricField);
  }
  if (params.chartType === "PIVOT_TABLE") {
    return summarizeTable(rows, params.dimensionFields, params.metricFields);
  }
  return params.isTimeSeries
    ? summarizeSeries(rows, metricField, aggregation, dimensionField)
    : summarizeBreakdown(rows, metricField, aggregation, dimensionField);
}
