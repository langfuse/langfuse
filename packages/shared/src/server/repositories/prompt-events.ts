import type { SelectExpression } from "kysely";

import { getClickhouseKysely } from "../query-ast/dialect";
import { limitBy, softDeleteAfterLimit } from "../query-ast/extensions";
import type { ClickHouseDatabase } from "../query-ast/schema";

type EventsAsE = ClickHouseDatabase & { e: ClickHouseDatabase["events_core"] };

/**
 * Latest version of each generation linked to one of `promptIds`, optionally
 * within a start-time window. Callers pick the columns and use it as a CTE.
 * A generation whose latest version is soft-deleted is left out.
 */
export const promptGenerationEvents = <
  S extends SelectExpression<EventsAsE, "e">,
>(
  promptIds: string[],
  columns: readonly S[],
  timeWindow: { fromTimestamp?: Date; toTimestamp?: Date } = {},
) =>
  getClickhouseKysely()
    .selectFrom("events_core as e")
    .$call(softDeleteAfterLimit())
    .select(columns)
    .where("e.type", "=", "GENERATION")
    .where("e.prompt_id", "in", promptIds)
    .$if(timeWindow.fromTimestamp !== undefined, (qb) =>
      qb.where("e.start_time", ">=", timeWindow.fromTimestamp!),
    )
    .$if(timeWindow.toTimestamp !== undefined, (qb) =>
      qb.where("e.start_time", "<=", timeWindow.toTimestamp!),
    )
    .orderBy("e.event_ts", "desc")
    .$call(limitBy({ count: 1, columns: ["e.span_id", "e.project_id"] }));
