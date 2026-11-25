import { filterOperators } from "../../interfaces/filters";
import {
  FilterList,
  DateTimeFilter,
  ArrayOptionsFilter,
  StringOptionsFilter,
  CategoryOptionsFilter,
  StringFilter,
  NumberFilter,
  BooleanFilter,
  type ClickhouseOperator,
} from "./clickhouse-sql/clickhouse-filter";
import { z } from "zod";
import type { EventsTableFilterState } from "../../types";
import type {
  UiColumnMappings,
  ColumnDefinition,
} from "../../tableDefinitions/types";
import { createFilterFromFilterState } from "./clickhouse-sql/factory";

export type ApiColumnMapping = {
  id: string;
  clickhouseSelect: string;
  clickhouseTable: string;
  filterType: string;
  operator?: ClickhouseOperator;
  clickhousePrefix?: string;
};

/**
 * Base column definition for traces table mappings
 * Single source of truth for all trace column mappings
 */
const TRACES_COLUMN_DEFINITIONS = [
  {
    id: "timestamp",
    name: "Timestamp",
    column: "timestamp",
    filterType: "DateTimeFilter",
  },
  {
    id: "userId",
    name: "User ID",
    column: "user_id",
    filterType: "StringFilter",
  },
  { id: "name", name: "Name", column: "name", filterType: "StringFilter" },
  {
    id: "environment",
    name: "Environment",
    column: "environment",
    filterType: "StringOptionsFilter",
  },
  {
    id: "metadata",
    name: "Metadata",
    column: "metadata",
    filterType: "StringObjectFilter",
  },
  {
    id: "sessionId",
    name: "Session ID",
    column: "session_id",
    filterType: "StringFilter",
  },
  {
    id: "version",
    name: "Version",
    column: "version",
    filterType: "StringFilter",
  },
  {
    id: "release",
    name: "Release",
    column: "release",
    filterType: "StringFilter",
  },
  {
    id: "tags",
    name: "Tags",
    column: "tags",
    filterType: "ArrayOptionsFilter",
  },
] as const;

/**
 * Convenience function: Get just the simple filter mappings for public API
 */
export function createPublicApiTracesColumnMapping(
  tableName: "traces",
  tablePrefix: "t",
): ApiColumnMapping[] {
  const timestampColumn = "timestamp";
  const simpleFilters: ApiColumnMapping[] = [];
  for (const def of TRACES_COLUMN_DEFINITIONS) {
    // For timestamp filters, create fromTimestamp and toTimestamp
    if (def.id === "timestamp") {
      simpleFilters.push(
        {
          id: "fromTimestamp",
          clickhouseSelect: timestampColumn,
          operator: ">=" as const,
          filterType: def.filterType,
          clickhouseTable: tableName,
          clickhousePrefix: tablePrefix,
        },
        {
          id: "toTimestamp",
          clickhouseSelect: timestampColumn,
          operator: "<" as const,
          filterType: def.filterType,
          clickhouseTable: tableName,
          clickhousePrefix: tablePrefix,
        },
      );
    } else {
      // Regular column mapping for simple filters
      simpleFilters.push({
        id: def.id,
        clickhouseSelect: def.column,
        filterType: def.filterType,
        clickhouseTable: tableName,
        clickhousePrefix: tablePrefix,
      });
    }
  }
  return simpleFilters;
}

/**
 * Public API simple filter mappings for the legacy observations table. It
 * does not carry `user_id` or `session_id`, so those filters read the joined
 * traces CTE `t`.
 */
export function createPublicApiObservationsColumnMapping(): ApiColumnMapping[] {
  const traceFieldMapping = {
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  };
  const userIdMapping: ApiColumnMapping = {
    id: "userId",
    clickhouseSelect: "user_id",
    filterType: "StringFilter",
    ...traceFieldMapping,
  };
  const sessionIdMapping: ApiColumnMapping = {
    id: "sessionId",
    clickhouseSelect: "session_id",
    filterType: "StringFilter",
    ...traceFieldMapping,
  };
  return [
    userIdMapping,
    sessionIdMapping,
    {
      id: "traceId",
      clickhouseSelect: "trace_id",
      filterType: "StringFilter",
      clickhouseTable: "observations",
      clickhousePrefix: "o",
    },
    {
      id: "name",
      clickhouseSelect: "name",
      filterType: "StringFilter",
      clickhouseTable: "observations",
      clickhousePrefix: "o",
    },
    {
      id: "level",
      clickhouseSelect: "level",
      filterType: "StringFilter",
      clickhouseTable: "observations",
      clickhousePrefix: "o",
    },
    {
      id: "type",
      clickhouseSelect: "type",
      filterType: "StringFilter",
      clickhouseTable: "observations",
      clickhousePrefix: "o",
    },
    {
      id: "parentObservationId",
      clickhouseSelect: "parent_observation_id",
      filterType: "StringFilter",
      clickhouseTable: "observations",
      clickhousePrefix: "o",
    },
    {
      id: "fromStartTime",
      clickhouseSelect: "start_time",
      operator: ">=",
      filterType: "DateTimeFilter",
      clickhouseTable: "observations",
      clickhousePrefix: "o",
    },
    {
      id: "toStartTime",
      clickhouseSelect: "start_time",
      operator: "<",
      filterType: "DateTimeFilter",
      clickhouseTable: "observations",
      clickhousePrefix: "o",
    },
    {
      id: "version",
      clickhouseSelect: "version",
      filterType: "StringFilter",
      clickhouseTable: "observations",
      clickhousePrefix: "o",
    },
    {
      id: "environment",
      clickhouseSelect: "environment",
      filterType: "StringOptionsFilter",
      clickhouseTable: "observations",
      clickhousePrefix: "o",
    },
  ];
}

type BaseQueryType = {
  page: number;
  limit: number;
  projectId: string;
} & Record<string, unknown>;

export function convertApiProvidedFilterToClickhouseFilter(
  filter: BaseQueryType,
  columnMapping: ApiColumnMapping[],
) {
  const filterList = new FilterList();

  columnMapping.forEach((columnMapping) => {
    const value = filter[columnMapping.id as keyof BaseQueryType];

    if (value !== undefined) {
      let filterInstance;
      switch (columnMapping.filterType) {
        case "DateTimeFilter": {
          // The operator of a datetime column is fixed in the column mapping
          // (e.g. fromTimestamp => ">=", toTimestamp => "<"). The user-provided
          // `operator` query param targets the value filter and must not
          // override it (#8630).
          const finalOperator = columnMapping.operator;

          finalOperator &&
          typeof value === "string" &&
          ["<", "<=", ">", ">="].includes(finalOperator)
            ? (filterInstance = new DateTimeFilter({
                clickhouseTable: columnMapping.clickhouseTable,
                field: columnMapping.clickhouseSelect,
                operator: finalOperator as "<" | "<=" | ">" | ">=",
                value: new Date(value),
                tablePrefix: columnMapping.clickhousePrefix,
              }))
            : undefined;

          break;
        }
        case "ArrayOptionsFilter":
          if (Array.isArray(value) || typeof value === "string") {
            filterInstance = new ArrayOptionsFilter({
              clickhouseTable: columnMapping.clickhouseTable,
              field: columnMapping.clickhouseSelect,
              operator: "all of",
              values: Array.isArray(value) ? value : value.split(","),
              tablePrefix: columnMapping.clickhousePrefix,
            });
          }
          break;
        case "StringOptionsFilter":
          if (Array.isArray(value) || typeof value === "string") {
            filterInstance = new StringOptionsFilter({
              clickhouseTable: columnMapping.clickhouseTable,
              field: columnMapping.clickhouseSelect,
              operator: "any of",
              values: Array.isArray(value) ? value : value.split(","),
              tablePrefix: columnMapping.clickhousePrefix,
            });
          }
          break;
        case "CategoryOptionsFilter":
          if (Array.isArray(value)) {
            const availableOperatorsCategory = z.enum(
              filterOperators.categoryOptions,
            );
            const parsedOperatorCategory = availableOperatorsCategory.safeParse(
              filter.operator,
            );

            if (
              parsedOperatorCategory.success &&
              typeof filter.key === "string"
            ) {
              filterInstance = new CategoryOptionsFilter({
                clickhouseTable: columnMapping.clickhouseTable,
                field: columnMapping.clickhouseSelect,
                key: filter.key,
                operator: parsedOperatorCategory.data,
                values: value,
                tablePrefix: columnMapping.clickhousePrefix,
              });
            }
          }
          break;

        case "StringFilter":
          if (typeof value === "string") {
            filterInstance = new StringFilter({
              clickhouseTable: columnMapping.clickhouseTable,
              field: columnMapping.clickhouseSelect,
              operator: "=",
              value: value,
              tablePrefix: columnMapping.clickhousePrefix,
            });
          }
          break;
        case "NumberFilter": {
          const availableOperatorsNum = z.enum([
            ...filterOperators.number,
            "!=",
          ]);
          const parsedOperatorNum = availableOperatorsNum.safeParse(
            filter.operator,
          );

          if (parsedOperatorNum.success) {
            filterInstance = new NumberFilter({
              clickhouseTable: columnMapping.clickhouseTable,
              field: columnMapping.clickhouseSelect,
              operator: parsedOperatorNum.data,
              value: Number(value),
              tablePrefix: columnMapping.clickhousePrefix,
            });
          }
          break;
        }
        case "BooleanFilter":
          if (typeof value === "boolean") {
            filterInstance = new BooleanFilter({
              clickhouseTable: columnMapping.clickhouseTable,
              field: columnMapping.clickhouseSelect,
              operator: "=",
              value,
              tablePrefix: columnMapping.clickhousePrefix,
            });
          }
          break;
      }

      filterInstance && filterList.push(filterInstance);
    }
  });

  return filterList;
}

type FilterColumn = {
  clickhouseTable: string;
  field: string;
  tablePrefix?: string;
};

const qualifiedField = (filter: FilterColumn) =>
  filter.tablePrefix ? `${filter.tablePrefix}.${filter.field}` : filter.field;

/**
 * Whether an advanced filter and a simple filter target the same column, so
 * the advanced one replaces the simple one. A column reaches a filter either
 * as a bare field plus `tablePrefix` or already qualified (`e.start_time`);
 * both forms name the same column. Equal bare fields match whatever their
 * prefixes: `tablePrefix` is a query alias, not part of the column identity.
 */
const sameColumn = (advanced: FilterColumn, simple: FilterColumn): boolean =>
  advanced.clickhouseTable === simple.clickhouseTable &&
  (advanced.field === simple.field ||
    qualifiedField(advanced) === qualifiedField(simple));

/**
 * Derives a merged FilterList from simple API parameters and advanced filter JSON.
 * Simple filters come from the endpoint's named query params (`userId`,
 * `fromStartTime`, `environment`, ...); advanced filters from its `filter`
 * JSON param.
 * Advanced filters take precedence over simple filters when targeting the same field.
 *
 * @param simpleFilterProps - Object containing simple query parameters (e.g., { userId: "123", name: "test" })
 * @param filterParamsMapping - Column mapping configuration for simple filters
 * @param advancedFilters - Optional array of FilterState objects from JSON filter parameter
 * @param uiColumnDefinitions - UI column definitions for advanced filter conversion
 * @returns Merged FilterList with advanced filters taking precedence
 */
export function deriveFilters<T extends BaseQueryType>(
  simpleFilterProps: T,
  filterParamsMapping: ApiColumnMapping[],
  advancedFilters: EventsTableFilterState | undefined,
  uiColumnDefinitions: UiColumnMappings,
  columnDefinitions?: ColumnDefinition[],
): FilterList {
  // Start with advanced filters converted to FilterList
  const filterList = new FilterList(
    createFilterFromFilterState(
      advancedFilters ?? [],
      uiColumnDefinitions,
      columnDefinitions,
    ),
  );

  // Convert simple parameters to filters
  const simpleFilters = convertApiProvidedFilterToClickhouseFilter(
    simpleFilterProps,
    filterParamsMapping,
  );

  simpleFilters
    .filter(
      (simpleFilter) =>
        !filterList.some((advancedFilter) =>
          sameColumn(advancedFilter, simpleFilter),
        ),
    )
    .forEach((f) => filterList.push(f));

  // Return merged filters
  return filterList;
}
