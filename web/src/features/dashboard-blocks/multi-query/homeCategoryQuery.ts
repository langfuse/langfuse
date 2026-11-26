import {
  InvalidRequestError,
  dashboardColumnDefinitions,
  type FilterState,
} from "@langfuse/shared";
import { type QueryType } from "@langfuse/shared/query";
import { mapViewFilterToUiTableFilter } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { type RouterInputs } from "@/src/utils/api";

export function homeCategoryQuery(query: QueryType) {
  const metric = query.metrics.find(
    (metric) =>
      metric.measure === "costByType" || metric.measure === "usageByType",
  );
  if (!metric) return;
  const isCost = metric.measure === "costByType";
  const field = isCost ? "costType" : "usageType";
  if (
    query.view !== "observations" ||
    query.metrics.length !== 1 ||
    metric.aggregation !== "sum" ||
    query.dimensions.length !== 1 ||
    query.dimensions[0]?.field !== field ||
    query.timeDimension?.granularity !== "auto" ||
    query.orderBy?.length
  ) {
    throw new InvalidRequestError(
      "A Home category query on v3 needs a time chart, automatic intervals, and the sum grouped by its category.",
    );
  }
  const filters = mapViewFilterToUiTableFilter(
    "observations",
    query.filters,
  ).map((filter) => {
    const column = dashboardColumnDefinitions.find(
      (c) =>
        c.uiTableName === filter.column ||
        c.uiTableId === filter.column ||
        c.aliases?.includes(filter.column),
    );
    if (
      !column ||
      column.clickhouseTableName === "scores" ||
      filter.type === "datetime"
    )
      throw new InvalidRequestError(
        "This filter is unavailable for Home categories on v3: " +
          filter.column,
      );
    return { ...filter, column: column.uiTableId };
  });
  const queryName = isCost
    ? ("observations-cost-by-type-timeseries" as const)
    : ("observations-usage-by-type-timeseries" as const);
  return { queryName, field, measure: metric.measure, filters };
}

/** The Home endpoint derives the time buckets and grouping from the named operation. */
export function homeCategoryInput(
  projectId: string,
  query: Pick<QueryType, "fromTimestamp" | "toTimestamp">,
  category: NonNullable<ReturnType<typeof homeCategoryQuery>>,
): RouterInputs["dashboard"]["chart"] {
  const range: FilterState = [
    {
      column: "startTime",
      type: "datetime",
      operator: ">",
      value: new Date(query.fromTimestamp),
    },
    {
      column: "startTime",
      type: "datetime",
      operator: "<",
      value: new Date(query.toTimestamp),
    },
  ];
  return {
    projectId,
    queryName: category.queryName,
    version: "v1",
    from: "traces_observations",
    select: [],
    filter: [...category.filters, ...range],
  };
}
