import { type ScoreQueryType } from "@/src/features/public-api/server/sores";
import { filterOperators } from "@langfuse/shared";
import {
  FilterList,
  DateTimeFilter,
  ArrayOptionsFilter,
  StringOptionsFilter,
  StringFilter,
  NumberFilter,
  type ClickhouseOperator,
} from "@langfuse/shared/src/server";
import { z } from "zod";

export type ApiColumnMapping = {
  id: string;
  clickhouseSelect: string;
  clickhouseTable: string;
  filterType: string;
  operator?: ClickhouseOperator;
  clickhousePrefix?: string;
};

export function convertApiProvidedFilterToClickhouseFilter(
  filter: ScoreQueryType,
  columnMapping: ApiColumnMapping[],
) {
  const filterList = new FilterList();

  columnMapping.forEach((columnMapping) => {
    const value = filter[columnMapping.id as keyof ScoreQueryType];

    if (value) {
      let filterInstance;
      switch (columnMapping.filterType) {
        case "DateTimeFilter":
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
        case "NumberFilter":
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

      filterInstance && filterList.push(filterInstance);
    }
  });

  console.log("filterList", filterList);
  return filterList;
}
