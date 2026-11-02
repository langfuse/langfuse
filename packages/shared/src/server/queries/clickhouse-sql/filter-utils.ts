import { convertDateToClickhouseDateTime } from "../../clickhouse/client";
import { DateTimeFilter, type FilterList } from "./clickhouse-filter";

/**
 * Internal helper: extract and convert time filter from FilterList
 * Common pattern: find time filter and convert to ClickHouse DateTime format
 */
export function extractTimeFilter(
  filter: FilterList,
  tableName: "events_proto" | "traces" = "events_proto",
  fieldName: "start_time" | "timestamp" = "start_time",
  prefix?: "e" | "t",
): string | null {
  const timeFilter = filter.find((filterItem) => {
    // For events tables, match any events_* prefix (events_proto, events_core, events_full)
    const normalizedField = filterItem.field.replaceAll('"', "");
    const expectedField = prefix ? `${prefix}.${fieldName}` : fieldName;

    return (
      (tableName === "events_proto"
        ? filterItem.clickhouseTable.startsWith("events_")
        : filterItem.clickhouseTable === tableName) &&
      (normalizedField === expectedField ||
        (!prefix && normalizedField.endsWith(`.${fieldName}`))) &&
      (filterItem.operator === ">=" || filterItem.operator === ">")
    );
  });

  return timeFilter
    ? convertDateToClickhouseDateTime((timeFilter as DateTimeFilter).value)
    : null;
}
