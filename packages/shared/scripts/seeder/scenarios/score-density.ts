import {
  createTrace,
  createObservation,
  createTraceScore,
  createTracesCh,
  createObservationsCh,
  createScoresCh,
  createEventsCh,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import { ObservationType } from "../../../src/domain";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { generationUsageCost } from "./payload";
import { jitter, Rng, utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, traceLink } from "./verify";

/**
 * Three traces that differ ONLY in how many scores they carry and where,
 * sized from production percentiles — for designing the trace-detail view
 * against real score density rather than an invented worst case.
 *
 * Production (scored traces, 7 days): scores per trace p50 3, p90 13, p95 20,
 * p99 49; distinct score names p50 2, p95 16; about half of scored traces
 * carry trace-level scores only. Per scored observation: p50 2, p90 4, p99 13.
 *
 * `timeline-annotated` puts at most four scores on a row; `trace-tree
 * --scores-per-node` puts the same N on every node. Neither lets you compare
 * the everyday shape against the tail side by side. So this emits one trace per
 * percentile:
 *
 *  - trace-only (p90): ~13 scores all on the TRACE from ~6 names, so several
 *    names repeat (re-run evals, a human overriding a judge); every observation
 *    is bare. The commonest production shape, at its busy end.
 *  - sporadic (p50): 3 trace-level scores plus four observations with two
 *    scores each; most observations carry none.
 *  - extreme (p99): ~49 scores in one trace from ~16 names — a few trace-level,
 *    two busy observations with 6-13 each, and 1-2 on most of the rest.
 *
 * Each trace is deterministic (own rng stream per shape, jitter-derived
 * timings) so re-runs with the same prefix overwrite in place.
 */

type Slug = "trace-only" | "sporadic" | "extreme";

type Shape = {
  slug: Slug;
  name: string;
  /** which production percentile this trace stands in for */
  percentile: string;
  about: string;
  /** observations in the tree (the root counts) */
  observations: number;
  /** scores attached to the trace itself; names repeat once the pool is used up */
  traceScores: number;
  /** size of the score-name vocabulary this trace draws from */
  distinctNames: number;
  /** observations carrying many scores, and how many each */
  busyObservations: number;
  busyScores: [number, number];
  /** observations carrying a few scores, and how many each */
  lightObservations: number;
  lightScores: [number, number];
};

const SHAPES: Shape[] = [
  {
    slug: "trace-only",
    name: "score-density: trace-only",
    percentile: "p90 scores per trace, trace-level only",
    about:
      "Thirteen trace-level scores from six names (numeric / categorical / boolean, some repeating); no observation carries any.",
    observations: 8,
    traceScores: 13,
    distinctNames: 6,
    busyObservations: 0,
    busyScores: [0, 0],
    lightObservations: 0,
    lightScores: [0, 0],
  },
  {
    slug: "sporadic",
    name: "score-density: sporadic",
    percentile: "p50 scores per trace and per observation",
    about:
      "Three trace-level scores plus four observations with two scores each; the rest carry none.",
    observations: 16,
    traceScores: 3,
    distinctNames: 8,
    busyObservations: 0,
    busyScores: [0, 0],
    lightObservations: 4,
    lightScores: [2, 2],
  },
  {
    slug: "extreme",
    name: "score-density: extreme",
    percentile: "p99 scores per trace, p95 distinct names",
    about:
      "About 49 scores from ~16 names: a few on the trace, two observations with 6-13 each, and 1-2 on most of the others.",
    observations: 32,
    traceScores: 3,
    distinctNames: 16,
    busyObservations: 2,
    busyScores: [6, 13],
    lightObservations: 18,
    lightScores: [1, 2],
  },
];

// A realistic eval-metric vocabulary. Numeric names dominate as they do in
// production (RAGAS / DeepEval style), categorical and boolean fill the rest.
// Long-ish names are deliberate: they truncate in badges like the real ones.
const NUMERIC_NAMES = [
  "helpfulness",
  "faithfulness",
  "answer_relevance",
  "context_precision",
  "context_recall",
  "groundedness",
  "coherence",
  "fluency",
  "conciseness",
  "instruction_following",
  "citation_accuracy",
  "toxicity",
  "bleu",
  "rouge_l",
  "bertscore_f1",
  "readability_grade",
  "latency_score",
  "cost_efficiency",
  "tool_selection_accuracy",
  "argument_correctness",
  "retrieval_hit_rate",
  "semantic_similarity",
  "completeness",
  "user_satisfaction_pred",
] as const;

const CATEGORICAL_NAMES: Record<string, readonly string[]> = {
  sentiment: ["positive", "neutral", "negative"],
  intent: ["question", "complaint", "request", "chitchat"],
  language: ["en", "de", "fr", "es"],
  tone: ["formal", "casual", "terse", "verbose"],
  risk_level: ["low", "medium", "high", "critical"],
  verdict: ["pass", "borderline", "fail"],
  topic: ["billing", "shipping", "account", "technical", "other"],
  hallucination_type: ["none", "fabricated_fact", "wrong_entity", "outdated"],
};

const BOOLEAN_NAMES = [
  "is_correct",
  "contains_pii",
  "refused",
  "on_topic",
  "hallucinated",
  "policy_violation",
  "needs_review",
  "resolved",
] as const;

type ScoreKind =
  | { kind: "numeric"; name: string }
  | { kind: "categorical"; name: string; categories: readonly string[] }
  | { kind: "boolean"; name: string };

const SCORE_POOL: ScoreKind[] = [
  ...NUMERIC_NAMES.map((name) => ({ kind: "numeric" as const, name })),
  ...Object.entries(CATEGORICAL_NAMES).map(([name, categories]) => ({
    kind: "categorical" as const,
    name,
    categories,
  })),
  ...BOOLEAN_NAMES.map((name) => ({ kind: "boolean" as const, name })),
];

const SOURCES = ["EVAL", "EVAL", "EVAL", "API", "ANNOTATION"] as const;

const COMMENTS = [
  "Judge model: gpt-5.4-mini, rubric v3.",
  "Borderline — second judge disagreed.",
  "Flagged by the nightly regression run.",
  "Human-reviewed, upheld.",
];

const OBS_TYPES: ObservationType[] = [
  "GENERATION",
  "TOOL",
  "RETRIEVER",
  "SPAN",
  "GUARDRAIL",
  "EMBEDDING",
  "GENERATION",
  "AGENT",
];

const OBS_NAMES: Record<string, string[]> = {
  GENERATION: ["compose-answer", "classify-intent", "summarize", "rerank-llm"],
  TOOL: ["search.web", "stripe.lookup", "crm.get_customer", "calendar.find"],
  RETRIEVER: ["vector-search", "bm25-search", "hybrid-retrieve"],
  SPAN: ["plan-step", "post-process", "format-response"],
  GUARDRAIL: ["guardrail.input", "guardrail.output", "pii-scan"],
  EMBEDDING: ["embed-query", "embed-chunks"],
  AGENT: ["react-turn", "critic"],
};

/** Deterministic in-place Fisher-Yates shuffle. */
const shuffle = <T>(rng: Rng, items: T[]): T[] => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};

/**
 * Deterministic k-subset of `pool`, no repeats, pool order preserved. With
 * every score type in the pool the mix stays mixed; a name never lands twice on
 * the same observation.
 */
const pickScores = (rng: Rng, pool: ScoreKind[], count: number): ScoreKind[] =>
  shuffle(
    rng,
    pool.map((_, index) => index),
  )
    .slice(0, Math.min(count, pool.length))
    .sort((a, b) => a - b)
    .map((index) => pool[index]!);

const buildScore = (
  ctx: ScenarioContext,
  rng: Rng,
  spec: ScoreKind,
  args: {
    id: string;
    traceId: string;
    observationId: string | null;
    timestamp: number;
  },
): ScoreRecordInsertType => {
  const base = {
    id: args.id,
    project_id: ctx.projectId,
    trace_id: args.traceId,
    observation_id: args.observationId,
    environment: ctx.environment,
    name: spec.name,
    source: rng.pick(SOURCES),
    comment: rng.bool(0.15) ? rng.pick(COMMENTS) : null,
    metadata: {},
    timestamp: args.timestamp,
  };
  if (spec.kind === "numeric") {
    return createTraceScore({
      ...base,
      value: Math.round(rng.next() * 100) / 100,
      data_type: "NUMERIC",
    });
  }
  if (spec.kind === "categorical") {
    return createTraceScore({
      ...base,
      value: 0,
      string_value: rng.pick(spec.categories),
      data_type: "CATEGORICAL",
    });
  }
  // BOOLEAN: `score_booleans` is concat(name, ':', lowerUTF8(string_value)),
  // so the True/False string must mirror the numeric value.
  const truthy = rng.bool(0.6);
  return createTraceScore({
    ...base,
    value: truthy ? 1 : 0,
    string_value: truthy ? "True" : "False",
    data_type: "BOOLEAN",
  });
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const withV4 = params["v4"] as boolean;
  const only = String(params["shape"]);

  const shapes =
    only === "all" ? SHAPES : SHAPES.filter((s) => s.slug === only);
  if (shapes.length === 0) {
    throw new SeedError(
      `unknown --shape "${only}"`,
      `one of: all, ${SHAPES.map((s) => s.slug).join(", ")}`,
    );
  }

  // One anchor per shape, ten minutes apart, all on today's UTC date so the
  // `?timestamp=` hint on the deep link resolves and re-runs overwrite.
  const dayStart = utcDayStartMs();
  const traceIdOf = (shape: Shape) => `${ctx.idPrefix}-${shape.slug}`;
  const timestampOf = (shape: Shape) =>
    dayStart + SHAPES.indexOf(shape) * 10 * 60 * 1000;
  const links = shapes.map((s) => traceLink(ctx, traceIdOf(s), timestampOf(s)));

  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const scores: ScoreRecordInsertType[] = [];
  const counts: Record<string, number> = {
    traces: 0,
    observations: 0,
    scores: 0,
    events: 0,
  };

  for (const shape of shapes) {
    // Own stream per shape: selecting a subset with --shape must not re-key
    // the others.
    const rng = new Rng(ctx.seed + SHAPES.indexOf(shape) * 7919);
    const traceId = traceIdOf(shape);
    const traceTimestamp = timestampOf(shape);
    const strideMs = 900;
    const rootId = `${traceId}-obs-0`;

    // This trace's vocabulary: a fixed subset of the pool, so distinct names
    // per trace land where production does (p50 2, p95 16) even when the
    // score count runs past it.
    const vocabulary = pickScores(rng, SCORE_POOL, shape.distinctNames);

    // Which non-root observations carry scores. The root stays bare on every
    // shape so the trace-level cluster is not confused with a root one.
    const scoredPlan = new Map<number, [number, number]>();
    const candidates = shuffle(
      rng,
      Array.from({ length: shape.observations - 1 }, (_, i) => i + 1),
    );
    candidates
      .slice(0, shape.busyObservations)
      .forEach((i) => scoredPlan.set(i, shape.busyScores));
    candidates
      .slice(
        shape.busyObservations,
        shape.busyObservations + shape.lightObservations,
      )
      .forEach((i) => scoredPlan.set(i, shape.lightScores));

    const shapeObservations: ObservationRecordInsertType[] = [];
    const shapeScores: ScoreRecordInsertType[] = [];

    for (let i = 0; i < shape.observations; i++) {
      const obsId = `${traceId}-obs-${i}`;
      const isRoot = i === 0;
      const type: ObservationType = isRoot
        ? "AGENT"
        : OBS_TYPES[(i - 1) % OBS_TYPES.length]!;
      // Every third non-root nests under its predecessor: some depth, mostly
      // a flat run of siblings, like a real agent turn.
      const parent = isRoot
        ? null
        : i > 1 && i % 3 === 0
          ? `${traceId}-obs-${i - 1}`
          : rootId;
      const start = isRoot ? 0 : i * strideMs + jitter(ctx.seed, i, 200);
      const duration = isRoot
        ? shape.observations * strideMs + 1_500
        : 150 +
          jitter(ctx.seed, i + 1_000, type === "GENERATION" ? 2_500 : 600);
      const isGeneration = type === "GENERATION";
      const usageIn = isGeneration
        ? 400 + jitter(ctx.seed, i + 2_000, 3_000)
        : 0;
      const usageOut = isGeneration ? 40 + jitter(ctx.seed, i + 3_000, 600) : 0;
      const names = OBS_NAMES[type] ?? ["step"];

      shapeObservations.push(
        createObservation({
          id: obsId,
          trace_id: traceId,
          project_id: ctx.projectId,
          environment: ctx.environment,
          type,
          parent_observation_id: parent,
          name: isRoot ? "handle-request" : names[i % names.length]!,
          start_time: traceTimestamp + start,
          end_time: traceTimestamp + start + duration,
          completion_start_time: isGeneration
            ? traceTimestamp + start + Math.floor(duration / 4)
            : null,
          level: "DEFAULT",
          status_message: null,
          version: null,
          input: isGeneration
            ? JSON.stringify([
                { role: "user", content: "Why was I charged twice?" },
              ])
            : null,
          output: isGeneration
            ? JSON.stringify({ role: "assistant", content: "One was a hold." })
            : null,
          metadata: { scenario: "score-density", shape: shape.slug },
          provided_model_name: isGeneration ? "gpt-5.4-mini" : null,
          internal_model_id: null,
          model_parameters: "{}",
          ...(isGeneration
            ? generationUsageCost(usageIn, usageOut)
            : {
                usage_details: {},
                provided_usage_details: {},
                cost_details: {},
                provided_cost_details: {},
                total_cost: 0,
              }),
          created_at: Date.now(),
          updated_at: Date.now(),
          event_ts: Date.now(),
        }),
      );

      const plan = scoredPlan.get(i);
      if (plan) {
        const [min, max] = plan;
        for (const spec of pickScores(rng, vocabulary, rng.int(min, max))) {
          shapeScores.push(
            buildScore(ctx, rng, spec, {
              id: `${obsId}-score-${spec.name}`,
              traceId,
              observationId: obsId,
              timestamp: traceTimestamp + start + duration,
            }),
          );
        }
      }
    }

    // Trace-level scores (observation_id null). Once the vocabulary is used up
    // names repeat — the same eval re-run, or a human overriding a judge — so
    // the id carries the ordinal.
    const traceVocabulary = pickScores(
      rng,
      vocabulary,
      Math.min(shape.traceScores, vocabulary.length),
    );
    for (let k = 0; k < shape.traceScores; k++) {
      const spec = traceVocabulary[k % traceVocabulary.length]!;
      shapeScores.push(
        buildScore(ctx, rng, spec, {
          id: `${traceId}-tscore-${spec.name}-${k}`,
          traceId,
          observationId: null,
          timestamp: traceTimestamp + k * 1_000,
        }),
      );
    }

    const traceScoreCount = shapeScores.filter(
      (s) => s.observation_id === null,
    ).length;
    const distinctNames = new Set(shapeScores.map((s) => s.name)).size;

    traces.push(
      createTrace({
        id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        name: shape.name,
        timestamp: traceTimestamp,
        user_id: "reviewer@langfuse.com",
        session_id: null,
        release: "2026.09.09-1",
        version: "score-density-v1",
        tags: ["seed", "score-density", `density:${shape.slug}`],
        public: false,
        bookmarked: false,
        metadata: {
          scenario: "score-density",
          shape: shape.slug,
          percentile: shape.percentile,
          about: shape.about,
          observations: String(shapeObservations.length),
          scores: String(shapeScores.length),
          traceScores: String(traceScoreCount),
          observationScores: String(shapeScores.length - traceScoreCount),
          distinctScoreNames: String(distinctNames),
        },
        input: JSON.stringify({ question: "Why was I charged twice?" }),
        output: JSON.stringify({ answer: "You were not — one was a hold." }),
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      }),
    );
    observations.push(...shapeObservations);
    scores.push(...shapeScores);

    counts.traces += 1;
    counts.observations += shapeObservations.length;
    counts.scores += shapeScores.length;
    counts.events += withV4 ? shapeObservations.length + 1 : 0;
    counts[`scores:${shape.slug}`] = shapeScores.length;
    counts[`traceScores:${shape.slug}`] = traceScoreCount;
    counts[`observationScores:${shape.slug}`] =
      shapeScores.length - traceScoreCount;
    counts[`distinctScoreNames:${shape.slug}`] = distinctNames;
  }

  if (ctx.dryRun) {
    return {
      scenario: "score-density",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: traces.map((t) => t.id),
      sessionIds: [],
      counts,
      verified: {},
      links,
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  ctx.log(
    `writing ${traces.length} traces, ${observations.length} observations, ${scores.length} scores${withV4 ? `, ${counts.events} events` : ""}`,
  );
  await createTracesCh(traces);
  for (const batch of chunk(observations, 1000)) {
    await createObservationsCh(batch);
  }
  for (const batch of chunk(scores, 1000)) {
    await createScoresCh(batch);
  }
  if (withV4) {
    const events = traces.flatMap((trace) => [
      traceToEvent(trace),
      ...observations
        .filter((o) => o.trace_id === trace.id)
        .map((o) => observationToEvent(o, trace)),
    ]);
    for (const batch of chunk(events, 500)) {
      await createEventsCh(batch);
    }
  }

  // uniqExact(id): count() would see pre-merge ReplacingMergeTree duplicates
  // after re-runs with the same id prefix.
  const traceIds = traces.map((t) => t.id);
  const byTrace = `project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`;
  const args = { projectId: ctx.projectId, traceIds };
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND id IN {traceIds: Array(String)}`,
      args,
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      byTrace,
      args,
      "uniqExact(id)",
    ),
    scores: await countRows("scores", byTrace, args, "uniqExact(id)"),
  };
  if (withV4) {
    verified.events = await countRows(
      "events_full",
      byTrace,
      args,
      "uniqExact(span_id)",
    );
  }
  for (const key of ["traces", "observations", "scores"] as const) {
    if (verified[key]! < counts[key]!) {
      throw new SeedError(
        `Readback mismatch: expected ${counts[key]} ${key}, found ${verified[key]}`,
        "re-run; if it persists, check the ClickHouse the CLI is pointed at",
      );
    }
  }
  if (withV4 && verified.events! < counts.events!) {
    throw new SeedError(
      `Readback mismatch: expected ${counts.events} events_full rows, found ${verified.events}`,
    );
  }

  return {
    scenario: "score-density",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds,
    sessionIds: [],
    counts,
    verified,
    links,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const scoreDensityScenario: ScenarioDefinition = {
  name: "score-density",
  description:
    "Three traces that differ only in SCORE density, sized from production percentiles, for designing the trace-detail view: trace-only (p90: ~13 numeric / categorical / boolean scores on the trace from ~6 names, bare observations), sporadic (p50: 3 trace-level scores plus four observations with two each), and extreme (p99: ~49 scores from ~16 names — a few on the trace, two observations with 6-13 each, 1-2 on most others).",
  supportsV4: true,
  flags: [
    {
      flag: "shape",
      type: "string",
      default: "all",
      description: `one density or all: all, ${SHAPES.map((s) => s.slug).join(", ")}`,
    },
    {
      flag: "v4",
      type: "boolean",
      default: false,
      description: "also mirror into v4 events_full/events_core",
    },
  ],
  run,
};
