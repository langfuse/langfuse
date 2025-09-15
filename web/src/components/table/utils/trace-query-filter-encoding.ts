import {
  type FilterState,
  type ColumnDefinition,
  tracesTableCols,
  singleFilter,
} from "@langfuse/shared";
import {
  type ColumnToQueryKeyMap,
  encodeFiltersGeneric,
  decodeFiltersGeneric,
} from "@/src/features/filters/lib/filter-query-encoding";

const TRACE_COLUMN_TO_QUERY_KEY: ColumnToQueryKeyMap = {
  name: "name",
  tags: "tags",
  environment: "env",
  level: "level",
  bookmarked: "bookmarked",
};

export type TraceFilterQueryOptions = Record<
  keyof typeof TRACE_COLUMN_TO_QUERY_KEY,
  string[]
>;

export const encodeTraceFilters = (
  filters: FilterState,
  options: TraceFilterQueryOptions,
): string => {
  return encodeFiltersGeneric(filters, TRACE_COLUMN_TO_QUERY_KEY, options);
};

export const decodeTraceFilters = (
  query: string,
  options: TraceFilterQueryOptions,
): FilterState => {
  const filters = decodeFiltersGeneric(
    query,
    TRACE_COLUMN_TO_QUERY_KEY,
    options,
    (column) => {
      const columnDef = tracesTableCols.find((col) => col.id === column);
      return columnDef?.type || "stringOptions";
    },
  );

  const result: FilterState = [];
  for (const filter of filters) {
    const validationResult = singleFilter.safeParse(filter);
    if (validationResult.success) {
      result.push(validationResult.data);
    } else {
      console.warn(`Invalid filter skipped:`, filter, validationResult.error);
    }
  }
  return result;
};

export const getTraceShortKey = (column: string): string | null => {
  return TRACE_COLUMN_TO_QUERY_KEY[column] ?? null;
};

export function applyTraceFilterSelection(params: {
  current: FilterState;
  column: string;
  values: string[];
  options: TraceFilterQueryOptions;
  operator?: "any of" | "none of";
}): FilterState {
  const { current, column, values, options, operator } = params;
  const other = current.filter((f) => f.column !== column);

  const colDef: ColumnDefinition | undefined = tracesTableCols.find(
    (c) => c.id === column || c.name === column,
  );
  const colType = colDef?.type;

  // special case for bookmarked column
  if (column === "bookmarked") {
    if (values.length === 0 || values.length === 2) return other;
    if (values.includes("Bookmarked")) {
      return [
        ...other,
        {
          column,
          type: "boolean" as const,
          operator: "=" as const,
          value: true,
        },
      ];
    }
    if (values.includes("Not bookmarked")) {
      return [
        ...other,
        {
          column,
          type: "boolean" as const,
          operator: "=" as const,
          value: false,
        },
      ];
    }
    return other;
  }

  if (!(column in options)) return current;
  const availableValues = options[column as keyof TraceFilterQueryOptions];

  if (
    values.length === 0 ||
    (values.length === availableValues.length &&
      availableValues.every((v) => values.includes(v)))
  ) {
    return other;
  }

  const finalOperator: "any of" | "none of" = operator ?? "any of";
  const filterType: "arrayOptions" | "stringOptions" =
    colType === "arrayOptions" ? "arrayOptions" : "stringOptions";

  if (filterType === "arrayOptions") {
    return [
      ...other,
      {
        column,
        type: "arrayOptions" as const,
        operator: finalOperator,
        value: values,
      },
    ];
  }

  return [
    ...other,
    {
      column,
      type: "stringOptions" as const,
      operator: finalOperator,
      value: values,
    },
  ];
}
