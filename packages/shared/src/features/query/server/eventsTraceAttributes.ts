import { compileClickhouseQuery } from "../../../server/query-ast/compile";
import { getClickhouseKysely } from "../../../server/query-ast/dialect";
import { typedValue } from "../../../server/query-ast/extensions";
import { convertDateToClickhouseDateTime } from "../../../server/clickhouse/client";
import { traceAggregationSelects } from "../../../server/repositories/events-selects";

const traceAttributeColumns = [
  "name",
  "user_id",
  "release",
  "version",
  "tags",
] as const;

type TraceAttributeColumn = (typeof traceAttributeColumns)[number];

/**
 * The trace attributes that `sqlFragments` read as `<alias>.<column>`, in a
 * stable order. Throws on a column the subquery does not provide.
 */
export function referencedTraceAttributeColumns(
  alias: string,
  sqlFragments: readonly string[],
): TraceAttributeColumn[] {
  const referenced = new Set<string>();
  for (const sql of sqlFragments) {
    for (const [, table, column] of sql.matchAll(/\b(\w+)\.(\w+)/g)) {
      if (table === alias) referenced.add(column);
    }
  }
  referenced.delete("id");
  referenced.delete("project_id");
  for (const column of referenced) {
    if (!(traceAttributeColumns as readonly string[]).includes(column)) {
      throw new Error(`${alias}.${column} is not a trace attribute column`);
    }
  }
  return traceAttributeColumns.filter((column) => referenced.has(column));
}

/**
 * One row per scored trace with the requested attributes aggregated over every
 * span in the window: `tags` is the sorted union, `name`, `user_id`, `release`
 * and `version` are the latest non-empty values, as in
 * `traceAggregationSelects`. `id` and `project_id` are always selected.
 * Score views join it as `events_traces` on `id`, so a
 * filter or grouping on a trace attribute sees the whole trace whichever span
 * carries the attribute, and each score matches at most one row.
 *
 * Callers restrict it by `id` to the traces of matching scores; ClickHouse
 * applies that condition on the group key before aggregating.
 */
export function compileEventsTraceAttributesSubquery(params: {
  projectId: string;
  fromTimestamp: string;
  toTimestamp: string;
  columns: readonly TraceAttributeColumn[];
}) {
  // The outer score filter binds its window as DateTime64(3, 'UTC'); binding
  // the same type keeps both windows on the same instants in any server
  // timezone, so no in-window score loses its trace row.
  const utc = (iso: string) =>
    typedValue<Date>(
      convertDateToClickhouseDateTime(new Date(iso)),
      "DateTime64(3, 'UTC')",
    );
  const from = utc(params.fromTimestamp);
  const to = utc(params.toTimestamp);

  return compileClickhouseQuery(
    getClickhouseKysely()
      .selectFrom("events as e")
      .select((eb) =>
        traceAggregationSelects(["id", "project_id", ...params.columns])(eb),
      )
      .where("e.start_time", ">=", from)
      .where("e.start_time", "<=", to)
      .groupBy(["e.trace_id", "e.project_id"]),
    params.projectId,
    "traceAttrs",
  );
}
