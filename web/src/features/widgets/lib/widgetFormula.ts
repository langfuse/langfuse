import { type WidgetFormula } from "@langfuse/shared";
import { type QueryType } from "@langfuse/shared/query";
import {
  type DataPoint,
  type MetricFormatterFunction,
  type MissingBucketValue,
} from "@/src/features/widgets/chart-library/chart-props";
import { parseChartTimestamp } from "@/src/features/widgets/chart-library/prepareTimeAxis";
import { toFullMetricString } from "@/src/features/widgets/chart-library/utils";
import { getWidgetMissingBucketValue } from "@/src/features/widgets/utils";
import { numberFormatter } from "@/src/utils/numbers";

type WidgetFormulaOperator = WidgetFormula["operator"];
type FormulaMetric = { measure: string; agg: string };
type QueryRow = Record<string, unknown>;

export const WIDGET_FORMULA_OPERATORS: {
  value: WidgetFormulaOperator;
  label: string;
}[] = [
  { value: "divide", label: "A ÷ B (percentage)" },
  { value: "subtract", label: "A − B" },
  { value: "add", label: "A + B" },
];

const OPERATOR_SYMBOLS: Record<WidgetFormulaOperator, string> = {
  divide: "÷",
  subtract: "−",
  add: "+",
};

const FORMULA_CHART_TYPES = new Set<string>([
  "LINE_TIME_SERIES",
  "BAR_TIME_SERIES",
  "AREA_TIME_SERIES",
  "NUMBER",
]);

/** Chart types whose rows can be joined per time bucket and breakdown value, plus the single-total NUMBER tile. */
export function widgetChartTypeSupportsFormula(chartType: string): boolean {
  return FORMULA_CHART_TYPES.has(chartType);
}

/** The formula a stored chart config carries, when its chart type can render one. */
export function getWidgetFormula(
  chartConfig: { type: string; formula?: WidgetFormula } | undefined,
): WidgetFormula | undefined {
  return chartConfig && widgetChartTypeSupportsFormula(chartConfig.type)
    ? chartConfig.formula
    : undefined;
}

/**
 * Metric B's query: the widget's breakdown, time range and auto granularity
 * with B's view, metric and view-space filters. Sharing the time range and
 * granularity is what makes both results bucket identically.
 */
export function buildFormulaQuery(
  query: QueryType,
  b: WidgetFormula["b"],
): QueryType {
  return {
    ...query,
    view: b.view,
    metrics: [{ measure: b.measure, aggregation: b.agg }],
    filters: b.filters,
    orderBy: null,
  };
}

type Operand = {
  rows: QueryRow[];
  metricField: string;
  /** The value of a (bucket, series) cell this operand has no row for. */
  missingValue: MissingBucketValue;
};

type OperandCells = {
  buckets: Map<string, { time: string | undefined; ms: number | null }>;
  cells: Map<string, Map<string, number | null>>;
};

const toNumberOrNull = (raw: unknown): number | null => {
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

const toSeriesName = (raw: unknown): string => {
  if (raw == null || raw === "") return "n/a";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.join(", ");
  return String(raw);
};

function collectCells(
  operand: Operand,
  dimensionField: string | undefined,
  seriesLabel: string,
): OperandCells {
  const buckets: OperandCells["buckets"] = new Map();
  const cells: OperandCells["cells"] = new Map();
  for (const row of operand.rows) {
    const rawTime = row["time_dimension"];
    // A and B may spell the same bucket differently; key it by instant.
    const ms = parseChartTimestamp(rawTime)?.getTime() ?? null;
    const key = ms !== null ? String(ms) : String(rawTime ?? "");
    if (!buckets.has(key)) {
      buckets.set(key, {
        time: typeof rawTime === "string" ? rawTime : undefined,
        ms,
      });
    }

    const value = toNumberOrNull(row[operand.metricField]);
    const rawDimension = dimensionField ? row[dimensionField] : undefined;
    // A gap-filled empty bucket (no breakdown value, the metric's type
    // default) only holds the bucket; it is not an "n/a" series.
    const isFillerRow =
      dimensionField !== undefined &&
      (rawDimension == null || rawDimension === "") &&
      (value === null || (operand.missingValue === "zero" && value === 0));
    if (isFillerRow) continue;

    const series = dimensionField ? toSeriesName(rawDimension) : seriesLabel;
    const bucketCells = cells.get(key) ?? new Map<string, number | null>();
    bucketCells.set(series, value);
    cells.set(key, bucketCells);
  }
  return { buckets, cells };
}

const resolveCell = (
  operand: Operand,
  collected: OperandCells,
  key: string,
  series: string,
): number | null => {
  const bucketCells = collected.cells.get(key);
  if (bucketCells?.has(series)) return bucketCells.get(series) ?? null;
  return operand.missingValue === "zero" ? 0 : null;
};

/** A missing operand, or a zero divisor, yields `null` (a gap), never a made-up number. */
function applyOperator(
  operator: WidgetFormulaOperator,
  a: number | null,
  b: number | null,
): number | null {
  if (a === null || b === null) return null;
  switch (operator) {
    case "divide":
      return b === 0 ? null : a / b;
    case "subtract":
      return a - b;
    case "add":
      return a + b;
  }
}

function combineRows(params: {
  operator: WidgetFormulaOperator;
  a: Operand;
  b: Operand;
  dimensionField: string | undefined;
  seriesLabel: string;
}): DataPoint[] {
  const { operator, a, b, dimensionField, seriesLabel } = params;
  const aCells = collectCells(a, dimensionField, seriesLabel);
  const bCells = collectCells(b, dimensionField, seriesLabel);

  const buckets = new Map(aCells.buckets);
  for (const [key, bucket] of bCells.buckets) {
    if (!buckets.has(key)) buckets.set(key, bucket);
  }
  const orderedBuckets = [...buckets.entries()];
  if (orderedBuckets.every(([, bucket]) => bucket.ms !== null)) {
    orderedBuckets.sort(([, x], [, y]) => (x.ms ?? 0) - (y.ms ?? 0));
  }

  const points: DataPoint[] = [];
  for (const [key, bucket] of orderedBuckets) {
    const series = new Set([
      ...(aCells.cells.get(key)?.keys() ?? []),
      ...(bCells.cells.get(key)?.keys() ?? []),
    ]);
    if (series.size === 0) {
      points.push({
        time_dimension: bucket.time,
        dimension: undefined,
        metric: null,
      });
      continue;
    }
    for (const name of series) {
      points.push({
        time_dimension: bucket.time,
        dimension: name,
        metric: applyOperator(
          operator,
          resolveCell(a, aCells, key, name),
          resolveCell(b, bCells, key, name),
        ),
      });
    }
  }
  return points;
}

const formatPercent: MetricFormatterFunction = (value, { style }) => {
  const percent = value * 100;
  return {
    ...(percent < 0 ? { negative: true } : {}),
    main: numberFormatter(Math.abs(percent), 0, style === "compact" ? 1 : 2),
    suffix: "%",
  };
};

/**
 * The NUMBER tile puts the operands before the result ("12 of 40 · 30%",
 * "52 − 40 = 12"). The context rides in the prefix, which BigNumber renders
 * muted next to the headline value; a negative sign moves next to the value
 * because BigNumber would otherwise print it ahead of the whole prefix.
 */
function formatNumberTile(params: {
  operator: WidgetFormulaOperator;
  a: number | null;
  b: number | null;
  resultFormatter: MetricFormatterFunction;
  operandFormatter: MetricFormatterFunction;
}): MetricFormatterFunction {
  const { operator, a, b, resultFormatter, operandFormatter } = params;
  const operand = (value: number | null) =>
    value === null
      ? "–"
      : toFullMetricString(operandFormatter(value, { style: "compact" }));
  const context =
    operator === "divide"
      ? `${operand(a)} of ${operand(b)} · `
      : `${operand(a)} ${OPERATOR_SYMBOLS[operator]} ${operand(b)} = `;
  return (value, options) => {
    const result = resultFormatter(value, options);
    const sign = result.negative ? "-" : "";
    return result.prefix
      ? {
          prefix: `${context}${sign}${result.prefix}`,
          main: result.main,
          suffix: result.suffix,
        }
      : {
          prefix: context,
          main: `${sign}${result.main}`,
          suffix: result.suffix,
        };
  };
}

/**
 * Prepares a formula widget for the chart: joins A's and B's query rows per
 * time bucket and breakdown value, applies the operator, and decides the
 * formatter and missing-bucket semantics of the result.
 *
 * A cell one side has no row for is `0` when that side is additive
 * (count/uniq/sum: nothing happened) and missing otherwise; a missing operand
 * or a zero divisor makes the result `null`, which the chart draws as a gap.
 */
export function prepareFormulaChart(params: {
  chartType: string;
  operator: WidgetFormulaOperator;
  aMetric: FormulaMetric;
  bMetric: FormulaMetric;
  aRows: QueryRow[];
  bRows: QueryRow[];
  dimensionField: string | undefined;
  /** Series name when there is no breakdown. */
  seriesLabel: string;
  /** Formats A's (and B's) own values. */
  operandFormatter: MetricFormatterFunction;
}): {
  data: DataPoint[];
  metricFormatter: MetricFormatterFunction;
  missingValue: MissingBucketValue;
} {
  const { chartType, operator, operandFormatter } = params;
  const toOperand = (metric: FormulaMetric, rows: QueryRow[]): Operand => ({
    rows,
    metricField: `${metric.agg}_${metric.measure}`,
    missingValue: getWidgetMissingBucketValue(metric.agg),
  });
  const a = toOperand(params.aMetric, params.aRows);
  const b = toOperand(params.bMetric, params.bRows);
  const resultFormatter =
    operator === "divide" ? formatPercent : operandFormatter;

  if (chartType === "NUMBER") {
    const total = (operand: Operand) => {
      if (operand.rows.length > 0) {
        return toNumberOrNull(operand.rows[0][operand.metricField]);
      }
      return operand.missingValue === "zero" ? 0 : null;
    };
    const aTotal = total(a);
    const bTotal = total(b);
    return {
      data: [
        {
          time_dimension: undefined,
          dimension: params.seriesLabel,
          metric: applyOperator(operator, aTotal, bTotal),
        },
      ],
      metricFormatter: formatNumberTile({
        operator,
        a: aTotal,
        b: bTotal,
        resultFormatter,
        operandFormatter,
      }),
      missingValue: "gap",
    };
  }

  return {
    data: combineRows({
      operator,
      a,
      b,
      dimensionField: params.dimensionField,
      seriesLabel: params.seriesLabel,
    }),
    metricFormatter: resultFormatter,
    missingValue:
      operator !== "divide" &&
      a.missingValue === "zero" &&
      b.missingValue === "zero"
        ? "zero"
        : "gap",
  };
}
