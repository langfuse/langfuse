import { compileClickhouseQuery } from "../../../server/query-ast/compile";
import { getClickhouseKysely } from "../../../server/query-ast/dialect";
import { typedValue } from "../../../server/query-ast/extensions";
import { convertDateToClickhouseDateTime } from "../../../server/clickhouse/client";
import { traceAggregationSelects } from "../../../server/repositories/events-selects";

/**
 * One row per scored trace with its attributes aggregated over every span in
 * the window: `tags` is the sorted union, `name`, `user_id`, `release` and
 * `version` are the latest non-empty values, as in `traceAggregationSelects`.
 * Score views join it as `events_traces` on `id`, so a
 * filter or grouping on a trace attribute sees the whole trace whichever span
 * carries the attribute, and each score matches at most one row.
 *
 * Only traces with a score in the window are aggregated.
 */
export function compileEventsTraceAttributesSubquery(params: {
  projectId: string;
  fromTimestamp: string;
  toTimestamp: string;
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
        traceAggregationSelects([
          "id",
          "project_id",
          "name",
          "user_id",
          "release",
          "version",
          "tags",
        ])(eb),
      )
      .where("e.start_time", ">=", from)
      .where("e.start_time", "<=", to)
      .where("e.trace_id", "in", (eb) =>
        eb
          .selectFrom("scores as s")
          .select("s.trace_id")
          .where("s.timestamp", ">=", from)
          .where("s.timestamp", "<=", to),
      )
      .groupBy(["e.trace_id", "e.project_id"]),
    params.projectId,
    "traceAttrs",
  );
}
