import { LISTABLE_SCORE_TYPES } from "../../domain/scores";
import type { ExecutionContext } from "./executionContext";
import { compileClickhouseQuery } from "./kysely/compile";
import { getClickhouseKysely } from "./kysely/dialect";

export type EnvironmentsQueryInput = {
  projectId: string;
  fromTimestamp?: Date;
  writeMode: "legacy" | "events_only" | "dual";
};

/**
 * `environments.getEnvironmentsForProject` as traced Kysely nodes.
 * Two statements (tracing read + scores read) matching the current exec
 * split: events may route to a dedicated ClickHouse service.
 */
export function compileEnvironmentsQueries(input: EnvironmentsQueryInput): {
  tracing: { sql: string; params: Record<string, unknown> };
  scores: { sql: string; params: Record<string, unknown> };
} {
  const ctx: ExecutionContext = { projectId: input.projectId };
  return {
    tracing: compileClickhouseQuery(buildTracingQuery(input), ctx),
    scores: compileClickhouseQuery(buildScoresQuery(input), ctx),
  };
}

function buildTracingQuery(input: EnvironmentsQueryInput) {
  const db = getClickhouseKysely();
  const { projectId, fromTimestamp } = input;

  if (input.writeMode === "legacy") {
    const traces = db
      .selectFrom("traces")
      .select("environment")
      .distinct()
      .where("project_id", "=", projectId)
      .$if(fromTimestamp != null, (qb) =>
        qb.where("timestamp", ">=", fromTimestamp!),
      );

    const observations = db
      .selectFrom("observations")
      .select("environment")
      .distinct()
      .where("project_id", "=", projectId)
      .$if(fromTimestamp != null, (qb) =>
        qb.where("start_time", ">=", fromTimestamp!),
      );

    return traces.unionAll(observations);
  }

  return db
    .selectFrom("events_core")
    .select("environment")
    .distinct()
    .where("project_id", "=", projectId)
    .$if(fromTimestamp != null, (qb) =>
      qb.where("start_time", ">=", fromTimestamp!),
    );
}

function buildScoresQuery(input: EnvironmentsQueryInput) {
  const db = getClickhouseKysely();
  const { projectId, fromTimestamp } = input;

  return db
    .selectFrom("scores")
    .select("environment")
    .distinct()
    .where("project_id", "=", projectId)
    .where("data_type", "in", [...LISTABLE_SCORE_TYPES])
    .$if(fromTimestamp != null, (qb) =>
      qb.where("timestamp", ">=", fromTimestamp!),
    );
}
