import { type DashboardDateRangeAggregationOption } from "@/src/utils/date-range-utils";
import { type DatabaseRow } from "@/src/server/api/services/query-builder";

// types
type HistogramBin = { binLabel: string; count: number };
type CategoryCounts = Record<string, number>;
type ChartBin = { binLabel?: string } & CategoryCounts;

// numeric score analytics helpers
function round(value: number, precision = 2) {
  return parseFloat(value.toFixed(precision));
}

export function createHistogramData(
  data: DatabaseRow[],
  minBins = 1,
  maxBins = 10,
) {
  const numericScoreValues = data.map((item) => item.value as number);
  if (!Boolean(numericScoreValues.length))
    return { chartData: [], chartLabels: [] };

  const min = round(Math.min(...numericScoreValues));
  const range = round(Math.max(...numericScoreValues)) - min;
  const bins = Math.min(Math.max(minBins, Math.ceil(range)), maxBins);
  const binSize = range / bins ?? 1;

  const baseChartData = Array.from({ length: bins }).map(
    (_, index: number) => ({
      count: 0,
      binLabel: `[${round(min + index * binSize)}, ${round(min + (index + 1) * binSize)}]`,
    }),
  );

  const chartData = numericScoreValues.reduce((acc, value) => {
    const shiftedValue = round(value) - min;
    const binIndex = Math.min(Math.floor(shiftedValue / binSize), bins - 1);
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

function aggregateCategoricalScoreData(
  data: DatabaseRow[],
  previousTimestampChartBin?: ChartBin,
): { categoryCounts: CategoryCounts; labels: string[] } {
  const labels: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { binLabel, ...initialCategoryCounts } =
    previousTimestampChartBin || {};

  const categoryCounts = data.reduce((acc: CategoryCounts, row) => {
    const label = row["stringValue"];
    if (typeof label === "string") {
      labels.push(label);
      const previousBinCount = acc[label] ?? 0;
      const currentBinCount = (row["countStringValue"] as number) ?? 0;
      return { ...acc, [label]: currentBinCount + previousBinCount };
    }
    return acc;
  }, initialCategoryCounts);

  return { categoryCounts, labels };
}

function groupCategoricalScoreDataByTimestamp(
  data: DatabaseRow[],
  scoreTimestampAccessor: string,
): Record<string, DatabaseRow[]> {
  return data.reduce(
    (acc, row) => {
      const timestamp = row[scoreTimestampAccessor];
      if (!(timestamp instanceof Date)) return acc;
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

export function transformCategoricalScoresToChartData(
  data: DatabaseRow[],
  scoreTimestampAccessor: string,
  agg?: DashboardDateRangeAggregationOption,
) {
  if (!agg) {
    const { categoryCounts, labels } = aggregateCategoricalScoreData(data);
    return {
      chartData: [{ ...categoryCounts, binLabel: "Aggregation" }],
      chartLabels: Array.from(new Set(labels)),
    };
  } else {
    const scoreDataByTimestamp = groupCategoricalScoreDataByTimestamp(
      data,
      scoreTimestampAccessor,
    );

    const chartData: ChartBin[] = [];
    const chartLabels: string[] = [];

    Object.entries(scoreDataByTimestamp).forEach(([timestamp, data], index) => {
      const previousTimestampData = chartData[index - 1] || {};
      const { categoryCounts, labels } = aggregateCategoricalScoreData(
        data,
        previousTimestampData,
      );
      chartLabels.push(...labels);
      chartData.push({ ...categoryCounts, binLabel: timestamp } as ChartBin);
    });

    return { chartData, chartLabels: Array.from(new Set(chartLabels)) };
  }
}
