import {
  createEvent,
  createEventsCh,
  type EventRecordInsertType,
} from "../../../src/server";
import { jitter, utcDayStartMs } from "./rng";
import {
  type ScenarioContext,
  type ScenarioDefinition,
  SeedError,
  type SeedSummary,
} from "./types";
import { countRows, traceLink } from "./verify";

const MODELS = ["seed-admin-unpriced-chat", "seed-admin-unpriced-reasoning"];
const GENERATIONS_PER_MODEL = 4;

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  if (params["v4"] !== true) {
    throw new SeedError("unpriced-generations requires v4 events", "pass --v4");
  }
  const traceId = `${ctx.idPrefix}-unpriced-generations`;
  const traceTimestamp = utcDayStartMs() + 12 * 60 * 60 * 1000;
  const generationCount = MODELS.length * GENERATIONS_PER_MODEL;
  const links = [traceLink(ctx, traceId, traceTimestamp)];

  if (ctx.dryRun) {
    return {
      scenario: "unpriced-generations",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [traceId],
      sessionIds: [],
      counts: { events: generationCount + 1, generations: generationCount },
      verified: {},
      links,
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const events: EventRecordInsertType[] = [
    createEvent({
      project_id: ctx.projectId,
      trace_id: traceId,
      span_id: `t-${traceId}`,
      id: `t-${traceId}`,
      parent_span_id: "",
      name: "unpriced-generation-examples",
      trace_name: "unpriced-generation-examples",
      type: "SPAN",
      environment: ctx.environment,
      start_time: traceTimestamp,
      end_time: traceTimestamp + 15_000,
      source: "API",
    }),
  ];

  for (const [modelIndex, modelName] of MODELS.entries()) {
    for (let index = 0; index < GENERATIONS_PER_MODEL; index++) {
      const ordinal = modelIndex * GENERATIONS_PER_MODEL + index;
      const startTime =
        traceTimestamp + 1000 + ordinal * 1500 + jitter(ctx.seed, ordinal, 100);
      const input = 500 + ordinal * 100;
      const output = 100 + ordinal * 20;
      events.push(
        createEvent({
          project_id: ctx.projectId,
          trace_id: traceId,
          span_id: `${traceId}-generation-${ordinal}`,
          id: `${traceId}-generation-${ordinal}`,
          parent_span_id: `t-${traceId}`,
          name: `call-${modelName}-${index + 1}`,
          trace_name: "unpriced-generation-examples",
          type: "GENERATION",
          environment: ctx.environment,
          provided_model_name: modelName,
          model_id: null,
          provided_usage_details: { input, output, total: input + output },
          usage_details: { input, output, total: input + output },
          provided_cost_details: {},
          cost_details: {},
          start_time: startTime,
          end_time: startTime + 800,
          source: "API",
        }),
      );
    }
  }

  ctx.log(
    `writing ${events.length} v4 events across ${MODELS.length} model names`,
  );
  await createEventsCh(events);

  const verified = {
    events: await countRows(
      "events_full",
      "project_id = {projectId: String} AND trace_id = {traceId: String}",
      { projectId: ctx.projectId, traceId },
      "uniqExact(span_id)",
    ),
    generations: await countRows(
      "events_full",
      "project_id = {projectId: String} AND trace_id = {traceId: String} AND type = 'GENERATION' AND provided_model_name IN ({modelNames: Array(String)}) AND model_id = '' AND arraySum(mapValues(usage_details)) > 0 AND NOT mapContains(cost_details, 'total')",
      { projectId: ctx.projectId, traceId, modelNames: MODELS },
      "uniqExact(span_id)",
    ),
  };
  if (
    verified.events < events.length ||
    verified.generations < generationCount
  ) {
    throw new SeedError(
      `Readback mismatch: expected ${events.length} events and ${generationCount} unpriced generations, found ${verified.events} and ${verified.generations}`,
    );
  }

  return {
    scenario: "unpriced-generations",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: [traceId],
    sessionIds: [],
    counts: { events: events.length, generations: generationCount },
    verified,
    links,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const unpricedGenerationsScenario: ScenarioDefinition = {
  name: "unpriced-generations",
  description:
    "V4-only trace with multiple token-using generations for each of two model names, without matched model definitions or cost",
  supportsV4: true,
  flags: [
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description: "write v4 events (required)",
    },
  ],
  run,
};
