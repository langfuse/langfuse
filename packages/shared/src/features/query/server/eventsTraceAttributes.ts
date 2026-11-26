import type { Expression } from "kysely";

import { getClickhouseKysely } from "../../../server/query-ast/dialect";
import { traceAggregationSelects } from "../../../server/repositories/events-selects";

/** The trace attributes the score views read, in the order they are selected. */
export const TRACE_ATTRIBUTE_COLUMNS = [
  "name",
  "user_id",
  "release",
  "version",
  "tags",
] as const;

/** One of {@link TRACE_ATTRIBUTE_COLUMNS}, e.g. `user_id`; `id` is always selected. */
export type TraceAttributeColumn = (typeof TRACE_ATTRIBUTE_COLUMNS)[number];

/**
 * One row per trace with the requested attributes aggregated over every span
 * in `[from, to]`: `tags` is the sorted union, `name`, `user_id`, `release`
 * and `version` are the latest non-empty values, as in
 * `traceAggregationSelects`. `id` and `project_id` are always selected.
 * Score views read it as `events_traces` on `id`, so a filter or grouping on
 * a trace attribute sees the whole trace whichever span carries the
 * attribute, and each score matches at most one row.
 *
 * Callers restrict it by `id` to the traces of matching scores; ClickHouse
 * applies that condition on the group key before aggregating.
 *
 * select e.trace_id as id, e.project_id as project_id, <columns> from events as e
 * where e.start_time >= <from> and e.start_time <= <to> group by e.trace_id, e.project_id
 */
export function eventsTraceAttributes(
  window: { from: Expression<Date>; to: Expression<Date> },
  columns: readonly TraceAttributeColumn[],
) {
  return getClickhouseKysely()
    .selectFrom("events as e")
    .select((eb) =>
      traceAggregationSelects(["id", "project_id", ...columns])(eb),
    )
    .where("e.start_time", ">=", window.from)
    .where("e.start_time", "<=", window.to)
    .groupBy(["e.trace_id", "e.project_id"]);
}
