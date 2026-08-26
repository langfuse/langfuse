import { LISTABLE_SCORE_TYPES } from "../../domain/scores";
import { dateParam, table } from "./db";
import { selectPlan, unionAllPlan, type QueryPlan } from "./plan";

export type EnvironmentsQueryInput = {
  writeMode: "legacy" | "dual" | "events_only";
  fromTimestamp?: Date;
};

/**
 * Tracing read for `getEnvironmentsForProject`. Product code never mentions
 * `project_id`; compile() injects it from ExecutionContext.
 *
 * Filters are applied before `.select()` because hypequery narrows
 * `WhereColumn` to the selected output, so `SELECT environment WHERE timestamp`
 * does not type-check if select comes first.
 */
export function buildTracingEnvironmentsPlan(
  input: EnvironmentsQueryInput,
): QueryPlan {
  if (input.writeMode === "legacy") {
    const traces = input.fromTimestamp
      ? table("traces").where(
          "timestamp",
          "gte",
          dateParam(input.fromTimestamp),
        )
      : table("traces");
    const observations = input.fromTimestamp
      ? table("observations").where(
          "start_time",
          "gte",
          dateParam(input.fromTimestamp),
        )
      : table("observations");
    return unionAllPlan(
      traces.select(["environment"]).distinct(),
      observations.select(["environment"]).distinct(),
    );
  }

  const events = input.fromTimestamp
    ? table("events_core").where(
        "start_time",
        "gte",
        dateParam(input.fromTimestamp),
      )
    : table("events_core");
  return selectPlan(events.select(["environment"]).distinct());
}

export function buildScoreEnvironmentsPlan(fromTimestamp?: Date): QueryPlan {
  let scores = table("scores").where("data_type", "in", [
    ...LISTABLE_SCORE_TYPES,
  ]);
  if (fromTimestamp) {
    scores = scores.where("timestamp", "gte", dateParam(fromTimestamp));
  }
  return selectPlan(scores.select(["environment"]).distinct());
}
