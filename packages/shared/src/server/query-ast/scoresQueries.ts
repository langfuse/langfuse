import {
  AGGREGATABLE_SCORE_TYPES,
  LISTABLE_SCORE_TYPES,
} from "../../domain/scores";
import type { ExecutionContext } from "./executionContext";
import { compileClickhouseQuery } from "./kysely/compile";
import { getClickhouseKysely } from "./kysely/dialect";
import { limitBy, mapKeys, useFinal } from "./kysely/extensions";

const experimentItemEventsQuery = (experimentIds: string[]) =>
  getClickhouseKysely()
    .selectFrom("events_core as e")
    .select(["e.project_id", "e.experiment_id", "e.trace_id"])
    .where("e.experiment_id", "in", experimentIds)
    .where("e.experiment_id", "!=", "");

const scoresForExperimentItemsQuery = (experimentIds: string[]) =>
  getClickhouseKysely()
    .selectFrom(experimentItemEventsQuery(experimentIds).as("e"))
    .innerJoin("scores as s", (join) =>
      join
        .onRef("e.trace_id", "=", "s.trace_id")
        .onRef("e.project_id", "=", "s.project_id"),
    )
    .$call(useFinal(["scores"]))
    .select((eb) => [
      "s.id as id",
      "s.timestamp as timestamp",
      "s.project_id as project_id",
      "s.environment as environment",
      "s.trace_id as trace_id",
      "s.session_id as session_id",
      "s.observation_id as observation_id",
      "s.dataset_run_id as dataset_run_id",
      "s.name as name",
      "s.value as value",
      "s.source as source",
      "s.comment as comment",
      "s.author_user_id as author_user_id",
      "s.config_id as config_id",
      "s.data_type as data_type",
      "s.string_value as string_value",
      "s.queue_id as queue_id",
      "s.execution_trace_id as execution_trace_id",
      "s.created_at as created_at",
      "s.updated_at as updated_at",
      "s.event_ts as event_ts",
      "s.is_deleted as is_deleted",
      eb(eb.fn("length", [mapKeys("s.metadata")]), ">", 0).as("has_metadata"),
      "e.experiment_id as experiment_id",
    ])
    .where("s.data_type", "in", [...AGGREGATABLE_SCORE_TYPES])
    .orderBy("s.event_ts", "desc")
    .$call(
      limitBy({
        count: 1,
        columns: ["s.id", "s.project_id", "e.experiment_id"],
      }),
    );

const promptEventsForScoresQuery = (
  promptIds: string[],
  timeWindow: { fromTimestamp?: Date; toTimestamp?: Date } = {},
) =>
  getClickhouseKysely()
    .selectFrom("events_core as e")
    .select([
      "e.project_id as project_id",
      "e.prompt_id as prompt_id",
      "e.trace_id as trace_id",
      "e.span_id as span_id",
      "e.is_deleted as is_deleted",
    ])
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

const aggregatedScoresForPromptsFromEventsQuery = (
  promptIds: string[],
  fetchScoreRelation: "observation" | "trace",
  timeWindow: { fromTimestamp?: Date; toTimestamp?: Date } = {},
) =>
  getClickhouseKysely()
    .with("prompt_events", () =>
      promptEventsForScoresQuery(promptIds, timeWindow),
    )
    .selectFrom("scores as s")
    .$call(useFinal(["scores"]))
    .innerJoin("prompt_events as e", (join) => {
      const base = join
        .onRef("s.project_id", "=", "e.project_id")
        .onRef("s.trace_id", "=", "e.trace_id");
      return fetchScoreRelation === "observation"
        ? base.onRef("s.observation_id", "=", "e.span_id")
        : base;
    })
    .select((eb) => [
      "e.prompt_id as prompt_id",
      "s.id as id",
      "s.name as name",
      "s.string_value as string_value",
      "s.value as value",
      "s.source as source",
      "s.data_type as data_type",
      "s.comment as comment",
      "s.timestamp as timestamp",
      eb(eb.fn("length", [mapKeys("s.metadata")]), ">", 0).as("has_metadata"),
    ])
    .where("e.is_deleted", "=", 0)
    .where("s.name", "is not", null)
    .where("s.data_type", "in", [...LISTABLE_SCORE_TYPES])
    .$if(fetchScoreRelation === "trace", (qb) =>
      qb
        .where("s.observation_id", "is", null)
        .where("s.trace_id", "in", (eb) =>
          eb
            .selectFrom("prompt_events")
            .select("trace_id")
            .where("is_deleted", "=", 0),
        ),
    )
    .$if(fetchScoreRelation === "observation", (qb) =>
      qb
        .where("s.observation_id", "is not", null)
        .where(({ eb, refTuple, selectFrom }) =>
          eb(
            refTuple("s.trace_id", "s.observation_id"),
            "in",
            selectFrom("prompt_events")
              .select(["trace_id", "span_id"])
              .where("is_deleted", "=", 0)
              .$asTuple("trace_id", "span_id"),
          ),
        ),
    )
    .groupBy([
      "e.prompt_id",
      "s.id",
      "s.name",
      "s.string_value",
      "s.value",
      "s.source",
      "s.data_type",
      "s.comment",
      "s.timestamp",
      "s.metadata",
    ]);

export const compileScoresForExperimentItems = (
  ctx: ExecutionContext,
  experimentIds: string[],
) => compileClickhouseQuery(scoresForExperimentItemsQuery(experimentIds), ctx);

export const compileAggregatedScoresForPromptsFromEvents = (
  ctx: ExecutionContext,
  promptIds: string[],
  fetchScoreRelation: "observation" | "trace",
  timeWindow: { fromTimestamp?: Date; toTimestamp?: Date } = {},
) =>
  compileClickhouseQuery(
    aggregatedScoresForPromptsFromEventsQuery(
      promptIds,
      fetchScoreRelation,
      timeWindow,
    ),
    ctx,
  );
