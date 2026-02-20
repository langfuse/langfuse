import { type FilterState, getGenerationLikeTypes } from "@langfuse/shared";

export type TimeSeriesChartDataPoint = {
  ts: number;
  values: { label: string; value?: number }[];
};
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { api } from "@/src/utils/api";
import {
  type ViewVersion,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";

export const getAllModels = (
  projectId: string,
  globalFilterState: FilterState,
  fromTimestamp: Date,
  toTimestamp: Date,
  metricsVersion?: ViewVersion,
) => {
  const allModels = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      version: metricsVersion,
      query: {
        view: "observations",
        dimensions: [{ field: "providedModelName" }],
        metrics: [],
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
        orderBy: null,
      },
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  return allModels.data ? extractAllModels(allModels.data) : [];
};

const extractAllModels = (
  data: Record<string, unknown>[],
): { model: string; count: number }[] => {
  return data
    .filter((item) => item.providedModelName !== null)
    .map((item) => ({
      model: item.providedModelName as string,
      count: item.count as number,
    }));
};

type ChartData = {
  label: string;
  value?: number;
};

type FieldMappingItem = {
  uniqueIdentifierColumns: {
    accessor: string;
    formatFct?: (value: string) => string;
  }[];
  valueColumn: string;
};

function generateChartLabelFromColumns(
  uniqueIdentifierColumns: FieldMappingItem["uniqueIdentifierColumns"],
  row: DatabaseRow,
): string {
  return uniqueIdentifierColumns
    .map(({ accessor, formatFct }) => {
      if (row[accessor] === null || row[accessor] === undefined) return null;
      return formatFct
        ? formatFct(row[accessor] as string)
        : (row[accessor] as string);
    })
    .filter((value) => value !== null)
    .join(" ");
}

// we get data for time series in the following format:
// ts: 123, label1: 1, label2: 2
// ts: 456, label1: 5, label2: 9
// This needs to be mapped to the following format:
// [{ts: 123, values: [{label1: 1, label2: 2}]}, {ts: 456, values: [{label1: 5, label2: 9}]]

export function extractTimeSeriesData(
  data: DatabaseRow[],
  timeColumn: string,
  mapping: FieldMappingItem[],
): Map<number, ChartData[]> {
  return data.reduce((acc: Map<number, ChartData[]>, curr: DatabaseRow) => {
    const date = new Date(curr[timeColumn] as Date).getTime();

    const reducedData: ChartData[] = [];
    // Map the desired fields from the DatabaseRow to the ChartData based on the mapping provided
    mapping.forEach((mapItem) => {
      const chartLabel = generateChartLabelFromColumns(
        mapItem.uniqueIdentifierColumns,
        curr,
      );
      const columnValue = curr[mapItem.valueColumn];
      if (
        chartLabel &&
        columnValue !== undefined &&
        typeof chartLabel === "string"
      ) {
        reducedData.push({
          label: chartLabel,
          value: columnValue ? (columnValue as number) : 0,
        });
      }
    });

    const existingData = acc.get(date);
    if (existingData) {
      existingData.push(...reducedData);
    } else {
      acc.set(date, reducedData);
    }

    return acc;
  }, new Map<number, ChartData[]>());
}

export function fillMissingValuesAndTransform(
  inputMap: Map<number, ChartData[]>,
  labelsToAdd: string[] = [],
): TimeSeriesChartDataPoint[] {
  const result: TimeSeriesChartDataPoint[] = [];

  inputMap.forEach((chartDataArray, timestamp) => {
    const existingLabels = chartDataArray.map((value) => value.label);

    // For each label in labelsToAdd, add a default value of 0
    labelsToAdd.forEach((label) => {
      if (!existingLabels.includes(label)) {
        chartDataArray.push({ label: label, value: 0 });
      }
    });

    result.push({
      ts: timestamp,
      values: chartDataArray,
    });
  });
  return result;
}

export const isEmptyTimeSeries = ({
  data,
  isNullValueAllowed = false,
}: {
  data: TimeSeriesChartDataPoint[];
  isNullValueAllowed?: boolean;
}) => {
  return (
    data.length === 0 ||
    data.every(
      (item) =>
        item.values.length === 0 ||
        (isNullValueAllowed
          ? false
          : item.values.every((value) => value.value === 0)),
    )
  );
};
