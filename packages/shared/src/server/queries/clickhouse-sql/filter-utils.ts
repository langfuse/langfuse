import { convertDateToClickhouseDateTime } from "../../clickhouse/client";
import {
  DateTimeFilter,
  type Filter,
  type FilterList,
} from "./clickhouse-filter";

/** Match a datetime field across table variants and optional SQL aliases. */
export function isTimeFilter(
  filter: Filter,
  tableName: "events_proto" | "traces" = "events_proto",
  fieldName: "start_time" | "timestamp" = "start_time",
  prefix?: "e" | "t",
): filter is DateTimeFilter {
  const field = filter.field.replaceAll('"', "");
  const expectedField = prefix ? `${prefix}.${fieldName}` : fieldName;
  return (
    filter instanceof DateTimeFilter &&
    (tableName === "events_proto"
      ? filter.clickhouseTable.startsWith("events_")
      : filter.clickhouseTable === tableName) &&
    (field === expectedField || (!prefix && field.endsWith(`.${fieldName}`)))
  );
}

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
  const timeFilter = filter.find(
    (item) =>
      isTimeFilter(item, tableName, fieldName, prefix) &&
      (item.operator === ">=" || item.operator === ">"),
  );

  return timeFilter
    ? convertDateToClickhouseDateTime((timeFilter as DateTimeFilter).value)
    : null;
}
