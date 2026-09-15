import { convertDateToClickhouseDateTime } from "../../clickhouse/client";
import {
  type ClickhouseFilter,
  DateTimeFilter,
  type FilterList,
  StringFilter,
  StringOptionsFilter,
} from "./clickhouse-filter";

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

// events_full sort/primary key is (project_id, toStartOfMinute(start_time),
// xxHash32(trace_id), span_id); span_id/trace_id also carry bloom_filter skip
// indices. These three fields are the ones whose predicates prune the io lane.
const IO_LANE_PRUNABLE_FIELDS = new Set(["span_id", "trace_id", "start_time"]);

const normalizeFilterField = (field: string): string => {
  const withoutQuotes = field.replaceAll('"', "");
  const parts = withoutQuotes.split(".");
  return parts[parts.length - 1];
};

/**
 * The io CTE in buildEventsFullTableSplitQuery scans events_full filtered only
 * by project_id and a tuple semi-join against base. That tuple cannot prune the
 * primary key (raw start_time/trace_id vs the toStartOfMinute/xxHash32 key
 * expressions), so events_full is scanned across all partitions before the
 * semi-join applies.
 *
 * This mirrors base's index-relevant predicates (start_time range, span_id/
 * trace_id equality or IN) onto the io lane so partition/primary-key pruning and
 * the span_id/trace_id bloom filters engage. The predicates are additive over
 * the semi-join's superset, so the LEFT ANY JOIN still matches exactly. Each
 * filter re-apply mints fresh param names, so these never collide with base's.
 * Returns null when nothing prunable exists (e.g. an unbounded by-trace_id
 * lookup with no time filter).
 */
export function buildIoLanePrefilter(
  filter: FilterList,
): ClickhouseFilter | null {
  const prunable = filter.filter((f) => {
    if (!f.clickhouseTable.startsWith("events")) return false;
    if (!IO_LANE_PRUNABLE_FIELDS.has(normalizeFilterField(f.field)))
      return false;
    if (f instanceof DateTimeFilter) return true;
    if (f instanceof StringOptionsFilter) return f.operator === "any of";
    if (f instanceof StringFilter) return f.operator === "=";
    return false;
  });
  if (prunable.length() === 0) return null;
  const applied = prunable.apply();
  return applied.query ? applied : null;
}
