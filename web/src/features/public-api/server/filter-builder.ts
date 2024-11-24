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
};

export function convertApiProvidedFilterToClickhouseFilter(
  filter: ScoreQueryType,
  columnMapping: ApiColumnMapping[],
) {
  const filterList = new FilterList();

  columnMapping.forEach((secureFilterOption) => {
    const value = filter[secureFilterOption.id as keyof ScoreQueryType];

    if (value) {
      let filterInstance;
      switch (secureFilterOption.filterType) {
        case "DateTimeFilter":
          const availableOperators = z.enum(filterOperators.datetime);
          const parsedOperator = availableOperators.safeParse(filter.operator);
          typeof value === "string" &&
          secureFilterOption.operator &&
          parsedOperator.success
            ? (filterInstance = new DateTimeFilter({
                clickhouseTable: secureFilterOption.clickhouseTable,
                field: secureFilterOption.clickhouseSelect,
                operator: parsedOperator.data,
                value: new Date(value),
                tablePrefix:
                  secureFilterOption.clickhouseTable === "scores" ? "s" : "t",
              }))
            : undefined;

          break;
        case "ArrayOptionsFilter":
          if (Array.isArray(value) || typeof value === "string") {
            filterInstance = new ArrayOptionsFilter({
              clickhouseTable: secureFilterOption.clickhouseTable,
              field: secureFilterOption.clickhouseSelect,
              operator: "all of",
              values: Array.isArray(value) ? value : value.split(","),
              tablePrefix:
                secureFilterOption.clickhouseTable === "scores" ? "s" : "t",
            });
          }
          break;
        case "StringOptionsFilter":
          if (Array.isArray(value) || typeof value === "string") {
            filterInstance = new StringOptionsFilter({
              clickhouseTable: secureFilterOption.clickhouseTable,
              field: secureFilterOption.clickhouseSelect,
              operator: "any of",
              values: Array.isArray(value) ? value : value.split(","),
              tablePrefix:
                secureFilterOption.clickhouseTable === "scores" ? "s" : "t",
            });
          }
          break;
        case "StringFilter":
          if (typeof value === "string") {
            filterInstance = new StringFilter({
              clickhouseTable: secureFilterOption.clickhouseTable,
              field: secureFilterOption.clickhouseSelect,
              operator: "=",
              value: value,
              tablePrefix:
                secureFilterOption.clickhouseTable === "scores" ? "s" : "t",
            });
          }
          break;
        case "NumberFilter":
          const availableOperatorsNum = z.enum([
            "=",
            ">",
            "<",
            ">=",
            "<=",
            "!=",
          ]);
          const parsedOperatorNum = availableOperatorsNum.safeParse(
            filter.operator,
          );

          if (parsedOperatorNum.success) {
            filterInstance = new NumberFilter({
              clickhouseTable: secureFilterOption.clickhouseTable,
              field: secureFilterOption.clickhouseSelect,
              operator: parsedOperatorNum.data,
              value: Number(value),
              tablePrefix:
                secureFilterOption.clickhouseTable === "scores" ? "s" : "t",
            });
          }
          break;
      }

      filterInstance && filterList.push(filterInstance);
    }
  });
  return filterList;
}
