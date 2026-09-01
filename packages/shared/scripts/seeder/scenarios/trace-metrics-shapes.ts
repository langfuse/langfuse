import {
  createEventsCh,
  createObservation,
  createObservationsCh,
  createTrace,
  createTracesCh,
  EventRecordInsertType,
  ObservationRecordInsertType,
  TraceRecordInsertType,
  clickhouseClient,
} from "../../../src/server";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, traceLink } from "./verify";

type MetricSpan = {
  key: string;
  parent: string | null;
  type: "AGENT" | "GENERATION" | "TOOL";
  startMs: number;
  endMs: number | null;
  cost: number;
  tokens: number;
  eventVersionMs?: number;
};

type MetricShape = {
  slug: string;
  expectedCost: number;
  spans: MetricSpan[];
};

const SHAPES: MetricShape[] = [
  {
    slug: "cheap-one-bucket",
    expectedCost: 0.01,
    spans: [
      {
        key: "root",
        parent: null,
        type: "AGENT",
        startMs: 0,
        endMs: 30_000,
        cost: 0,
        tokens: 0,
      },
      {
        key: "generation",
        parent: "root",
        type: "GENERATION",
        startMs: 1_000,
        endMs: 20_000,
        cost: 0.01,
        tokens: 100,
      },
    ],
  },
  {
    slug: "expensive-one-bucket",
    expectedCost: 10,
    spans: [
      {
        key: "root",
        parent: null,
        type: "AGENT",
        startMs: 60_000,
        endMs: 120_000,
        cost: 0,
        tokens: 0,
      },
      {
        key: "generation",
        parent: "root",
        type: "GENERATION",
        startMs: 61_000,
        endMs: 110_000,
        cost: 10,
        tokens: 20_000,
      },
    ],
  },
  {
    slug: "multi-bucket-2h",
    expectedCost: 3,
    spans: [
      {
        key: "root",
        parent: null,
        type: "AGENT",
        startMs: 180_000,
        endMs: 7_500_000,
        cost: 0,
        tokens: 0,
      },
      {
        key: "generation-1",
        parent: "root",
        type: "GENERATION",
        startMs: 181_000,
        endMs: 200_000,
        cost: 1,
        tokens: 1_000,
      },
      {
        key: "generation-2",
        parent: "root",
        type: "GENERATION",
        startMs: 7_381_000,
        endMs: 7_400_000,
        cost: 2,
        tokens: 2_000,
      },
    ],
  },
  {
    slug: "duplicate-span-versions",
    expectedCost: 0.75,
    spans: [
      {
        key: "root",
        parent: null,
        type: "AGENT",
        startMs: 7_800_000,
        endMs: 7_860_000,
        cost: 0,
        tokens: 0,
      },
      {
        key: "generation",
        parent: "root",
        type: "GENERATION",
        startMs: 7_801_000,
        endMs: 7_850_000,
        cost: 0.25,
        tokens: 250,
        eventVersionMs: 100,
      },
      {
        key: "generation",
        parent: "root",
        type: "GENERATION",
        startMs: 7_801_000,
        endMs: 7_850_000,
        cost: 0.75,
        tokens: 750,
        eventVersionMs: 200,
      },
    ],
  },
  {
    slug: "root-zero-child-cost",
    expectedCost: 1.25,
    spans: [
      {
        key: "root",
        parent: null,
        type: "AGENT",
        startMs: 8_100_000,
        endMs: 8_160_000,
        cost: 0,
        tokens: 0,
      },
      {
        key: "generation",
        parent: "root",
        type: "GENERATION",
        startMs: 8_101_000,
        endMs: 8_150_000,
        cost: 1.25,
        tokens: 1_250,
      },
    ],
  },
  {
    slug: "in-flight",
    expectedCost: 0.5,
    spans: [
      {
        key: "root",
        parent: null,
        type: "AGENT",
        startMs: 8_400_000,
        endMs: null,
        cost: 0,
        tokens: 0,
      },
      {
        key: "generation",
        parent: "root",
        type: "GENERATION",
        startMs: 8_401_000,
        endMs: null,
        cost: 0.5,
        tokens: 500,
      },
    ],
  },
  {
    slug: "late-expensive-span",
    expectedCost: 4.1,
    spans: [
      {
        key: "root",
        parent: null,
        type: "AGENT",
        startMs: 8_700_000,
        endMs: 9_060_000,
        cost: 0,
        tokens: 0,
      },
      {
        key: "generation-early",
        parent: "root",
        type: "GENERATION",
        startMs: 8_701_000,
        endMs: 8_720_000,
        cost: 0.1,
        tokens: 100,
      },
      {
        key: "generation-late",
        parent: "root",
        type: "GENERATION",
        startMs: 9_001_000,
        endMs: 9_050_000,
        cost: 4,
        tokens: 4_000,
        eventVersionMs: 300_000,
      },
    ],
  },
];

const usageCost = (tokens: number, cost: number) => {
  const usage: Record<string, number> = tokens > 0 ? { total: tokens } : {};
  const costs: Record<string, number> = cost > 0 ? { total: cost } : {};
  return {
    provided_usage_details: usage,
    usage_details: usage,
    provided_cost_details: costs,
    cost_details: costs,
    total_cost: cost > 0 ? cost : null,
  };
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const withV4 = params["v4"] as boolean;
  const anchor = utcDayStartMs() - 3 * 3_600_000;
  const traceIdOf = (shape: MetricShape) => `${ctx.idPrefix}-${shape.slug}`;
  const uniqueObservationIds = SHAPES.reduce(
    (count, shape) => count + new Set(shape.spans.map((span) => span.key)).size,
    0,
  );
  const observationVersions = SHAPES.reduce(
    (count, shape) => count + shape.spans.length,
    0,
  );
  const counts = {
    traces: SHAPES.length,
    observations: uniqueObservationIds,
    observationVersions,
    events: withV4 ? SHAPES.length + uniqueObservationIds : 0,
    eventVersions: withV4 ? SHAPES.length + observationVersions : 0,
  };

  if (ctx.dryRun) {
    return {
      scenario: "trace-metrics-shapes",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: SHAPES.map(traceIdOf),
      sessionIds: [],
      counts,
      verified: {},
      links: SHAPES.map((shape) => traceLink(ctx, traceIdOf(shape), anchor)),
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const events: EventRecordInsertType[] = [];

  for (const shape of SHAPES) {
    const traceId = traceIdOf(shape);
    const eventBase = anchor + 10_000_000;
    const trace = createTrace({
      id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      name: `trace-metrics.${shape.slug}`,
      timestamp: anchor + shape.spans[0].startMs,
      user_id: `user-${shape.slug}`,
      session_id: `session-${shape.slug}`,
      release: "trace-metrics-v1",
      version: "trace-metrics-v1",
      tags: ["seed", "trace-metrics-shapes", shape.slug],
      public: false,
      bookmarked: false,
      metadata: {
        scenario: "trace-metrics-shapes",
        shape: shape.slug,
        expected_cost: String(shape.expectedCost),
      },
      input: null,
      output: null,
      created_at: eventBase,
      updated_at: eventBase,
      event_ts: eventBase,
    });
    traces.push(trace);

    const idByKey = new Map(
      shape.spans.map((span) => [span.key, `${traceId}-${span.key}`]),
    );
    for (const span of shape.spans) {
      const eventTs = eventBase + (span.eventVersionMs ?? span.startMs);
      const observation = createObservation({
        id: idByKey.get(span.key)!,
        trace_id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type: span.type,
        parent_observation_id:
          span.parent === null ? null : idByKey.get(span.parent)!,
        name: span.key,
        start_time: anchor + span.startMs,
        end_time: span.endMs === null ? null : anchor + span.endMs,
        completion_start_time: null,
        level: "DEFAULT",
        status_message: null,
        version: null,
        input: null,
        output: null,
        metadata: {
          scenario: "trace-metrics-shapes",
          shape: shape.slug,
        },
        provided_model_name:
          span.type === "GENERATION" ? "trace-metrics-model" : null,
        internal_model_id: null,
        model_parameters: "{}",
        ...usageCost(span.tokens, span.cost),
        prompt_id: null,
        prompt_name: null,
        prompt_version: null,
        created_at: eventTs,
        updated_at: eventTs,
        event_ts: eventTs,
      });
      observations.push(observation);
      if (withV4) events.push(observationToEvent(observation, trace));
    }
    if (withV4) events.push(traceToEvent(trace));
  }

  await createTracesCh(traces);
  for (const batch of chunk(observations, 500)) {
    await createObservationsCh(batch);
  }
  for (const batch of chunk(events, 500)) {
    await createEventsCh(batch);
  }

  const ids = SHAPES.map(traceIdOf);
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      "project_id = {projectId: String} AND id IN {ids: Array(String)}",
      { projectId: ctx.projectId, ids },
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      "project_id = {projectId: String} AND trace_id IN {ids: Array(String)}",
      { projectId: ctx.projectId, ids },
      "uniqExact(id)",
    ),
  };
  if (withV4) {
    verified.events = await countRows(
      "events_core",
      "project_id = {projectId: String} AND trace_id IN {ids: Array(String)} AND is_deleted = 0",
      { projectId: ctx.projectId, ids },
      "uniqExact(span_id)",
    );

    const duplicateResult = await clickhouseClient().query({
      query: `
        SELECT toFloat64(cost_details['total']) AS cost
        FROM events_core
        WHERE project_id = {projectId: String}
          AND trace_id = {traceId: String}
          AND span_id = {spanId: String}
        ORDER BY event_ts DESC
        LIMIT 1
      `,
      query_params: {
        projectId: ctx.projectId,
        traceId: `${ctx.idPrefix}-duplicate-span-versions`,
        spanId: `${ctx.idPrefix}-duplicate-span-versions-generation`,
      },
      format: "JSONEachRow",
    });
    const rows = await duplicateResult.json<{ cost: number | string }>();
    verified.latestDuplicateCost = Number(rows[0]?.cost ?? 0);
  }

  if (
    verified.traces !== counts.traces ||
    verified.observations !== counts.observations ||
    (withV4 && verified.events !== counts.events) ||
    (withV4 && Math.abs((verified.latestDuplicateCost ?? 0) - 0.75) > 1e-12)
  ) {
    throw new SeedError(
      `Readback mismatch: expected ${JSON.stringify(counts)}, verified ${JSON.stringify(verified)}`,
    );
  }

  return {
    scenario: "trace-metrics-shapes",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: ids,
    sessionIds: SHAPES.map((shape) => `session-${shape.slug}`),
    counts,
    verified,
    links: SHAPES.map((shape) => traceLink(ctx, traceIdOf(shape), anchor)),
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const traceMetricsShapesScenario: ScenarioDefinition = {
  name: "trace-metrics-shapes",
  description:
    "Seven deterministic traces for trace-metric rollup correctness: cheap/expensive, multi-bucket, duplicate span versions, root-zero-child-cost, in-flight, and late expensive span.",
  supportsV4: true,
  flags: [
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description: "mirror into v4 events_full/events_core",
    },
  ],
  run,
};
