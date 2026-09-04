import { prisma } from "../../../src/db";
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
import { utcDayStartMs } from "./rng";
import {
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, traceLink } from "./verify";

/**
 * ONE trace carrying every annotation a timeline row can show, on purpose, all
 * at once — a worst case for visual load rather than a realistic trace.
 *
 * `timeline-shapes` answers "does a timeline read at this shape". This answers a
 * different question: with scores, comments, costs, a heat map and a
 * first-token mark on the same rows, is the row still legible or is it a wall?
 * You cannot judge that from a trace where each row has one thing.
 *
 * So the rows are laid out to put each addition next to a plain one:
 *  - a row with no annotations at all, for contrast
 *  - one score, two scores, and four (which collapses into "+1")
 *  - one comment, and twelve (a two-digit badge)
 *  - one row carrying comment AND scores AND cost together
 *  - a streaming answer with a time-to-first-token mark inside its bar
 *  - the widest bar (label sits INSIDE), a mid-lane sliver (label AFTER), and a
 *    span hard against the right edge (label BEFORE), so all three placements
 *    are on screen at once
 *  - costs and durations spread wide enough that the heat map paints some rows
 *    and leaves others alone
 *
 * Hand-timed, no rng: the same trace every run.
 */

const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "gpt-5.4": { input: 1.25e-6, output: 1e-5 },
  "gpt-5.4-mini": { input: 2.5e-7, output: 2e-6 },
  "text-embedding-4": { input: 2e-8, output: 0 },
};

type Annotated = {
  key: string;
  parent: string | null;
  type: ObservationType;
  name: string;
  /** ms from the trace start */
  start: number;
  /** ms from the trace start; null = still running */
  end: number | null;
  model?: keyof typeof MODEL_PRICES;
  usage?: [number, number];
  /** time to first token, ms after start */
  ttft?: number;
  /** [name, value] per score, observation-level */
  scores?: Array<[string, number]>;
  /** how many comments hang off this observation */
  comments?: number;
  /** what this row is here to demonstrate */
  demonstrates: string;
};

const SPANS: Annotated[] = [
  {
    key: "root",
    parent: null,
    type: "SPAN",
    name: "handle-request",
    start: 0,
    end: 19_800,
    demonstrates:
      "the whole trace — 100% of the duration, so the heat map reddens it",
  },
  {
    key: "guard-in",
    parent: "root",
    type: "GUARDRAIL",
    name: "guardrail.input",
    start: 40,
    end: 180,
    demonstrates: "a plain row with nothing on it, for contrast",
  },
  {
    key: "classify",
    parent: "root",
    type: "GENERATION",
    name: "classify-intent",
    start: 200,
    end: 900,
    model: "gpt-5.4-mini",
    usage: [900, 40],
    scores: [["helpfulness", 0.92]],
    demonstrates: "one score",
  },
  {
    key: "retrieve",
    parent: "root",
    type: "RETRIEVER",
    name: "vector-search",
    start: 950,
    end: 2_100,
    scores: [
      ["relevance", 0.71],
      ["coverage", 0.44],
    ],
    demonstrates: "two scores",
  },
  {
    key: "embed",
    parent: "retrieve",
    type: "EMBEDDING",
    name: "embed-query",
    start: 960,
    end: 1_010,
    model: "text-embedding-4",
    usage: [18, 0],
    demonstrates: "a sliver mid-lane — its label goes AFTER the bar",
  },
  {
    key: "answer",
    parent: "root",
    type: "GENERATION",
    name: "compose-answer",
    start: 2_200,
    end: 12_000,
    model: "gpt-5.4",
    usage: [12_000, 1_800],
    ttft: 1_400,
    scores: [
      ["helpfulness", 0.88],
      ["faithfulness", 0.95],
      ["tone", 0.62],
      ["verbosity", 0.31],
    ],
    demonstrates:
      "the loaded generation: first-token mark, the biggest cost, and four scores collapsing to +1",
  },
  {
    key: "refund",
    parent: "root",
    type: "TOOL",
    name: "stripe.refund",
    start: 12_100,
    end: 13_000,
    comments: 12,
    demonstrates: "a two-digit comment count",
  },
  {
    key: "email",
    parent: "root",
    type: "TOOL",
    name: "email.send",
    start: 13_100,
    end: 13_400,
    model: "gpt-5.4-mini",
    usage: [300, 90],
    comments: 1,
    scores: [
      ["tone", 0.77],
      ["length", 0.5],
    ],
    demonstrates:
      "everything on one row: comment, cost and two scores together",
  },
  {
    key: "verify",
    parent: "root",
    type: "GENERATION",
    name: "verify-answer",
    start: 13_500,
    end: 15_000,
    model: "gpt-5.4-mini",
    usage: [700, 120],
    demonstrates: "a cost with no annotations — the baseline for comparison",
  },
  {
    key: "guard-out",
    parent: "root",
    type: "GUARDRAIL",
    name: "guardrail.output",
    start: 15_100,
    end: 15_300,
    demonstrates: "another plain row",
  },
  {
    key: "persist",
    parent: "root",
    type: "SPAN",
    name: "persist-conversation",
    start: 19_500,
    end: 19_800,
    scores: [["durability", 1]],
    comments: 2,
    demonstrates:
      "hard against the right edge — nothing fits after it, so the cluster goes BEFORE the bar",
  },
  {
    key: "audit",
    parent: "root",
    type: "EVENT",
    name: "audit.logged",
    start: 19_700,
    end: 19_700,
    demonstrates: "a zero-duration checkpoint",
  },
];

const COMMENT_TEXTS = [
  "Confirmed with the customer, refund approved.",
  "This is the second attempt — the first timed out.",
  "Numbers match the invoice.",
  "Flagging for the weekly review.",
  "Latency here is expected: the provider throttles us at this hour.",
];

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const withV4 = params["v4"] as boolean;
  const traceTimestamp = utcDayStartMs();
  const traceId = `${ctx.idPrefix}-annotated`;
  const idOf = new Map(
    SPANS.map((span, index) => [span.key, `${traceId}-obs-${index}`]),
  );
  const commentCount = SPANS.reduce((n, s) => n + (s.comments ?? 0), 0);
  const scoreCount = SPANS.reduce((n, s) => n + (s.scores?.length ?? 0), 0);

  if (ctx.dryRun) {
    return {
      scenario: "timeline-annotated",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [traceId],
      sessionIds: [],
      counts: {
        traces: 1,
        observations: SPANS.length,
        scores: scoreCount,
        comments: commentCount,
        events: withV4 ? SPANS.length + 1 : 0,
      },
      verified: {},
      links: [traceLink(ctx, traceId, traceTimestamp)],
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const trace: TraceRecordInsertType = createTrace({
    id: traceId,
    project_id: ctx.projectId,
    environment: ctx.environment,
    name: "annotated-request",
    timestamp: traceTimestamp,
    user_id: "reviewer@langfuse.com",
    session_id: null,
    release: "2026.08.26-1",
    version: "annotated-v1",
    tags: ["seed", "timeline-annotated", "design-review"],
    public: false,
    bookmarked: false,
    metadata: {
      scenario: "timeline-annotated",
      about:
        "Every row annotation at once — for judging visual load, not realism.",
      spans: String(SPANS.length),
      scores: String(scoreCount),
      comments: String(commentCount),
    },
    input: JSON.stringify({ question: "Why was I charged twice?" }),
    output: JSON.stringify({ answer: "You were not — one was a hold." }),
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
  });

  const observations: ObservationRecordInsertType[] = [];
  const scores: ScoreRecordInsertType[] = [];

  for (const span of SPANS) {
    const obsId = idOf.get(span.key)!;
    const prices = span.model ? MODEL_PRICES[span.model] : null;
    const [usageIn, usageOut] = span.usage ?? [0, 0];

    observations.push(
      createObservation({
        id: obsId,
        trace_id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type: span.type,
        parent_observation_id:
          span.parent === null ? null : (idOf.get(span.parent) ?? null),
        name: span.name,
        start_time: traceTimestamp + span.start,
        end_time: span.end === null ? null : traceTimestamp + span.end,
        completion_start_time:
          span.ttft === undefined
            ? null
            : traceTimestamp + span.start + span.ttft,
        level: "DEFAULT",
        status_message: null,
        version: null,
        input: null,
        output: null,
        metadata: {
          scenario: "timeline-annotated",
          demonstrates: span.demonstrates,
        },
        provided_model_name: span.model ?? null,
        internal_model_id: null,
        model_parameters: "{}",
        ...(prices
          ? generationUsageCost(usageIn, usageOut, prices)
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

    for (const [name, value] of span.scores ?? []) {
      scores.push(
        createTraceScore({
          id: `${obsId}-score-${name}`,
          project_id: ctx.projectId,
          trace_id: traceId,
          observation_id: obsId,
          environment: ctx.environment,
          name,
          value,
          data_type: "NUMERIC",
          source: "EVAL",
          comment: null,
          metadata: {},
          timestamp: traceTimestamp + span.start,
        }),
      );
    }
  }

  await createTracesCh([trace]);
  await createObservationsCh(observations);
  await createScoresCh(scores);
  if (withV4) {
    await createEventsCh([
      traceToEvent(trace),
      ...observations.map((observation) =>
        observationToEvent(observation, trace),
      ),
    ]);
  }

  // Comments live in Postgres, not ClickHouse — the timeline reads a count per
  // observation, so what matters here is how MANY hang off a row.
  const comments = SPANS.flatMap((span) =>
    Array.from({ length: span.comments ?? 0 }, (_, index) => ({
      id: `${idOf.get(span.key)!}-comment-${index}`,
      projectId: ctx.projectId,
      objectType: "OBSERVATION" as const,
      objectId: idOf.get(span.key)!,
      content: COMMENT_TEXTS[index % COMMENT_TEXTS.length]!,
      authorUserId: null,
    })),
  );
  if (comments.length > 0) {
    await prisma.comment.createMany({ data: comments, skipDuplicates: true });
  }

  const byTrace = `project_id = {projectId: String} AND trace_id = {traceId: String}`;
  const args = { projectId: ctx.projectId, traceId };
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND id = {traceId: String}`,
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
    // events_full has no `id` column — count rows.
    verified.events = await countRows("events_full", byTrace, args);
  }
  if (verified.observations < observations.length) {
    throw new SeedError(
      `wrote ${observations.length} observations, read back ${verified.observations}`,
      "re-run; if it persists, check the ClickHouse the CLI is pointed at",
    );
  }

  return {
    scenario: "timeline-annotated",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: [traceId],
    sessionIds: [],
    counts: {
      traces: 1,
      observations: observations.length,
      scores: scores.length,
      comments: comments.length,
      events: withV4 ? observations.length + 1 : 0,
    },
    verified,
    links: [traceLink(ctx, traceId, traceTimestamp)],
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const timelineAnnotatedScenario: ScenarioDefinition = {
  name: "timeline-annotated",
  description:
    "ONE trace carrying every row annotation at once — scores (one, two, and four collapsing to +1), comments (one and twelve), costs, the duration and cost heat maps, and a streaming first-token mark — with plain rows beside them for contrast, and all three label placements on screen together. A worst case for visual load rather than a realistic trace: for judging whether an annotated row is still legible.",
  supportsV4: true,
  flags: [
    {
      flag: "v4",
      type: "boolean",
      default: false,
      description: "also mirror into v4 events_full/events_core",
    },
  ],
  run,
};
