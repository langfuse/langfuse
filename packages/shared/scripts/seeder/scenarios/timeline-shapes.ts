import {
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
  createEventsCh,
  ObservationRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import { ObservationType } from "../../../src/domain";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { generationUsageCost } from "./payload";
import { utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, traceLink } from "./verify";

/**
 * A dozen SMALL traces, each a different timeline morphology.
 *
 * The other scenarios generate one big shape with knobs, which answers "does it
 * survive 3000 spans" but not "does a timeline read". Real traces are mostly
 * small and they differ from each other in ways that are specifically about
 * TIME: a retry storm has widening gaps, an approval flow has one huge hole in
 * the middle, a fan-out is a column of overlapping bars, a slow tool is one bar
 * that dwarfs everything, a streaming answer has a time-to-first-token mark
 * inside it. None of that shows up in a scaled-up hub of a thousand siblings.
 *
 * So each shape here is hand-timed with plausible latencies — embeddings in tens
 * of ms, vector search in hundreds, LLM calls in seconds, humans in minutes —
 * and kept to 4-25 observations, because that is the size a trace usually is.
 * Deterministic: no rng at all, the offsets are written down.
 */

const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "gpt-5.4": { input: 1.25e-6, output: 1e-5 },
  "gpt-5.4-mini": { input: 2.5e-7, output: 2e-6 },
  "text-embedding-4": { input: 2e-8, output: 0 },
};

type Span = {
  key: string;
  parent: string | null;
  type: ObservationType;
  name: string;
  /** ms from the trace start */
  start: number;
  /** ms from the trace start; null = still running (no end time at all) */
  end: number | null;
  model?: keyof typeof MODEL_PRICES;
  /** [input, output] tokens — generations only */
  usage?: [number, number];
  /** time to first token, ms after start — generations only */
  ttft?: number;
  level?: "DEFAULT" | "WARNING" | "ERROR";
  status?: string;
  input?: unknown;
  output?: unknown;
};

type Shape = {
  slug: string;
  /** Trace name, and what the shape is called in the catalog. */
  name: string;
  /** One line on what this shape teaches a timeline. */
  about: string;
  tags: string[];
  user: string;
  spans: Span[];
};

/** A sequence of same-shaped siblings, for the shapes that are a queue. */
const siblings = (
  count: number,
  from: number,
  each: number,
  gap: number,
  make: (index: number) => Omit<Span, "start" | "end" | "parent">,
): Span[] =>
  Array.from({ length: count }, (_, index) => ({
    parent: "root",
    start: from + index * (each + gap),
    end: from + index * (each + gap) + each,
    ...make(index),
  }));

const SHAPES: Shape[] = [
  {
    slug: "rag-answer",
    name: "rag.answer",
    about: "The everyday one: embed, search, rerank, answer. 2.4 seconds.",
    tags: ["shape:rag", "small"],
    user: "ana@acme.io",
    spans: [
      {
        key: "root",
        parent: null,
        type: "SPAN",
        name: "rag.answer",
        start: 0,
        end: 2380,
        input: { question: "Which plans include SSO?" },
        output: { answer: "Team and Enterprise include SSO." },
      },
      {
        key: "embed",
        parent: "root",
        type: "EMBEDDING",
        name: "embed-query",
        start: 30,
        end: 96,
        model: "text-embedding-4",
        usage: [12, 0],
      },
      {
        key: "search",
        parent: "root",
        type: "RETRIEVER",
        name: "vector-search",
        start: 105,
        end: 381,
        output: { hits: 8, top_score: 0.83 },
      },
      {
        key: "pg",
        parent: "search",
        type: "TOOL",
        name: "pgvector.query",
        start: 120,
        end: 360,
      },
      {
        key: "rerank",
        parent: "root",
        type: "SPAN",
        name: "rerank",
        start: 395,
        end: 612,
      },
      {
        key: "answer",
        parent: "root",
        type: "GENERATION",
        name: "answer-llm",
        start: 640,
        end: 2360,
        model: "gpt-5.4-mini",
        usage: [1840, 260],
        ttft: 420,
      },
    ],
  },
  {
    slug: "streaming-chat",
    name: "chat.turn",
    about:
      "One long streamed answer: the bar is split at time-to-first-token, so waiting and generating are different things.",
    tags: ["shape:streaming", "small"],
    user: "ben@acme.io",
    spans: [
      {
        key: "root",
        parent: null,
        type: "SPAN",
        name: "chat.turn",
        start: 0,
        end: 8180,
      },
      {
        key: "guard",
        parent: "root",
        type: "GUARDRAIL",
        name: "guardrail.input",
        start: 20,
        end: 74,
        output: { verdict: "pass" },
      },
      {
        key: "llm",
        parent: "root",
        type: "GENERATION",
        name: "chat-llm",
        start: 90,
        end: 8020,
        model: "gpt-5.4",
        usage: [520, 1480],
        ttft: 640,
      },
      {
        key: "persist",
        parent: "root",
        type: "SPAN",
        name: "persist-message",
        start: 8040,
        end: 8170,
      },
    ],
  },
  {
    slug: "parallel-fanout",
    name: "enrich.contact",
    about:
      "Eight tools launched at once and joined: a column of overlapping bars, which a tree cannot show you.",
    tags: ["shape:parallel", "small"],
    user: "cara@acme.io",
    spans: [
      {
        key: "root",
        parent: null,
        type: "AGENT",
        name: "enrich.contact",
        start: 0,
        end: 3080,
      },
      {
        key: "plan",
        parent: "root",
        type: "GENERATION",
        name: "plan-enrichment",
        start: 40,
        end: 760,
        model: "gpt-5.4-mini",
        usage: [340, 90],
        ttft: 210,
      },
      {
        key: "fan",
        parent: "root",
        type: "SPAN",
        name: "fan-out",
        start: 790,
        end: 2760,
      },
      // All eight start within 60ms of each other and finish whenever they finish.
      ...[
        ["clearbit.lookup", 1960],
        ["linkedin.profile", 2740],
        ["crm.contact", 1190],
        ["billing.account", 1420],
        ["tickets.recent", 2210],
        ["usage.rollup", 1640],
        ["notes.search", 980],
        ["email.threads", 2480],
      ].map(([name, end], index) => ({
        key: `tool-${index}`,
        parent: "fan",
        type: "TOOL" as ObservationType,
        name: name as string,
        start: 800 + index * 8,
        end: end as number,
      })),
      {
        key: "merge",
        parent: "root",
        type: "GENERATION",
        name: "merge-llm",
        start: 2790,
        end: 3060,
        model: "gpt-5.4-mini",
        usage: [1200, 180],
        ttft: 120,
      },
    ],
  },
  {
    slug: "retry-backoff",
    name: "sync.invoices",
    about:
      "A rate-limited API retried with exponential backoff: you can SEE 1s, 2s and 4s of waiting between the attempts.",
    tags: ["shape:retry", "small"],
    user: "dev@acme.io",
    spans: [
      {
        key: "root",
        parent: null,
        type: "SPAN",
        name: "sync.invoices",
        start: 0,
        end: 12520,
      },
      {
        key: "a1",
        parent: "root",
        type: "TOOL",
        name: "stripe.list (attempt 1)",
        start: 40,
        end: 1240,
        level: "ERROR",
        status: "429 rate_limited — retrying in 1s",
      },
      {
        key: "a2",
        parent: "root",
        type: "TOOL",
        name: "stripe.list (attempt 2)",
        start: 2260,
        end: 3480,
        level: "ERROR",
        status: "429 rate_limited — retrying in 2s",
      },
      {
        key: "a3",
        parent: "root",
        type: "TOOL",
        name: "stripe.list (attempt 3)",
        start: 5500,
        end: 6820,
        level: "ERROR",
        status: "429 rate_limited — retrying in 4s",
      },
      {
        key: "a4",
        parent: "root",
        type: "TOOL",
        name: "stripe.list (attempt 4)",
        start: 10840,
        end: 12240,
        output: { invoices: 34 },
      },
      {
        key: "persist",
        parent: "root",
        type: "SPAN",
        name: "persist-invoices",
        start: 12270,
        end: 12480,
      },
    ],
  },
  {
    slug: "waiting-on-approval",
    name: "refund.workflow",
    about:
      "13 minutes of the 13.5 are one human deciding: the hole in the middle IS the trace.",
    tags: ["shape:human-in-the-loop", "small"],
    user: "ops@acme.io",
    spans: [
      {
        key: "root",
        parent: null,
        type: "AGENT",
        name: "refund.workflow",
        start: 0,
        end: 811_000,
      },
      {
        key: "draft",
        parent: "root",
        type: "GENERATION",
        name: "draft-refund",
        start: 60,
        end: 1980,
        model: "gpt-5.4",
        usage: [880, 240],
        ttft: 300,
      },
      {
        key: "notify",
        parent: "root",
        type: "TOOL",
        name: "slack.request-approval",
        start: 2010,
        end: 2260,
      },
      {
        key: "wait",
        parent: "root",
        type: "EVENT",
        name: "awaiting-approval",
        start: 2300,
        end: 2300,
      },
      {
        key: "granted",
        parent: "root",
        type: "EVENT",
        name: "approval.granted",
        start: 795_000,
        end: 795_000,
      },
      {
        key: "refund",
        parent: "root",
        type: "TOOL",
        name: "stripe.create-refund",
        start: 795_200,
        end: 797_400,
        output: { refund_id: "re_8Fj2kQ" },
      },
      {
        key: "email",
        parent: "root",
        type: "SPAN",
        name: "confirm-email",
        start: 797_500,
        end: 810_900,
      },
    ],
  },
  {
    slug: "slow-tool",
    name: "report.build",
    about:
      "One 43-second warehouse query and five fast spans: the scale problem, where everything else is a sliver.",
    tags: ["shape:one-slow-span", "small"],
    user: "reports@acme.io",
    spans: [
      {
        key: "root",
        parent: null,
        type: "SPAN",
        name: "report.build",
        start: 0,
        end: 46_800,
      },
      {
        key: "cache",
        parent: "root",
        type: "EMBEDDING",
        name: "cache-key",
        start: 40,
        end: 80,
        model: "text-embedding-4",
        usage: [8, 0],
      },
      {
        key: "plan",
        parent: "root",
        type: "GENERATION",
        name: "plan-report",
        start: 110,
        end: 980,
        model: "gpt-5.4-mini",
        usage: [420, 140],
        ttft: 190,
      },
      {
        key: "warehouse",
        parent: "root",
        type: "TOOL",
        name: "warehouse.query",
        start: 1010,
        end: 44_200,
        output: { rows: 1_284_302 },
      },
      {
        key: "format",
        parent: "root",
        type: "SPAN",
        name: "format-tables",
        start: 44_230,
        end: 45_100,
      },
      {
        key: "summarize",
        parent: "root",
        type: "GENERATION",
        name: "summarize",
        start: 45_130,
        end: 46_700,
        model: "gpt-5.4",
        usage: [3200, 420],
        ttft: 380,
      },
    ],
  },
  {
    slug: "error-cascade",
    name: "assistant.turn",
    about:
      "A 503 on the primary model, a failover, and a warning on the output guard: three levels in one trace.",
    tags: ["shape:errors", "small"],
    user: "eve@acme.io",
    spans: [
      {
        key: "root",
        parent: null,
        type: "AGENT",
        name: "assistant.turn",
        start: 0,
        end: 6380,
        level: "WARNING",
        status: "answered on the fallback model",
      },
      {
        key: "guard-in",
        parent: "root",
        type: "GUARDRAIL",
        name: "guardrail.input",
        start: 25,
        end: 88,
      },
      {
        key: "primary",
        parent: "root",
        type: "GENERATION",
        name: "primary-llm",
        start: 110,
        end: 2400,
        model: "gpt-5.4",
        usage: [640, 0],
        level: "ERROR",
        status: "upstream 503 after 2 attempts",
      },
      {
        key: "failover",
        parent: "root",
        type: "EVENT",
        name: "failover",
        start: 2420,
        end: 2420,
      },
      {
        key: "fallback",
        parent: "root",
        type: "GENERATION",
        name: "fallback-llm",
        start: 2460,
        end: 5900,
        model: "gpt-5.4-mini",
        usage: [640, 720],
        ttft: 700,
      },
      {
        key: "guard-out",
        parent: "root",
        type: "GUARDRAIL",
        name: "guardrail.output",
        start: 5930,
        end: 6010,
        level: "WARNING",
        status: "1 pii redaction",
      },
      {
        key: "redact",
        parent: "root",
        type: "SPAN",
        name: "redact",
        start: 6030,
        end: 6180,
      },
      {
        key: "send",
        parent: "root",
        type: "SPAN",
        name: "send",
        start: 6200,
        end: 6360,
      },
    ],
  },
  {
    slug: "still-running",
    name: "batch.embed",
    about:
      "Three spans have no end time yet: the in-flight shape, which has no duration to label.",
    tags: ["shape:in-flight", "small"],
    user: "worker@acme.io",
    spans: [
      {
        key: "root",
        parent: null,
        type: "AGENT",
        name: "batch.embed",
        start: 0,
        end: null,
      },
      {
        key: "manifest",
        parent: "root",
        type: "SPAN",
        name: "load-manifest",
        start: 20,
        end: 340,
      },
      {
        key: "c1",
        parent: "root",
        type: "EMBEDDING",
        name: "embed-chunk-1",
        start: 360,
        end: 980,
        model: "text-embedding-4",
        usage: [8100, 0],
      },
      {
        key: "c2",
        parent: "root",
        type: "EMBEDDING",
        name: "embed-chunk-2",
        start: 1000,
        end: 1640,
        model: "text-embedding-4",
        usage: [7900, 0],
      },
      {
        key: "c3",
        parent: "root",
        type: "EMBEDDING",
        name: "embed-chunk-3",
        start: 1660,
        end: null,
      },
      {
        key: "upsert",
        parent: "root",
        type: "TOOL",
        name: "upsert-vectors",
        start: 1680,
        end: null,
      },
    ],
  },
  {
    slug: "checkpoint-marks",
    name: "pipeline.run",
    about:
      "Ten zero-duration checkpoints among three phases: instants have to stay visible without pretending to have width.",
    tags: ["shape:instants", "small"],
    user: "pipeline@acme.io",
    spans: [
      {
        key: "root",
        parent: null,
        type: "SPAN",
        name: "pipeline.run",
        start: 0,
        end: 4180,
      },
      {
        key: "ingest",
        parent: "root",
        type: "SPAN",
        name: "ingest",
        start: 40,
        end: 1380,
      },
      {
        key: "transform",
        parent: "root",
        type: "CHAIN",
        name: "transform",
        start: 1400,
        end: 3020,
      },
      {
        key: "load",
        parent: "root",
        type: "SPAN",
        name: "load",
        start: 3040,
        end: 4140,
      },
      ...[120, 460, 780, 1150, 1520, 1980, 2410, 2890, 3350, 3820].map(
        (at, index) => ({
          key: `mark-${index}`,
          parent:
            at < 1380 ? "ingest" : at < 3020 ? ("transform" as string) : "load",
          type: "EVENT" as ObservationType,
          name: `checkpoint-${index + 1}`,
          start: at,
          end: at,
        }),
      ),
    ],
  },
  {
    slug: "deep-ladder",
    name: "chain.refine",
    about:
      "Ten levels of nesting in ten spans: the staircase, small enough to read every step.",
    tags: ["shape:deep", "small"],
    user: "frank@acme.io",
    spans: Array.from({ length: 10 }, (_, level) => ({
      key: `level-${level}`,
      parent: level === 0 ? null : `level-${level - 1}`,
      type: (level % 3 === 2 ? "GENERATION" : "SPAN") as ObservationType,
      name: level === 0 ? "chain.refine" : `refine-step-${level}`,
      start: level * 420,
      end: 5600 - level * 90,
      ...(level % 3 === 2
        ? {
            model: "gpt-5.4-mini" as const,
            usage: [600 + level * 40, 120] as [number, number],
            ttft: 180,
          }
        : {}),
    })),
  },
  {
    slug: "flat-siblings",
    name: "queue.drain",
    about:
      "One root and 24 siblings back to back, no nesting at all: the flat list, where a timeline is just a ruler.",
    tags: ["shape:flat", "small"],
    user: "queue@acme.io",
    spans: [
      {
        key: "root",
        parent: null,
        type: "SPAN",
        name: "queue.drain",
        start: 0,
        end: 9000,
      },
      ...siblings(24, 40, 330, 40, (index) => ({
        key: `job-${index}`,
        type: (index % 4 === 3 ? "GENERATION" : "TOOL") as ObservationType,
        name: index % 4 === 3 ? "classify-job" : `handle-job-${index}`,
        ...(index % 4 === 3
          ? {
              model: "gpt-5.4-mini" as const,
              usage: [180, 40] as [number, number],
              ttft: 90,
            }
          : {}),
      })),
    ],
  },
  {
    slug: "mixed-loop",
    name: "agent.run",
    about:
      "A three-turn agent with think time between the turns: small, and shaped like a real loop rather than a hub.",
    tags: ["shape:agent-loop", "small"],
    user: "grace@acme.io",
    spans: [
      {
        key: "root",
        parent: null,
        type: "AGENT",
        name: "agent.run",
        start: 0,
        end: 23_800,
      },
      // turn 1
      {
        key: "plan-1",
        parent: "root",
        type: "AGENT",
        name: "plan",
        start: 40,
        end: 520,
      },
      {
        key: "search-1",
        parent: "root",
        type: "RETRIEVER",
        name: "search",
        start: 560,
        end: 900,
      },
      {
        key: "embed-1",
        parent: "search-1",
        type: "EMBEDDING",
        name: "embed-query",
        start: 570,
        end: 640,
        model: "text-embedding-4",
        usage: [14, 0],
      },
      {
        key: "vs-1",
        parent: "search-1",
        type: "TOOL",
        name: "vector-search",
        start: 650,
        end: 890,
      },
      {
        key: "gen-1",
        parent: "root",
        type: "GENERATION",
        name: "generate",
        start: 950,
        end: 4200,
        model: "gpt-5.4",
        usage: [2100, 380],
        ttft: 520,
      },
      {
        key: "critic-1",
        parent: "root",
        type: "EVALUATOR",
        name: "critic",
        start: 4240,
        end: 4900,
        output: { verdict: "revise", score: 0.61 },
      },
      // 2.5s of thinking, then turn 2
      {
        key: "plan-2",
        parent: "root",
        type: "AGENT",
        name: "plan",
        start: 7400,
        end: 7880,
      },
      {
        key: "gen-2",
        parent: "root",
        type: "GENERATION",
        name: "generate",
        start: 7920,
        end: 11_400,
        model: "gpt-5.4",
        usage: [2600, 440],
        ttft: 480,
      },
      {
        key: "critic-2",
        parent: "root",
        type: "EVALUATOR",
        name: "critic",
        start: 11_440,
        end: 12_100,
        output: { verdict: "revise", score: 0.78 },
      },
      // 4s gap, then the final turn
      {
        key: "gen-3",
        parent: "root",
        type: "GENERATION",
        name: "generate",
        start: 16_200,
        end: 23_300,
        model: "gpt-5.4",
        usage: [3100, 900],
        ttft: 610,
      },
      {
        key: "critic-3",
        parent: "root",
        type: "EVALUATOR",
        name: "critic",
        start: 23_340,
        end: 23_400,
        output: { verdict: "accept", score: 0.93 },
      },
      {
        key: "send",
        parent: "root",
        type: "SPAN",
        name: "send-answer",
        start: 23_430,
        end: 23_760,
      },
    ],
  },
];

const durationOf = (shape: Shape) =>
  Math.max(...shape.spans.map((s) => s.end ?? s.start));

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

  const traceTimestamp = utcDayStartMs();
  const traceIdOf = (shape: Shape) => `${ctx.idPrefix}-${shape.slug}`;

  if (ctx.dryRun) {
    return {
      scenario: "timeline-shapes",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: shapes.map(traceIdOf),
      sessionIds: [],
      counts: {
        traces: shapes.length,
        observations: shapes.reduce((n, s) => n + s.spans.length, 0),
        events: withV4 ? shapes.reduce((n, s) => n + s.spans.length + 1, 0) : 0,
      },
      verified: {},
      links: shapes.map((s) => traceLink(ctx, traceIdOf(s), traceTimestamp)),
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];

  for (const shape of shapes) {
    const traceId = traceIdOf(shape);
    const root = shape.spans[0];
    const trace = createTrace({
      id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      name: shape.name,
      timestamp: traceTimestamp,
      user_id: shape.user,
      session_id: null,
      release: "2026.08.14-1",
      version: "shapes-v1",
      tags: ["seed", "timeline-shapes", ...shape.tags],
      public: false,
      bookmarked: false,
      metadata: {
        scenario: "timeline-shapes",
        shape: shape.slug,
        about: shape.about,
        spans: String(shape.spans.length),
        wall_clock_ms: String(durationOf(shape)),
      },
      input: root.input !== undefined ? JSON.stringify(root.input) : null,
      output: root.output !== undefined ? JSON.stringify(root.output) : null,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    });
    traces.push(trace);

    const idOf = new Map(
      shape.spans.map((s, i) => [s.key, `${traceId}-obs-${i}`]),
    );

    for (const span of shape.spans) {
      const prices = span.model ? MODEL_PRICES[span.model] : null;
      const [usageIn, usageOut] = span.usage ?? [0, 0];

      observations.push(
        createObservation({
          id: idOf.get(span.key)!,
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
            span.ttft !== undefined
              ? traceTimestamp + span.start + span.ttft
              : null,
          level: span.level ?? "DEFAULT",
          status_message: span.status ?? null,
          version: null,
          input: span.input !== undefined ? JSON.stringify(span.input) : null,
          output:
            span.output !== undefined ? JSON.stringify(span.output) : null,
          metadata: { scenario: "timeline-shapes", shape: shape.slug },
          provided_model_name: span.model ?? null,
          internal_model_id: null,
          model_parameters: "{}",
          // Explicitly empty for non-generations: the factory would otherwise
          // fill in non-empty usage and cost defaults.
          ...(prices
            ? generationUsageCost(usageIn, usageOut, prices)
            : {
                provided_usage_details: {},
                usage_details: {},
                provided_cost_details: {},
                cost_details: {},
                total_cost: null,
              }),
          prompt_id: null,
          prompt_name: null,
          prompt_version: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          event_ts: Date.now(),
        }),
      );
    }
  }

  const events = withV4
    ? [
        ...traces.map((t) => traceToEvent(t)),
        ...observations.map((o) => {
          const trace = traces.find((t) => t.id === o.trace_id)!;
          return observationToEvent(o, trace);
        }),
      ]
    : [];

  ctx.log(
    `writing ${traces.length} shapes, ${observations.length} observations${
      withV4 ? `, ${events.length} events` : ""
    }`,
  );
  await createTracesCh(traces);
  for (const batch of chunk(observations, 1000)) {
    await createObservationsCh(batch);
  }
  for (const batch of chunk(events, 500)) {
    await createEventsCh(batch);
  }

  const ids = traces.map((t) => t.id);
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND id IN {ids: Array(String)}`,
      { projectId: ctx.projectId, ids },
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      `project_id = {projectId: String} AND trace_id IN {ids: Array(String)}`,
      { projectId: ctx.projectId, ids },
      "uniqExact(id)",
    ),
  };
  if (withV4) {
    // events_full has no `id` column — count rows.
    verified.events = await countRows(
      "events_full",
      `project_id = {projectId: String} AND trace_id IN {ids: Array(String)}`,
      { projectId: ctx.projectId, ids },
    );
  }

  if (verified.traces < traces.length) {
    throw new SeedError(
      `Readback mismatch: expected ${traces.length} traces, found ${verified.traces}`,
    );
  }
  if (verified.observations < observations.length) {
    throw new SeedError(
      `Readback mismatch: expected ${observations.length} observations, found ${verified.observations}`,
    );
  }
  if (withV4 && verified.events < events.length) {
    throw new SeedError(
      `Readback mismatch: expected ${events.length} events_full rows, found ${verified.events}`,
    );
  }

  return {
    scenario: "timeline-shapes",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: ids,
    sessionIds: [],
    counts: {
      traces: traces.length,
      observations: observations.length,
      events: events.length,
    },
    verified,
    links: shapes.map((s) => traceLink(ctx, traceIdOf(s), traceTimestamp)),
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const timelineShapesScenario: ScenarioDefinition = {
  name: "timeline-shapes",
  description:
    "A dozen SMALL traces (4-25 observations each), one per timeline morphology: rag answer, streamed chat, parallel fan-out, retry backoff with widening gaps, a 13-minute wait on a human, one slow tool dwarfing everything, an error cascade with failover, in-flight spans with no end time, zero-duration checkpoints, a ten-level ladder, 24 flat siblings, and a three-turn agent loop with think time. Hand-timed with plausible latencies rather than generated, because what differs between real traces is their TIME, and that does not come out of scaling one shape up.",
  supportsV4: true,
  flags: [
    {
      flag: "shape",
      type: "string",
      default: "all",
      description: `one shape or all: all, ${SHAPES.map((s) => s.slug).join(", ")}`,
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
