import {
  eventsTableCols,
  type FilterState,
  type singleFilter,
} from "@langfuse/shared";
import {
  determineTimeGranularity,
  getTimeBucketRange,
  type QueryType,
  type TimeGranularity,
} from "@langfuse/shared/query";
import { type z } from "zod";
import { encodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import { rangeToString } from "@/src/utils/date-range-utils";

type SingleFilter = z.infer<typeof singleFilter>;

type QueryView = QueryType["view"];

export type ChartDrilldownMark =
  | { type: "base" }
  | { type: "dimension"; field: string; value: unknown }
  | {
      type: "timeSeries";
      bucketStart: string | undefined;
      dimension?: { field: string; value: unknown };
    }
  | {
      type: "entity";
      entity: { field: string; value: unknown };
      dimension?: { field: string; value: unknown };
    }
  | {
      type: "histogramBin";
      measure: string;
      lower: number;
      upper: number;
      isLastBin: boolean;
    }
  | {
      type: "pivot";
      dimensions: Array<{ field: string; value: unknown }>;
    };

const EVENT_COLUMN_BY_ID: ReadonlyMap<
  string,
  (typeof eventsTableCols)[number]
> = new Map(eventsTableCols.map((column) => [column.id, column]));

const SCORE_SPECIFIC_FIELDS = new Set([
  "configId",
  "dataType",
  "id",
  "name",
  "source",
  "stringValue",
  "value",
]);

const getV4TracesFilterColumn = (
  view: QueryView,
  field: string,
): string | null => {
  if (field === "metadata") return "metadata";

  switch (field) {
    case "environment":
    case "experimentDatasetId":
    case "experimentId":
    case "experimentName":
    case "hasParentObservation":
    case "input":
    case "isExperimentItemRootSpan":
    case "isRootObservation":
    case "level":
    case "modelId":
    case "output":
    case "promptName":
    case "promptVersion":
    case "providedModelName":
    case "sessionId":
    case "statusMessage":
    case "toolCalls":
    case "toolDefinitions":
    case "toolNames":
    case "calledToolNames":
    case "traceId":
    case "traceName":
    case "type":
    case "userId":
    case "version":
      return field;
    case "tags":
      return "traceTags";
    case "traceVersion":
      return "version";
    case "observationId":
      return view === "scores-numeric" || view === "scores-categorical"
        ? "id"
        : null;
    case "observationName":
      return view === "scores-numeric" || view === "scores-categorical"
        ? "name"
        : null;
    case "observationModelName":
      return view === "scores-numeric" || view === "scores-categorical"
        ? "providedModelName"
        : null;
    case "observationPromptName":
      return view === "scores-numeric" || view === "scores-categorical"
        ? "promptName"
        : null;
    case "observationPromptVersion":
      return view === "scores-numeric" || view === "scores-categorical"
        ? "promptVersion"
        : null;
    case "id":
      return view === "traces"
        ? "traceId"
        : view === "observations"
          ? "id"
          : null;
    case "name":
      if (view === "traces") return "traceName";
      if (view === "observations") return "name";
      return null;
    case "start_time":
    case "timestamp":
      return "startTime";
    default:
      return null;
  }
};

const isSupportedScoreField = (view: QueryView, field: string) =>
  (view === "scores-numeric" || view === "scores-categorical") &&
  !SCORE_SPECIFIC_FIELDS.has(field);

const isSupportedField = (view: QueryView, field: string) => {
  if (view === "scores-numeric" || view === "scores-categorical") {
    return isSupportedScoreField(view, field);
  }
  return getV4TracesFilterColumn(view, field) !== null;
};

const getEventColumn = (columnId: string) => EVENT_COLUMN_BY_ID.get(columnId);

const isCompatibleFilterType = (
  targetType: string | undefined,
  filterType: SingleFilter["type"],
): boolean => {
  switch (targetType) {
    case "string":
    case "stringOptions":
      return filterType === "string" || filterType === "stringOptions";
    case "arrayOptions":
      return filterType === "arrayOptions" || filterType === "stringOptions";
    case "datetime":
      return filterType === "datetime";
    case "number":
      return filterType === "number";
    case "boolean":
      return filterType === "boolean";
    case "stringObject":
      return filterType === "stringObject";
    case "null":
      return filterType === "null";
    default:
      return filterType === "null";
  }
};

const mapFilterToV4TracesFilter = (
  view: QueryView,
  filter: SingleFilter,
): SingleFilter | null => {
  const column = getV4TracesFilterColumn(view, filter.column);
  if (!column) return null;

  const eventColumn = getEventColumn(column);
  if (!eventColumn && filter.type !== "null") return null;

  if (filter.type === "stringObject") {
    return column === "metadata" ? { ...filter, column } : null;
  }

  if (filter.type === "null") {
    return { ...filter, column };
  }

  if (!isCompatibleFilterType(eventColumn?.type, filter.type)) return null;

  if (filter.type === "stringOptions" && eventColumn?.type === "string") {
    if (filter.operator !== "any of" || filter.value.length !== 1) return null;
    return {
      column,
      type: "string",
      operator: "=",
      value: filter.value[0]!,
    };
  }

  if (filter.type === "string" && eventColumn?.type === "stringOptions") {
    return filter.operator === "="
      ? {
          column,
          type: "stringOptions",
          operator: "any of",
          value: [filter.value],
        }
      : { ...filter, column };
  }

  if (filter.type === "stringOptions" && eventColumn?.type === "arrayOptions") {
    return {
      column,
      type: "arrayOptions",
      operator: filter.operator,
      value: filter.value,
    };
  }

  return { ...filter, column };
};

const buildNullFilter = (column: string): SingleFilter => ({
  column,
  type: "null",
  operator: "is null",
  value: "",
});

const buildEqualityFilter = (
  view: QueryView,
  field: string,
  rawValue: unknown,
): SingleFilter | null => {
  if (!isSupportedField(view, field)) return null;

  const column = getV4TracesFilterColumn(view, field);
  if (!column) return null;

  const eventColumn = getEventColumn(column);
  if (!eventColumn) return null;

  if (rawValue === null || rawValue === undefined) {
    return buildNullFilter(column);
  }

  if (eventColumn.type === "arrayOptions") {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    return {
      column,
      type: "arrayOptions",
      operator: "any of",
      value: values.map((value) => String(value)),
    };
  }

  if (eventColumn.type === "stringOptions") {
    return {
      column,
      type: "stringOptions",
      operator: "any of",
      value: [String(rawValue)],
    };
  }

  if (eventColumn.type === "string") {
    return {
      column,
      type: "string",
      operator: "=",
      value: String(rawValue),
    };
  }

  if (eventColumn.type === "number") {
    if (typeof rawValue === "string" && rawValue.trim() === "") return null;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return null;
    return {
      column,
      type: "number",
      operator: "=",
      value,
    };
  }

  if (eventColumn.type === "boolean") {
    if (typeof rawValue !== "boolean") return null;
    return {
      column,
      type: "boolean",
      operator: "=",
      value: rawValue,
    };
  }

  return null;
};

const mapBaseFilters = (query: QueryType): FilterState | null => {
  const filters: FilterState = [];

  for (const filter of query.filters) {
    const mapped = mapFilterToV4TracesFilter(query.view, filter);
    if (!mapped) return null;
    filters.push(mapped);
  }

  return filters;
};

const getResolvedGranularity = (query: QueryType): TimeGranularity | null => {
  if (!query.timeDimension) return null;

  return query.timeDimension.granularity === "auto"
    ? determineTimeGranularity(query.fromTimestamp, query.toTimestamp)
    : query.timeDimension.granularity;
};

const getDrilldownDateRange = (
  query: QueryType,
  mark: ChartDrilldownMark | undefined,
): { from: Date; to: Date } | null => {
  const queryRange = {
    from: new Date(query.fromTimestamp),
    to: new Date(query.toTimestamp),
  };

  if (
    !mark ||
    mark.type !== "timeSeries" ||
    !mark.bucketStart ||
    !query.timeDimension
  ) {
    return queryRange;
  }

  const bucketStart = new Date(mark.bucketStart);
  const granularity = getResolvedGranularity(query);
  if (!granularity || !Number.isFinite(bucketStart.getTime())) return null;

  return getTimeBucketRange({
    bucketStart,
    granularity,
    queryFrom: queryRange.from,
    queryTo: queryRange.to,
  });
};

const convertHistogramBoundary = (params: {
  view: QueryView;
  measure: string;
  value: number;
}): number => {
  if (
    params.view === "observations" &&
    (params.measure === "latency" || params.measure === "timeToFirstToken")
  ) {
    return params.value / 1000;
  }

  return params.value;
};

const getHistogramMeasureColumn = (
  view: QueryView,
  measure: string,
): string | null => {
  if (view !== "observations") return null;

  switch (measure) {
    case "inputCost":
    case "inputTokens":
    case "latency":
    case "outputCost":
    case "outputTokens":
    case "timeToFirstToken":
    case "tokensPerSecond":
    case "toolCalls":
    case "toolDefinitions":
    case "totalCost":
    case "totalTokens":
      return measure;
    default:
      return null;
  }
};

const buildMarkFilters = (
  query: QueryType,
  mark: ChartDrilldownMark | undefined,
): FilterState | null => {
  if (!mark || mark.type === "base" || mark.type === "timeSeries") {
    if (mark?.type === "timeSeries" && mark.dimension) {
      const dimensionFilter = buildEqualityFilter(
        query.view,
        mark.dimension.field,
        mark.dimension.value,
      );
      return dimensionFilter ? [dimensionFilter] : null;
    }
    return [];
  }

  if (mark.type === "dimension") {
    const filter = buildEqualityFilter(query.view, mark.field, mark.value);
    return filter ? [filter] : null;
  }

  if (mark.type === "entity") {
    const entityFilter = buildEqualityFilter(
      query.view,
      mark.entity.field,
      mark.entity.value,
    );
    if (!entityFilter) return null;

    if (!mark.dimension) return [entityFilter];

    const dimensionFilter = buildEqualityFilter(
      query.view,
      mark.dimension.field,
      mark.dimension.value,
    );
    return dimensionFilter ? [entityFilter, dimensionFilter] : null;
  }

  if (mark.type === "pivot") {
    const filters: FilterState = [];
    for (const dimension of mark.dimensions) {
      const filter = buildEqualityFilter(
        query.view,
        dimension.field,
        dimension.value,
      );
      if (!filter) return null;
      filters.push(filter);
    }
    return filters;
  }

  if (mark.type === "histogramBin") {
    const column = getHistogramMeasureColumn(query.view, mark.measure);
    if (!column) return null;

    const lower = convertHistogramBoundary({
      view: query.view,
      measure: mark.measure,
      value: mark.lower,
    });
    const upper = convertHistogramBoundary({
      view: query.view,
      measure: mark.measure,
      value: mark.upper,
    });

    if (!Number.isFinite(lower) || !Number.isFinite(upper)) return null;

    return [
      { column, type: "number", operator: ">=", value: lower },
      {
        column,
        type: "number",
        operator: mark.isLastBin ? "<=" : "<",
        value: upper,
      },
    ];
  }

  const exhaustiveCheck: never = mark;
  return exhaustiveCheck;
};

export function buildV4TracesChartDrilldownPath(params: {
  projectId: string;
  query: QueryType;
  mark?: ChartDrilldownMark;
}): string | null {
  const baseFilters = mapBaseFilters(params.query);
  if (!baseFilters) return null;

  const markFilters = buildMarkFilters(params.query, params.mark);
  if (!markFilters) return null;

  const dateRange = getDrilldownDateRange(params.query, params.mark);
  if (!dateRange) return null;

  const searchParams = new URLSearchParams();
  searchParams.set("dateRange", rangeToString(dateRange));

  const filters = [...baseFilters, ...markFilters];
  if (filters.length > 0) {
    searchParams.set("filter", encodeFiltersGeneric(filters));
  }

  const queryString = searchParams.toString();

  return `/project/${encodeURIComponent(params.projectId)}/traces${
    queryString ? `?${queryString}` : ""
  }`;
}

export function serializePivotDrilldownDimensions(
  dimensions: Record<string, unknown>,
): string {
  return JSON.stringify(
    Object.entries(dimensions)
      .filter(([key]) => key !== "total" && key !== "subtotal")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, value === undefined ? null : value]),
  );
}
