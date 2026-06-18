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

// Score names deliberately containing SPACES (and mixed case) to exercise the
// filter sidebar + grammar search bar with names the grammar must quote, e.g.
// `scores."Rouge Score">=1` / `traceScores."Hallucination Check":faithful`.
// Observation-level scores surface under the `scores.` grammar prefix;
// trace-level scores under `traceScores.`. Both numeric and categorical are
// covered. One no-space score ("accuracy") is included as a control.
const OBSERVATION_NUMERIC_SCORES = [
  "Rouge Score",
  "Score With A Space",
] as const;
const OBSERVATION_CATEGORICAL_SCORE = "Answer Relevancy";
const OBSERVATION_CATEGORIES = [
  "relevant",
  "partially relevant",
  "irrelevant",
] as const;
const TRACE_NUMERIC_SCORE = "Faithfulness Score";
const TRACE_NUMERIC_CONTROL_SCORE = "accuracy"; // no space — control
const TRACE_CATEGORICAL_SCORE = "Hallucination Check";
const TRACE_CATEGORIES = ["faithful", "hallucinated"] as const;

const TRACE_NAMES = [
  "qa-eval-run",
  "summarize-doc",
  "rag-answer",
  "classify-intent",
] as const;

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const traceCount = Math.max(1, Number(params.traces ?? 24));
  const withV4 = params.v4 === true;

  // Anchor on utcDayStartMs() (today's UTC midnight), NOT Date.now(): these
  // timestamps land in ClickHouse ORDER BY keys, and the seeder contract
  // requires them to be deterministic so re-runs with the same flags overwrite
  // in place (a wall-clock anchor would shift every row and duplicate under
  // ReplacingMergeTree). The window spans the 6h before midnight; jitter()
  // (stateless) adds per-row variation.
  const windowMs = 6 * 60 * 60 * 1000;
  const endMs = utcDayStartMs();
  const startMs = endMs - windowMs;
  const stepMs = windowMs / traceCount;
  // The trace-detail link's `?timestamp=` hint must match trace[0]'s actual
  // timestamp (window START + jitter), not the window END — the detail page
  // prunes by `toDate(timestamp)`, so a different-day hint 404s.
  const firstTraceTimestamp = startMs + jitter(ctx.seed, 0, 1000);

  if (ctx.dryRun) {
    return {
      scenario: "scored-traces",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [`${ctx.idPrefix}-t0`],
      sessionIds: [],
      counts: {
        traces: traceCount,
        observations: traceCount,
        // 3 observation-level + 3 trace-level scores per trace
        scores: traceCount * 6,
        events: withV4 ? traceCount * 2 : 0,
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

    const trace = createTrace({
      id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      session_id: null,
      timestamp,
      name: rng.pick(TRACE_NAMES),
      user_id: `user-${ctx.idPrefix}-${t % 6}`,
      tags: ["seed", "scored-traces"],
      public: false,
      bookmarked: false,
      metadata: { scenario: "scored-traces" },
      input: JSON.stringify({ question: "What is Langfuse used for?" }),
      output: "Langfuse is an LLM engineering platform.",
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    });
    traces.push(trace);

    const obsId = `${traceId}-o0`;
    const observation = createObservation({
      id: obsId,
      trace_id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      type: "GENERATION",
      parent_observation_id: null,
      name: "answer-generation",
      start_time: timestamp,
      end_time: timestamp + rng.int(300, 3000),
      completion_start_time: timestamp + rng.int(90, 250),
      level: "DEFAULT",
      status_message: null,
      input: JSON.stringify({ prompt: "Answer the question." }),
      output: "Langfuse is an LLM engineering platform.",
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    });
    observations.push(observation);

    // Observation-level scores (-> `scores.<name>` in the grammar).
    for (const name of OBSERVATION_NUMERIC_SCORES) {
      scores.push(
        createTraceScore({
          id: `${obsId}-score-${name}`,
          project_id: ctx.projectId,
          trace_id: traceId,
          observation_id: obsId,
          environment: ctx.environment,
          name,
          value: Math.round(rng.next() * 100) / 100,
          data_type: "NUMERIC",
          source: "EVAL",
          comment: null,
          metadata: {},
          timestamp,
        }),
      );
    }
    scores.push(
      createTraceScore({
        id: `${obsId}-score-${OBSERVATION_CATEGORICAL_SCORE}`,
        project_id: ctx.projectId,
        trace_id: traceId,
        observation_id: obsId,
        environment: ctx.environment,
        name: OBSERVATION_CATEGORICAL_SCORE,
        value: 0,
        string_value: rng.pick(OBSERVATION_CATEGORIES),
        data_type: "CATEGORICAL",
        source: "EVAL",
        comment: null,
        metadata: {},
        timestamp,
      }),
    );

    // Trace-level scores (-> `traceScores.<name>` in the grammar). These are the
    // eval-style scores attached to the whole trace (observation_id stays null).
    for (const name of [TRACE_NUMERIC_SCORE, TRACE_NUMERIC_CONTROL_SCORE]) {
      scores.push(
        createTraceScore({
          id: `${traceId}-score-${name}`,
          project_id: ctx.projectId,
          trace_id: traceId,
          environment: ctx.environment,
          name,
          value: Math.round(rng.next() * 100) / 100,
          data_type: "NUMERIC",
          source: "EVAL",
          comment: null,
          metadata: {},
          timestamp,
        }),
      );
    }
    scores.push(
      createTraceScore({
        id: `${traceId}-score-${TRACE_CATEGORICAL_SCORE}`,
        project_id: ctx.projectId,
        trace_id: traceId,
        environment: ctx.environment,
        name: TRACE_CATEGORICAL_SCORE,
        value: 0,
        string_value: rng.pick(TRACE_CATEGORIES),
        data_type: "CATEGORICAL",
        source: "EVAL",
        comment: null,
        metadata: {},
        timestamp,
      }),
    );

    if (withV4) {
      events.push(traceToEvent(trace));
      events.push(observationToEvent(observation, trace));
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
  for (const batch of chunk(traces, 1000)) {
    await createTracesCh(batch);
  }
  for (const batch of chunk(observations, 1000)) {
    await createObservationsCh(batch);
  }
  for (const batch of chunk(scores, 1000)) {
    await createScoresCh(batch);
  }
  for (const batch of chunk(events, 500)) {
    await createEventsCh(batch);
  }

  // uniqExact(id): count() would see pre-merge ReplacingMergeTree duplicates
  // after re-runs with the same id prefix.
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
    scenario: "scored-traces",
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

export const scoredTracesScenario: ScenarioDefinition = {
  name: "scored-traces",
  description:
    'Standalone traces each carrying numeric + categorical scores whose names contain SPACES (e.g. "Rouge Score", "Score With A Space") at both observation level (scores.) and trace level (traceScores.). For exercising the score filter sidebar and the grammar search bar with quoted score names.',
  supportsV4: true,
  flags: [
    {
      flag: "traces",
      type: "number",
      default: 24,
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
