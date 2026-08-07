import { type DashboardDateRangeAggregationOption } from "@/src/utils/date-range-utils";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import {
  type CategoryCounts,
  type ChartBin,
  type HistogramBin,
} from "@/src/features/scores/types";
import { type RouterOutputs } from "@/src/utils/api";

export const RESOURCE_METRICS = [
  {
    key: "latency",
    value: "Latency",
    objectKey: "avgLatency",
    label: "Latency",
    maxFractionDigits: 2,
  },
  {
    key: "cost",
    value: "Cost",
    objectKey: "avgTotalCost",
    label: "Average Total Cost ($)",
    maxFractionDigits: 5,
  },
];

// numeric score analytics helpers
function round(value: number, precision = 2) {
  return parseFloat(value.toFixed(precision));
}

export function uniqueAndSort(labels: string[]): string[] {
  return Array.from(new Set(labels)).sort();
}

function computeBinSize(
  minBins: number,
  maxBins: number,
  range: number,
  valueCount: number,
) {
  return range === 0
    ? 1
    : Math.min(Math.max(minBins, Math.floor(Math.sqrt(valueCount))), maxBins);
}

// Decimals needed so adjacent bin edges stay distinct in labels. Values are
// binned on their raw magnitude (see below); rounding is display-only. Without
// this, small ranges collapse edges to the same 2dp value and produce
// degenerate labels like "[0.85, 0.85]".
function labelPrecision(binSize: number): number {
  if (!Number.isFinite(binSize) || binSize <= 0 || binSize >= 1) return 2;
  return Math.min(10, Math.max(2, -Math.floor(Math.log10(binSize)) + 1));
}

export function createHistogramData(
  data: DatabaseRow[],
  minBins = 1,
  maxBins = 10,
) {
  const numericScoreValues = data.map((item) => item.value as number);
  if (!Boolean(numericScoreValues.length))
    return { chartData: [], chartLabels: [] };

  // Bin edges are derived from the RAW min/max, and values are assigned by their
  // RAW magnitude. Previously both were rounded to 2 decimals before binning,
  // which pushed values across boundaries (e.g. 0.857 counted in the "[0.86, 1]"
  // bucket) and disagreed with a standard histogram. Rounding is now applied to
  // the display labels only.
  const min = Math.min(...numericScoreValues);
  const max = Math.max(...numericScoreValues);
  const range = max - min;
  const bins = computeBinSize(
    minBins,
    maxBins,
    range,
    numericScoreValues.length,
  );
  const binSize = range / bins || 1;
  const precision = labelPrecision(binSize);

  const baseChartData = Array.from({ length: bins }).map(
    (_, index: number) => ({
      count: 0,
      binLabel: `[${round(min + index * binSize, precision)}, ${round(min + (index + 1) * binSize, precision)}]`,
    }),
  );

  const chartData = numericScoreValues.reduce((acc, value) => {
    // The maximum value falls into the last (closed) bin, matching a standard
    // equal-width histogram.
    const binIndex = Math.min(Math.floor((value - min) / binSize), bins - 1);
    acc[binIndex].count++;
    return acc;
  }, baseChartData);

  return {
    chartLabels: ["count"],
    chartData,
  };
}

export function padChartData(chartData: HistogramBin[]) {
  const emptyBin = { binLabel: "", empty: 0 };
  if (chartData.length < 3) {
    return [emptyBin, emptyBin, ...chartData, emptyBin, emptyBin];
  }

  if (chartData.length < 5) {
    return [emptyBin, ...chartData, emptyBin];
  }

  return chartData;
}

// categorical score analytics helpers
function convertDateToStringTimestamp(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
  });
}

function aggregateCategoricalScoreData(data: DatabaseRow[]): {
  categoryCounts: CategoryCounts;
  labels: string[];
} {
  const labels: string[] = [];

  const categoryCounts = data.reduce((acc: CategoryCounts, row) => {
    const label = row["scoreValue"];
    if (typeof label === "string") {
      labels.push(label);
      const currentBinCount = (row["count"] as number) ?? 0;
      return { ...acc, [label]: currentBinCount };
    }
    return acc;
  }, {} as CategoryCounts);

  return {
    categoryCounts,
    labels,
  };
}

function groupCategoricalScoreDataByTimestamp(
  data: DatabaseRow[],
  scoreTimestampAccessor: string,
): Record<string, DatabaseRow[]> {
  return data.reduce(
    (acc, row) => {
      if (row[scoreTimestampAccessor] === null) {
        return acc;
      }
      const timestamp = new Date(
        (row[scoreTimestampAccessor] as string) ?? new Date(),
      );
      const key = convertDateToStringTimestamp(timestamp);
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(row);
      return acc;
    },
    {} as Record<string, DatabaseRow[]>,
  );
}

type ChartAccumulator = Map<
  string,
  { chartData: ChartBin[]; chartLabels: string[] }
>;

function initializeOrGetChartData(acc: ChartAccumulator, key: string) {
  if (!acc.has(key)) {
    acc.set(key, { chartData: [], chartLabels: [] });
  }
  return acc.get(key)!;
}

function createNumericScoreData(run: string, score: number, scoreName: string) {
  return {
    chartLabels: [scoreName],
    chartBin: {
      binLabel: run,
      [scoreName]: score,
    } as ChartBin,
  };
}

function createCategoricalScoreData(
  run: string,
  valueCounts: Array<{ value: string; count: number }>,
  values: string[],
) {
  const categoryCounts = valueCounts.reduce(
    (counts, { value, count }) => ({
      ...counts,
      [value]: count,
    }),
    {} as CategoryCounts,
  );

  return {
    chartLabels: values,
    chartBin: {
      binLabel: run,
      ...categoryCounts,
    } as ChartBin,
  };
}

function addMetricToAccumulator(
  acc: ChartAccumulator,
  key: string,
  chartBin: ChartBin,
  chartLabels: string[],
) {
  const current = initializeOrGetChartData(acc, key);
  acc.set(key, {
    chartData: [...current.chartData, chartBin],
    chartLabels,
  });
}

export function transformAggregatedRunMetricsToChartData(
  runMetrics: RouterOutputs["datasets"]["runsByDatasetIdMetrics"]["runs"],
  scoreIdToName: Map<string, string>,
) {
  const reversedMetrics = runMetrics.slice().reverse();

  return reversedMetrics.reduce((acc, run) => {
    // Handle scores
    Object.entries(run.scores ?? {}).forEach(([scoreId, score]) => {
      const scoreData =
        score.type === "NUMERIC"
          ? createNumericScoreData(
              run.name,
              score.average,
              scoreIdToName.get(scoreId) ?? scoreId,
            )
          : createCategoricalScoreData(
              run.name,
              score.valueCounts,
              score.values,
            );

      addMetricToAccumulator(
        acc,
        scoreId,
        scoreData.chartBin,
        scoreData.chartLabels,
      );
    });

    // Handle resource metrics
    RESOURCE_METRICS.forEach(({ key, objectKey }) => {
      const resourceValue = run[objectKey as keyof typeof run];
      const resourceData = createNumericScoreData(
        run.name,
        !!resourceValue ? Number(resourceValue) : 0,
        key,
      );

      addMetricToAccumulator(
        acc,
        key,
        resourceData.chartBin,
        resourceData.chartLabels,
      );
    });

    return acc;
  }, new Map());
}

export function transformCategoricalScoresToChartData(
  data: DatabaseRow[],
  scoreTimestampAccessor: string,
  agg?: DashboardDateRangeAggregationOption,
): { chartData: ChartBin[]; chartLabels: string[] } {
  if (!agg) {
    const { categoryCounts, labels } = aggregateCategoricalScoreData(data);
    return {
      chartData: [{ ...categoryCounts, binLabel: "Aggregation" }] as ChartBin[],
      chartLabels: uniqueAndSort(labels),
    };
  }
  const scoreDataByTimestamp = groupCategoricalScoreDataByTimestamp(
    data,
    scoreTimestampAccessor,
  );

  const chartData: ChartBin[] = [];
  const chartLabels: string[] = [];

  Object.entries(scoreDataByTimestamp).forEach(([timestamp, data]) => {
    const { categoryCounts, labels } = aggregateCategoricalScoreData(data);
    chartLabels.push(...labels);
    chartData.push({ ...categoryCounts, binLabel: timestamp } as ChartBin);
  });

  return { chartData, chartLabels };
}

export function isEmptyChart({ data }: { data: ChartBin[] }) {
  return (
    data.length === 0 || data.every((item) => Object.keys(item).length === 1)
  );
}
