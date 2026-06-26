import {
  createTrace,
  createObservation,
  createTraceScore,
  createTracesCh,
  createObservationsCh,
  createScoresCh,
  createEventsCh,
  EventRecordInsertType,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import { ObservationType } from "../../../src/domain";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { jitter, Rng, utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, traceLink, tracesListLink } from "./verify";

// High-cardinality pools so every filterable facet has many distinct values —
// the point of this scenario is breadth, not a specific tree shape. Values land
// in non-ORDER-BY columns (tags, metadata, name, level, model, scores), so they
// can come from the rng stream; only `type` (a v3 ORDER BY key) and per-row time
// offsets are kept stateless.
const ENVIRONMENTS = ["production", "staging", "development", "qa"] as const;

// obs[0] is always a GENERATION (carries model + usage + cost so those filters
// have data on every trace); obs[1] cycles the remaining types so the `type`
// facet covers the full v4 enum across the dataset.
const NON_GENERATION_TYPES: ObservationType[] = [
  "AGENT",
  "CHAIN",
  "RETRIEVER",
  "EMBEDDING",
  "TOOL",
  "EVALUATOR",
  "GUARDRAIL",
  "SPAN",
  "EVENT",
];

const TRACE_NAMES = [
  "checkout-flow",
  "rag-answer",
  "summarize-doc",
  "classify-intent",
  "agent-planner",
  "tool-router",
  "chat-completion",
  "moderation-check",
  "translate-text",
  "recommend-products",
] as const;

const MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "claude-3-5-sonnet",
  "claude-3-haiku",
  "llama-3.1-70b",
  "gemini-1.5-pro",
] as const;

// Domain-ish tags drawn as a small random subset per trace, so `traceTags`
// any-of / all-of / none-of all have something to bite on.
const TAG_POOL = [
  "billing",
  "urgent",
  "customer-facing",
  "internal",
  "experimental",
  "beta",
  "canary",
  "regression",
  "high-priority",
  "rag",
  "tool-use",
  "streaming",
  "cached",
  "pii",
] as const;

// Custom metadata keys — the attributes that live in metadata, not a top-level
// column (exactly what the AI prompt is told to reach into). Keep values as
// strings: the v4 events metadata column is Map(String, String).
const REGIONS = [
  "us-east-1",
  "us-west-2",
  "eu-west-1",
  "eu-central-1",
  "ap-southeast-1",
] as const;
const TENANTS = [
  "acme-corp",
  "globex",
  "initech",
  "umbrella",
  "stark-industries",
] as const;
const TIERS = ["free", "pro", "enterprise", "trial"] as const;
const QUEUES = [
  "membership-support",
  "billing-support",
  "technical-support",
  "sales",
  "escalations",
] as const;
const FLAGS = [
  "new-checkout",
  "beta-rag",
  "fast-path",
  "legacy-router",
  "none",
] as const;
const STEPS = [
  "retrieve",
  "rerank",
  "generate",
  "validate",
  "finalize",
] as const;
const AB_BUCKETS = ["A", "B", "control"] as const;

// Input/output phrasings carrying searchable keywords (refund, cancel, password,
// upgrade, …) so input:/output: content search returns real rows.
const CONTENT = [
  {
    in: "How do I get a refund for my last order?",
    out: "Your refund has been initiated and will arrive in 5 days.",
  },
  {
    in: "Please cancel my subscription",
    out: "Your subscription has been cancelled effective today.",
  },
  {
    in: "I forgot my password and cannot log in",
    out: "Here is how to reset your password securely.",
  },
  {
    in: "Upgrade me to the enterprise plan",
    out: "You have been upgraded to the enterprise plan.",
  },
  {
    in: "Why was my card declined at checkout?",
    out: "The card was declined due to insufficient funds.",
  },
  {
    in: "Translate this contract into German",
    out: "Hier ist die deutsche Uebersetzung des Vertrags.",
  },
  {
    in: "Summarize the quarterly earnings report",
    out: "Revenue grew 12% QoQ, driven by enterprise demand.",
  },
  {
    in: "Find products similar to the blue running shoes",
    out: "Here are three similar running shoes in blue.",
  },
] as const;

/** Pick `k` distinct tags deterministically from the seeded rng stream. */
const pickTags = (rng: Rng): string[] => {
  const k = rng.int(1, 4);
  const chosen = new Set<string>();
  let guard = 0;
  while (chosen.size < k && guard++ < 20) chosen.add(rng.pick(TAG_POOL));
  return ["seed", "filter-variety", ...chosen];
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const traceCount = Math.max(1, Number(params.traces ?? 120));
  const withV4 = params.v4 === true;

  // Spread across the last 3 days (anchored on utcDayStartMs, not wall clock,
  // so re-runs overwrite in place — see scored-traces for the rationale) so
  // relative time filters ("last 24h", "last 3 days") have rows on both sides.
  const windowMs = 3 * 24 * 60 * 60 * 1000;
  const endMs = utcDayStartMs();
  const startMs = endMs - windowMs;
  const stepMs = windowMs / traceCount;
  const firstTraceTimestamp = startMs + jitter(ctx.seed, 0, 1000);

  if (ctx.dryRun) {
    return {
      scenario: "filter-variety",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [`${ctx.idPrefix}-t0`],
      sessionIds: [],
      counts: {
        traces: traceCount,
        observations: traceCount * 2,
        scores: traceCount * 3,
        events: withV4 ? traceCount * 3 : 0,
      },
      verified: {},
      links: [
        tracesListLink(ctx),
        traceLink(ctx, `${ctx.idPrefix}-t0`, firstTraceTimestamp),
      ],
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const rng = new Rng(ctx.seed);
  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const scores: ScoreRecordInsertType[] = [];
  const events: EventRecordInsertType[] = [];

  for (let t = 0; t < traceCount; t++) {
    const traceId = `${ctx.idPrefix}-t${t}`;
    const timestamp =
      startMs + Math.floor(t * stepMs) + jitter(ctx.seed, t, 1000);
    // Stateless (index-derived), never the rng stream: environment for an even
    // spread, level for a controlled error/warning rate.
    const environment = ENVIRONMENTS[t % ENVIRONMENTS.length];
    const content = CONTENT[t % CONTENT.length];

    const trace = createTrace({
      id: traceId,
      project_id: ctx.projectId,
      environment,
      session_id: null,
      timestamp,
      name: rng.pick(TRACE_NAMES),
      user_id: `user-${rng.int(1, 50)}`,
      release: "seed-1.0.0",
      version: `v${rng.int(1, 4)}`,
      tags: pickTags(rng),
      public: false,
      bookmarked: t % 17 === 0,
      metadata: {
        scenario: "filter-variety",
        region: rng.pick(REGIONS),
        tenant: rng.pick(TENANTS),
        "customer.tier": rng.pick(TIERS),
        "routing.queue": rng.pick(QUEUES),
        "feature.flag": rng.pick(FLAGS),
        "experiment.step": rng.pick(STEPS),
        "ab.bucket": rng.pick(AB_BUCKETS),
        "deployment.version": `v${rng.int(1, 5)}.${rng.int(0, 9)}.${rng.int(0, 9)}`,
      },
      input: JSON.stringify({ message: content.in }),
      output: content.out,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    });
    traces.push(trace);

    const level =
      t % 8 === 0
        ? "ERROR"
        : t % 8 === 3
          ? "WARNING"
          : t % 8 === 6
            ? "DEBUG"
            : "DEFAULT";
    const usageInput = rng.int(50, 4000);
    const usageOutput = rng.int(20, 2000);
    const genStart = timestamp;
    const genEnd = genStart + 400 + jitter(ctx.seed, t * 2, 6000);

    // obs[0]: GENERATION — carries model/usage/cost so those facets are populated
    // on every trace (and `latency` via the duration).
    const genId = `${traceId}-o0`;
    const generation = createObservation({
      id: genId,
      trace_id: traceId,
      project_id: ctx.projectId,
      environment,
      type: "GENERATION",
      parent_observation_id: null,
      name: "answer-generation",
      start_time: genStart,
      end_time: genEnd,
      completion_start_time: genStart + rng.int(80, 400),
      level,
      status_message:
        level === "ERROR"
          ? "Execution failed: upstream timeout after 30s"
          : null,
      version: null,
      input: JSON.stringify({ prompt: content.in }),
      output: content.out,
      metadata: { scenario: "filter-variety", "node.kind": "generation" },
      provided_model_name: rng.pick(MODELS),
      internal_model_id: null,
      model_parameters: JSON.stringify({ temperature: 0.2, max_tokens: 1024 }),
      provided_usage_details: {
        input: usageInput,
        output: usageOutput,
        total: usageInput + usageOutput,
      },
      usage_details: {
        input: usageInput,
        output: usageOutput,
        total: usageInput + usageOutput,
      },
      provided_cost_details: {
        input: usageInput * 2e-6,
        output: usageOutput * 6e-6,
      },
      cost_details: {
        input: usageInput * 2e-6,
        output: usageOutput * 6e-6,
        total: usageInput * 2e-6 + usageOutput * 6e-6,
      },
      total_cost: usageInput * 2e-6 + usageOutput * 6e-6,
      prompt_id: null,
      prompt_name: null,
      prompt_version: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    });
    observations.push(generation);

    // obs[1]: a non-generation child whose type cycles the rest of the v4 enum
    // (stateless), so the `type` facet covers every kind across the dataset.
    const childType = NON_GENERATION_TYPES[t % NON_GENERATION_TYPES.length];
    const childId = `${traceId}-o1`;
    const childStart = genStart + 10 + jitter(ctx.seed, t * 2 + 1, 200);
    const child = createObservation({
      id: childId,
      trace_id: traceId,
      project_id: ctx.projectId,
      environment,
      type: childType,
      parent_observation_id: genId,
      name: `${childType.toLowerCase()}-step`,
      start_time: childStart,
      end_time: childStart + 5 + jitter(ctx.seed, t * 2 + 2, 800),
      completion_start_time: null,
      level: "DEFAULT",
      status_message: null,
      version: null,
      input: rng.bool(0.5) ? JSON.stringify({ query: content.in }) : null,
      output: rng.bool(0.5) ? content.out : null,
      metadata: {
        scenario: "filter-variety",
        "node.kind": childType.toLowerCase(),
      },
      provided_model_name: null,
      internal_model_id: null,
      model_parameters: "{}",
      provided_usage_details: {},
      usage_details: {},
      provided_cost_details: {},
      cost_details: {},
      total_cost: null,
      prompt_id: null,
      prompt_name: null,
      prompt_version: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    });
    observations.push(child);

    // Scores: one observation-level numeric (-> scores.accuracy), one trace-level
    // numeric (-> traceScores.helpfulness), one trace-level categorical sentiment.
    scores.push(
      createTraceScore({
        id: `${genId}-score-accuracy`,
        project_id: ctx.projectId,
        trace_id: traceId,
        observation_id: genId,
        environment,
        name: "accuracy",
        value: Math.round(rng.next() * 100) / 100,
        data_type: "NUMERIC",
        source: "EVAL",
        comment: null,
        metadata: {},
        timestamp,
      }),
      createTraceScore({
        id: `${traceId}-score-helpfulness`,
        project_id: ctx.projectId,
        trace_id: traceId,
        environment,
        name: "helpfulness",
        value: Math.round(rng.next() * 500) / 100,
        data_type: "NUMERIC",
        source: "EVAL",
        comment: null,
        metadata: {},
        timestamp,
      }),
      createTraceScore({
        id: `${traceId}-score-sentiment`,
        project_id: ctx.projectId,
        trace_id: traceId,
        environment,
        name: "sentiment",
        value: 0,
        string_value: rng.pick(["positive", "neutral", "negative"]),
        data_type: "CATEGORICAL",
        source: "EVAL",
        comment: null,
        metadata: {},
        timestamp,
      }),
    );

    if (withV4) {
      events.push(traceToEvent(trace));
      events.push(observationToEvent(generation, trace));
      events.push(observationToEvent(child, trace));
    }
  }

  const counts: Record<string, number> = {
    traces: traces.length,
    observations: observations.length,
    scores: scores.length,
    events: events.length,
  };

  ctx.log(
    `writing ${traces.length} traces, ${observations.length} observations, ${scores.length} scores${withV4 ? `, ${events.length} events` : ""}`,
  );
  for (const batch of chunk(traces, 1000)) await createTracesCh(batch);
  for (const batch of chunk(observations, 1000))
    await createObservationsCh(batch);
  for (const batch of chunk(scores, 1000)) await createScoresCh(batch);
  for (const batch of chunk(events, 500)) await createEventsCh(batch);

  const traceIds = traces.map((tr) => tr.id);
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND id IN {traceIds: Array(String)}`,
      { projectId: ctx.projectId, traceIds },
      "uniqExact(id)",
    ),
    scores: await countRows(
      "scores",
      `project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`,
      { projectId: ctx.projectId, traceIds },
      "uniqExact(id)",
    ),
  };
  if (withV4) {
    verified.events = await countRows(
      "events_full",
      `project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`,
      { projectId: ctx.projectId, traceIds },
      "uniqExact(span_id)",
    );
  }

  if (verified.traces < traces.length) {
    throw new SeedError(
      `Readback mismatch: expected ${traces.length} traces, found ${verified.traces}`,
    );
  }
  if (verified.scores < scores.length) {
    throw new SeedError(
      `Readback mismatch: expected ${scores.length} scores, found ${verified.scores}`,
    );
  }
  if (withV4 && verified.events < events.length) {
    throw new SeedError(
      `Readback mismatch: expected ${events.length} events_full rows, found ${verified.events}`,
    );
  }

  return {
    scenario: "filter-variety",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: traceIds.slice(0, 5),
    sessionIds: [],
    counts,
    verified,
    links: [
      tracesListLink(ctx),
      traceLink(ctx, traces[0].id, firstTraceTimestamp),
    ],
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const filterVarietyScenario: ScenarioDefinition = {
  name: "filter-variety",
  description:
    "Many standalone traces spread over 3 days with broad variety on EVERY filter facet — multiple environments, all observation types, weighted error/warning levels, a varied model + tag pool, domain metadata keys (region, tenant, customer.tier, routing.queue, feature.flag, …), numeric + categorical scores, and searchable input/output. For exercising the search bar / filter sidebar (and the Ask-AI OR/grouped filters) against rich data.",
  supportsV4: true,
  flags: [
    {
      flag: "traces",
      type: "number",
      default: 120,
      description: "number of standalone traces to create",
    },
    {
      flag: "v4",
      type: "boolean",
      default: false,
      description:
        "also mirror traces/observations into v4 events_full/events_core",
    },
  ],
  run,
};
