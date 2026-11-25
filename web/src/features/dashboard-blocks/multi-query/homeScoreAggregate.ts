import { dashboardColumnDefinitions, type FilterState } from "@langfuse/shared";
import { type QueryType, type ViewVersion } from "@langfuse/shared/query";
import { mapViewFilterToUiTableFilter } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { type RouterInputs } from "@/src/utils/api";

const definitionFields = new Map([
  ["name", "scoreName"],
  ["source", "scoreSource"],
  ["dataType", "scoreDataType"],
]);
const metricKey = ({ aggregation, measure }: QueryType["metrics"][number]) =>
  `${aggregation}_${measure}`;

/** Home counts stored v3 score types and applies its own trace lookback to score filters. */
export function homeScoreAggregate(query: QueryType) {
  const metrics = query.metrics.map(metricKey);
  if (
    query.view !== "scores-numeric" ||
    query.timeDimension ||
    query.dimensions.some((d) => !definitionFields.has(d.field)) ||
    metrics.some((m) => !["sum_count", "count_count", "avg_value"].includes(m))
  ) {
    throw new Error(
      "Home score records support counts and numeric means, grouped by name, source or data type over the full time range.",
    );
  }
  if (
    query.orderBy?.some(
      (o) =>
        !metrics.includes(o.field) &&
        !query.dimensions.some((d) => d.field === o.field),
    )
  ) {
    throw new Error(
      "Order the Home score records by a selected measure or breakdown.",
    );
  }
  return mapViewFilterToUiTableFilter("scores-numeric", query.filters).map(
    (filter, index) => {
      const column = dashboardColumnDefinitions.find(
        (c) =>
          c.uiTableName === filter.column ||
          c.uiTableId === filter.column ||
          c.uiTableId === query.filters[index]?.column ||
          c.aliases?.includes(filter.column),
      );
      if (
        !column ||
        !["scores", "traces"].includes(column.clickhouseTableName ?? "") ||
        filter.type === "datetime"
      ) {
        throw new Error(
          `This filter is unavailable for Home score records: ${filter.column}`,
        );
      }
      return { ...filter, column: column.uiTableId };
    },
  );
}

export function homeScoreInput(
  projectId: string,
  version: ViewVersion,
  query: Pick<QueryType, "fromTimestamp" | "toTimestamp">,
  filters: FilterState,
): RouterInputs["dashboard"]["chart"] {
  return {
    projectId,
    version,
    from: "traces_scores",
    queryName: "score-aggregate",
    select: [],
    filter: [
      ...filters,
      {
        column: "scoreTimestamp",
        type: "datetime",
        operator: ">",
        value: new Date(query.fromTimestamp),
      },
      {
        column: "scoreTimestamp",
        type: "datetime",
        operator: "<",
        value: new Date(query.toTimestamp),
      },
    ],
  };
}

/** Reduce the full Home response before ranking or limiting the requested breakdown. */
export function homeScoreRows(
  query: QueryType,
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const groups = new Map<
    string,
    {
      dimensions: Record<string, unknown>;
      count: number;
      numericCount: number;
      numericSum: number;
    }
  >();
  const createGroup = (dimensions: Record<string, unknown>) => ({
    dimensions,
    count: 0,
    numericCount: 0,
    numericSum: 0,
  });
  if (!query.dimensions.length) groups.set("[]", createGroup({}));
  for (const row of rows) {
    const dimensions = Object.fromEntries(
      query.dimensions.map((d) => [
        d.field,
        row[definitionFields.get(d.field)!],
      ]),
    );
    const key = JSON.stringify(Object.values(dimensions));
    const group = groups.get(key) ?? createGroup(dimensions);
    const count = Number(row.countScoreId);
    group.count += count;
    if (row.scoreDataType === "NUMERIC" || row.scoreDataType === "BOOLEAN") {
      group.numericCount += count;
      group.numericSum += count * Number(row.avgValue);
    }
    groups.set(key, group);
  }
  const result = [...groups.values()].map((group) => {
    const mean = group.numericCount
      ? group.numericSum / group.numericCount
      : null;
    return {
      ...group.dimensions,
      ...Object.fromEntries(
        query.metrics.map((metric) => [
          metricKey(metric),
          metric.measure === "count" ? group.count : mean,
        ]),
      ),
    };
  });
  for (const order of [...(query.orderBy ?? [])].reverse()) {
    result.sort((a, b) => {
      const left = a[order.field],
        right = b[order.field];
      if (left === right) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      const compare =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));
      return order.direction === "asc" ? compare : -compare;
    });
  }
  return result.slice(0, query.chartConfig?.row_limit ?? result.length);
}
