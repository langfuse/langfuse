import { type TimeSeriesChartDataPoint } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { type FilterState } from "@langfuse/shared";
import { type DatabaseRow } from "@/src/server/api/services/query-builder";
import { api } from "@/src/utils/api";

export const getAllModels = (
  projectId: string,
  globalFilterState: FilterState,
) => {
  const allModels = api.dashboard.chart.useQuery(
    {
      projectId,
      from: "traces_observations",
      select: [{ column: "model" }],
      filter: [
        ...globalFilterState,
        {
          type: "string",
          column: "type",
          operator: "=",
          value: "GENERATION",
        },
      ],
      groupBy: [{ type: "string", column: "model" }],
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

const extractAllModels = (data: DatabaseRow[]): string[] => {
  return data
    .filter((item) => item.model !== null)
    .map((item) => item.model as string);
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
