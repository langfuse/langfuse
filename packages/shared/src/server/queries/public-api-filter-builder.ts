import { filterOperators } from "../../interfaces/filters";
import {
  FilterList,
  DateTimeFilter,
  ArrayOptionsFilter,
  StringOptionsFilter,
  CategoryOptionsFilter,
  StringFilter,
  NumberFilter,
  type ClickhouseOperator,
} from "./clickhouse-sql/clickhouse-filter";
import { z } from "zod/v4";

export type ApiColumnMapping = {
  id: string;
  clickhouseSelect: string;
  clickhouseTable: string;
  filterType: string;
  operator?: ClickhouseOperator;
  clickhousePrefix?: string;
};

/**
 * Factory function to create public API column mappings for events/observations tables.
 * Eliminates duplication between events and observations filter mappings.
 */
export function createPublicApiObservationsColumnMapping(
  tableName: "events" | "observations",
  tablePrefix: "e" | "o",
  parentFieldName: "parent_span_id" | "parent_observation_id",
): ApiColumnMapping[] {
  return [
    {
      id: "userId",
      clickhouseSelect: "user_id",
      filterType: "StringFilter",
      clickhouseTable: "traces",
      clickhousePrefix: "t",
    },
    {
      id: "traceId",
      clickhouseSelect: "trace_id",
      filterType: "StringFilter",
      clickhouseTable: tableName,
      clickhousePrefix: tablePrefix,
    },
    {
      id: "name",
      clickhouseSelect: "name",
      filterType: "StringFilter",
      clickhouseTable: tableName,
      clickhousePrefix: tablePrefix,
    },
    {
      id: "level",
      clickhouseSelect: "level",
      filterType: "StringFilter",
      clickhouseTable: tableName,
      clickhousePrefix: tablePrefix,
    },
    {
      id: "type",
      clickhouseSelect: "type",
      filterType: "StringFilter",
      clickhouseTable: tableName,
      clickhousePrefix: tablePrefix,
    },
    {
      id: "parentObservationId",
      clickhouseSelect: parentFieldName,
      filterType: "StringFilter",
      clickhouseTable: tableName,
      clickhousePrefix: tablePrefix,
    },
    {
      id: "fromStartTime",
      clickhouseSelect: "start_time",
      operator: ">=",
      filterType: "DateTimeFilter",
      clickhouseTable: tableName,
      clickhousePrefix: tablePrefix,
    },
    {
      id: "toStartTime",
      clickhouseSelect: "start_time",
      operator: "<",
      filterType: "DateTimeFilter",
      clickhouseTable: tableName,
      clickhousePrefix: tablePrefix,
    },
    {
      id: "version",
      clickhouseSelect: "version",
      filterType: "StringFilter",
      clickhouseTable: tableName,
      clickhousePrefix: tablePrefix,
    },
    {
      id: "environment",
      clickhouseSelect: "environment",
      filterType: "StringFilter",
      clickhouseTable: tableName,
      clickhousePrefix: tablePrefix,
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

    if (value) {
      let filterInstance;
      switch (columnMapping.filterType) {
        case "DateTimeFilter": {
          // get filter options from the filterOperators
          // validate that the user provided operator is in the list of available operators
          const availableOperators = z.enum(filterOperators.datetime);
          const parsedOperator = availableOperators.safeParse(filter.operator);

          // otherwise fall back to the operator provided in the column mapping
          const finalOperator = parsedOperator.success
            ? parsedOperator.data
            : columnMapping.operator;

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
      }

      filterInstance && filterList.push(filterInstance);
    }
  });

  return filterList;
}
