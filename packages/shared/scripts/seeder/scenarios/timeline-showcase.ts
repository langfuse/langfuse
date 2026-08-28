import {
  createTrace,
  createObservation,
  createTraceScore,
  createTracesCh,
  createObservationsCh,
  createScoresCh,
  createEventsCh,
  ObservationRecordInsertType,
} from "../../../src/server";
import { ObservationType } from "../../../src/domain";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { buildPayload, generationUsageCost } from "./payload";
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
 * ONE trace built to be filmed: every shape the timeline can draw, in a single
 * run, at a size where "fit the whole thing on screen" is a real claim rather
 * than a small-trace coincidence.
 *
 * timeline-shapes covers the same morphologies as a dozen SMALL traces, which is
 * the right tool for reading one shape at a time. This is the opposite need: a
 * demo where zooming out shows a recognizable landscape and zooming in lands on
 * a named span, so the trace has to be wide (hundreds of siblings), deep (a
 * long ladder), long (tens of minutes, mostly idle), and varied (every
 * observation type, streaming marks, costs, errors, instants, in-flight work)
 * all at once.
 *
 * Hand-timed, like the shapes: latencies are plausible per type (embeddings in
 * tens of ms, searches in hundreds, LLM calls in seconds, queue waits in
 * minutes), and the only randomness in a start time is stateless `jitter`, so
 * re-runs overwrite instead of duplicating.
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

/** Search queries, so the fan-out reads as work rather than as `item-0142`. */
const SOURCES = [
  "arxiv.org",
  "docs.langfuse.com",
  "news.ycombinator.com",
  "openreview.net",
  "github.com",
  "huggingface.co",
  "semanticscholar.org",
  "reddit.com/r/LocalLLaMA",
];
const TOPICS = [
  "kv-cache quantization",
  "speculative decoding throughput",
  "agent eval harnesses",
  "long-context retrieval",
  "router distillation",
  "structured output reliability",
  "trace sampling strategies",
  "prompt caching economics",
];

/**
 * The whole run, phase by phase. Returns the spans plus the wall clock, so the
 * summary can state what was built without re-deriving it.
 */
const planRun = (seed: number, scale: number) => {
  const spans: Span[] = [];
  const add = (span: Span) => spans.push(span);

  // Per ROUND, not per trace: the first cut put all 320 searches in one block,
  // and 92% of the rows became a single diagonal with every other shape
  // squeezed into the last 8% of the height. Repeating a smaller round three
  // times gives the same row count a landscape instead of one feature.
  const ROUNDS = 3;
  const searchesPerRound = Math.max(8, Math.round(85 * scale));
  const embeddingsPerRound = Math.max(8, Math.round(65 * scale));

  // Root is unshifted last (it needs the final end time) but referenced here.
  const ROOT = "root";
  let cursor = 0;

  // Intake — a short, legible opening, so the first thing on screen is not a
  // wall of bars.
  add({
    key: "intake",
    parent: ROOT,
    type: "SPAN",
    name: "intake",
    start: 300,
    end: 3_100,
  });
  add({
    key: "parse",
    parent: "intake",
    type: "TOOL",
    name: "parse-request",
    start: 360,
    end: 900,
  });
  add({
    key: "classify",
    parent: "intake",
    type: "GENERATION",
    name: "classify-intent",
    start: 950,
    end: 3_040,
    model: "gpt-5.4-mini",
    usage: [420, 90],
    ttft: 380,
  });
  cursor = 3_100;

  // A provider rate limit: the first hole. Gaps are here to be seen, but they
  // must not BE the trace — work is ~80% of this wall clock, because a fit view
  // whose every bar is sub-pixel is just a vertical line.
  cursor += 25_000;

  // Plan — one long streaming generation whose first-token mark sits early in a
  // wide bar, which is that mark at its most visible.
  const planStart = cursor + 40;
  add({
    key: "plan",
    parent: ROOT,
    type: "AGENT",
    name: "plan",
    start: planStart,
    end: planStart + 12_000,
  });
  add({
    key: "plan-llm",
    parent: "plan",
    type: "GENERATION",
    name: "draft-research-plan",
    start: planStart + 80,
    end: planStart + 11_900,
    model: "gpt-5.4",
    usage: [1_800, 2_400],
    ttft: 640,
  });
  cursor = planStart + 12_000;

  const LADDER = [
    "open-document",
    "detect-encoding",
    "split-sections",
    "resolve-references",
    "extract-claims",
    "align-citation",
    "score-relevance",
    "merge-into-notes",
  ];

  for (let round = 0; round < ROUNDS; round++) {
    const roundStart = cursor + 200;
    const R = `round${round}`;
    // The round wrapper is added first so children can point at it, and its end
    // is patched once the round's own cursor lands.
    const wrapper: Span = {
      key: R,
      parent: ROOT,
      type: "AGENT",
      name: `research pass ${round + 1}`,
      start: roundStart,
      end: roundStart,
    };
    spans.push(wrapper);

    // 1. Search fan-out — eight workers pulling from a queue. The stagger is
    //    the worker slot, the duration is the site's mood, and the result is a
    //    waterfall with real width rather than one stripe.
    const fanStart = roundStart + 200;
    // Seconds. Wide enough that the waterfall fills most of its round: at a
    // third of the round the fan-out was a steep cascade with the ladder and
    // the generations trailing it as three lonely hairlines.
    const fanSpan = 18 + round * 9;
    add({
      key: `${R}-fanout`,
      parent: R,
      type: "SPAN",
      name: `web-search (${searchesPerRound} queries)`,
      start: fanStart,
      end: fanStart + fanSpan * 1_000 + 2_000,
    });
    for (let i = 0; i < searchesPerRound; i++) {
      const slot = i % 8;
      const wave = Math.floor(i / 8);
      // Integers only: ClickHouse rejects a fractional ms outright, and this
      // step is a division.
      const waveStep = Math.round(
        (fanSpan * 1_000) / Math.max(1, searchesPerRound / 8),
      );
      const start =
        fanStart +
        200 +
        slot * 90 +
        wave * waveStep +
        jitter(seed, round * 997 + i, 600);
      const duration = 600 + jitter(seed, round * 997 + i + 5_000, 1_500);
      const flaky = i % 29 === 7;
      add({
        key: `${R}-search-${i}`,
        parent: `${R}-fanout`,
        type: "TOOL",
        name: `search ${SOURCES[slot]}: ${TOPICS[(i + slot + round) % TOPICS.length]}`,
        start,
        end: start + duration,
        level: flaky ? "WARNING" : "DEFAULT",
        status: flaky ? "429 from upstream, retried once" : undefined,
      });
    }
    let roundCursor = fanStart + fanSpan * 1_000 + 2_400;

    // 2. Ingest — a dense queue of tiny bars. Zoomed out these sit on the
    //    one-pixel floor, which is the case the layout exists for.
    const ingestStart = roundCursor + 200;
    const embedStep = 190;
    add({
      key: `${R}-ingest`,
      parent: R,
      type: "CHAIN",
      name: "ingest",
      start: ingestStart,
      end: ingestStart + embeddingsPerRound * embedStep + 2_400,
    });
    for (let i = 0; i < embeddingsPerRound; i++) {
      const start =
        ingestStart + 200 + i * embedStep + jitter(seed, round * 31 + i, 80);
      add({
        key: `${R}-embed-${i}`,
        parent: `${R}-ingest`,
        type: "EMBEDDING",
        name: `embed-chunk-${round}-${String(i).padStart(3, "0")}`,
        start,
        end: start + 60 + jitter(seed, round * 37 + i + 11_000, 90),
        model: "text-embedding-4",
        usage: [520 + jitter(seed, round * 41 + i, 900), 0],
      });
    }
    const rerankStart = ingestStart + 400 + embeddingsPerRound * embedStep;
    add({
      key: `${R}-rerank`,
      parent: `${R}-ingest`,
      type: "RETRIEVER",
      name: "rerank-top-200",
      start: rerankStart,
      end: rerankStart + 1_500,
    });
    roundCursor = rerankStart + 1_700;

    // 3. Read — a nested ladder, so the tree gutter has something to draw and
    //    the visual-depth cap has something to cap.
    let ladderParent = R;
    let ladderStart = roundCursor + 200;
    const ladderOuter = 22_000 + round * 6_000;
    LADDER.forEach((name, depth) => {
      const key = `${R}-read-${depth}`;
      add({
        key,
        parent: ladderParent,
        type: depth % 4 === 3 ? "TOOL" : "SPAN",
        name,
        start: ladderStart,
        end: ladderStart + ladderOuter - depth * Math.round(ladderOuter / 10),
      });
      ladderParent = key;
      ladderStart += 400;
    });
    roundCursor = roundCursor + 200 + ladderOuter + 400;

    // 4. One generation per round, each a different order of magnitude of cost,
    //    so the cost column has values worth reading.
    const genStart = roundCursor + 200;
    const genDuration = 6_000 + round * 3_500;
    add({
      key: `${R}-write`,
      parent: R,
      type: "GENERATION",
      name: `summarize pass ${round + 1}`,
      start: genStart,
      end: genStart + genDuration,
      model: round === 0 ? "gpt-5.4-mini" : "gpt-5.4",
      usage: [900 + round * 2_600, 300 + round * 1_900],
      ttft: 420 + jitter(seed, round + 17_000, 500),
    });
    roundCursor = genStart + genDuration + 200;

    // 5. A flaky tool with widening gaps, ending in a success: three ERROR bars
    //    and a DEFAULT one, the failure shape at its most readable.
    let attemptStart = roundCursor + 200;
    for (let attempt = 0; attempt < 3; attempt++) {
      const failed = attempt < 2;
      add({
        key: `${R}-fetch-${attempt}`,
        parent: R,
        type: "TOOL",
        name: `fetch-source (attempt ${attempt + 1})`,
        start: attemptStart,
        end: attemptStart + (failed ? 900 : 2_400),
        level: failed ? "ERROR" : "DEFAULT",
        status: failed ? "503 Service Unavailable" : undefined,
      });
      attemptStart += (failed ? 900 : 2_400) + 1_500 * Math.pow(2, attempt);
    }
    roundCursor = attemptStart + 200;

    // 6. Two zero-duration checkpoints: instants have no width to label and
    //    still have to be visible and hoverable.
    ["notes.persisted", "budget.checked"].forEach((name, i) => {
      const at = roundCursor + 300 + i * 900;
      add({
        key: `${R}-event-${i}`,
        parent: R,
        type: "EVENT",
        name,
        start: at,
        end: at,
      });
    });
    roundCursor += 300 + 2 * 900;

    wrapper.end = roundCursor;
    // Between rounds: a human review queue, longer each time, so the compressed
    // view has holes of visibly different size.
    cursor = roundCursor + (round === ROUNDS - 1 ? 0 : 18_000 + round * 16_000);
  }

  // Synthesize — three long generations in sequence with real cost.
  const synthStart = cursor + 400;
  add({
    key: "synth",
    parent: ROOT,
    type: "AGENT",
    name: "synthesize",
    start: synthStart,
    end: synthStart + 41_000,
  });
  const SECTIONS: [string, number, number, number][] = [
    ["write-section: state of the art", 12_400, 3_200, 5_800],
    ["write-section: cost model", 13_600, 2_900, 6_400],
    ["write-section: recommendation", 14_200, 4_100, 7_300],
  ];
  let sectionStart = synthStart + 120;
  SECTIONS.forEach(([name, duration, tokensIn, tokensOut], i) => {
    add({
      key: `section-${i}`,
      parent: "synth",
      type: "GENERATION",
      name,
      start: sectionStart,
      end: sectionStart + duration,
      model: "gpt-5.4",
      usage: [tokensIn, tokensOut],
      ttft: 720 + jitter(seed, i + 19_000, 400),
    });
    sectionStart += duration + 240;
  });
  cursor = synthStart + 41_200;

  // Critique loop — five turns with exponential backoff between them: the
  // staircase people recognise as "it kept retrying".
  let loopStart = cursor + 200;
  for (let turn = 0; turn < 5; turn++) {
    add({
      key: `critic-${turn}`,
      parent: ROOT,
      type: "EVALUATOR",
      name: `critique (pass ${turn + 1})`,
      start: loopStart,
      end: loopStart + 2_600,
    });
    add({
      key: `revise-${turn}`,
      parent: `critic-${turn}`,
      type: "GENERATION",
      name: "revise-draft",
      start: loopStart + 120,
      end: loopStart + 2_500,
      model: "gpt-5.4-mini",
      usage: [2_100, 640],
      ttft: 300,
    });
    loopStart += 2_800 + 2_000 * Math.pow(2, turn);
  }
  cursor = loopStart;

  // A guardrail that fired, and work that has not finished: two spans with no
  // end time at all, so the in-flight case is on camera.
  add({
    key: "guard",
    parent: ROOT,
    type: "GUARDRAIL",
    name: "guardrail.output",
    start: cursor + 200,
    end: cursor + 1_600,
    level: "WARNING",
    status: "2 pii redactions",
  });
  add({
    key: "publish",
    parent: ROOT,
    type: "TOOL",
    name: "publish-report",
    start: cursor + 1_800,
    end: cursor + 4_200,
  });
  add({
    key: "followup",
    parent: ROOT,
    type: "SPAN",
    name: "schedule-followup",
    start: cursor + 4_400,
    end: null,
  });
  add({
    key: "index",
    parent: "followup",
    type: "TOOL",
    name: "index-for-search",
    start: cursor + 4_600,
    end: null,
  });
  cursor += 5_000;

  const wallClockMs = cursor + 900;

  spans.unshift({
    key: ROOT,
    parent: null,
    type: "AGENT",
    name: "research.deep-dive",
    start: 0,
    end: wallClockMs,
    input: {
      question:
        "What is the state of the art in serving long-context agents cheaply, and what should we do next quarter?",
    },
    output: {
      report: "24 sources, 3 sections, 1 recommendation",
      confidence: 0.78,
    },
  });

  return {
    spans,
    wallClockMs,
    rounds: ROUNDS,
    searches: searchesPerRound * ROUNDS,
    embeddings: embeddingsPerRound * ROUNDS,
  };
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const scale = params["scale"] as number;
  const withV4 = params["v4"] as boolean;

  if (scale <= 0 || scale > 12) {
    throw new SeedError(
      `--scale must be between 0 and 12, got ${scale}`,
      "scale multiplies the two fan-outs; 1 is ~600 observations, 12 is ~7000",
    );
  }

  const rng = new Rng(ctx.seed);
  const traceId = `${ctx.idPrefix}-trace`;
  const traceTimestamp = utcDayStartMs();
  const { spans, wallClockMs, rounds, searches, embeddings } = planRun(
    ctx.seed,
    scale,
  );

  if (ctx.dryRun) {
    return {
      scenario: "timeline-showcase",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [traceId],
      sessionIds: [],
      counts: {
        traces: 1,
        observations: spans.length,
        scores: 3,
        events: withV4 ? spans.length + 1 : 0,
      },
      verified: {},
      links: [traceLink(ctx, traceId, traceTimestamp)],
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const root = spans[0]!;
  const trace = createTrace({
    id: traceId,
    project_id: ctx.projectId,
    environment: ctx.environment,
    name: root.name,
    timestamp: traceTimestamp,
    user_id: "sam@acme.io",
    session_id: null,
    release: "2026.08.28-1",
    version: "showcase-v1",
    tags: ["seed", "timeline-showcase", "demo"],
    public: false,
    bookmarked: true,
    metadata: {
      scenario: "timeline-showcase",
      observations: String(spans.length),
      wall_clock_ms: String(wallClockMs),
      rounds: String(rounds),
      searches: String(searches),
      embeddings: String(embeddings),
    },
    input: JSON.stringify(root.input),
    output: JSON.stringify(root.output),
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
  });

  const idOf = new Map(
    spans.map((s, i) => [s.key, `${ctx.idPrefix}-obs-${i}`]),
  );

  const observations: ObservationRecordInsertType[] = spans.map((span) => {
    const prices = span.model ? MODEL_PRICES[span.model] : null;
    const [usageIn, usageOut] = span.usage ?? [0, 0];
    const isGeneration = span.type === "GENERATION";

    return createObservation({
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
      input: isGeneration
        ? JSON.stringify({
            messages: [
              {
                role: "system",
                content: "You are a research agent. Cite every claim.",
              },
              {
                role: "user",
                content: buildPayload("text", rng.int(300, 900), rng),
              },
            ],
          })
        : span.input !== undefined
          ? JSON.stringify(span.input)
          : null,
      output: isGeneration
        ? buildPayload("text", rng.int(200, 800), rng)
        : span.output !== undefined
          ? JSON.stringify(span.output)
          : null,
      metadata: {
        scenario: "timeline-showcase",
        phase: span.key.split("-")[0]!,
      },
      provided_model_name: span.model ?? null,
      internal_model_id: null,
      model_parameters: isGeneration
        ? JSON.stringify({ temperature: 0.3, max_tokens: 4096 })
        : "{}",
      // Explicitly empty for non-generations: the factory would otherwise fill
      // in non-empty usage and cost defaults.
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
    });
  });

  // Trace-level scores, so the detail page around the timeline looks like a
  // real run rather than an empty frame.
  const scores = [
    {
      name: "faithfulness",
      value: 0.86,
      comment: "Every claim has a citation.",
    },
    { name: "helpfulness", value: 0.74, comment: null },
    {
      name: "cost-per-answer",
      value: 0.41,
      comment: "Above target, see gaps.",
    },
  ].map((score, i) =>
    createTraceScore({
      id: `${ctx.idPrefix}-score-${i}`,
      project_id: ctx.projectId,
      environment: ctx.environment,
      trace_id: traceId,
      observation_id: null,
      name: score.name,
      value: score.value,
      data_type: "NUMERIC",
      source: "EVAL",
      comment: score.comment,
      metadata: {},
      timestamp: traceTimestamp + wallClockMs,
    }),
  );

  const events = withV4
    ? [
        traceToEvent(trace),
        ...observations.map((o) => observationToEvent(o, trace)),
      ]
    : [];

  ctx.log(
    `writing 1 trace, ${observations.length} observations ` +
      `(${searches} searches, ${embeddings} embeddings), ` +
      `${Math.round(wallClockMs / 60_000)} min wall clock` +
      (withV4 ? `, ${events.length} events` : ""),
  );
  await createTracesCh([trace]);
  for (const batch of chunk(observations, 1000)) {
    await createObservationsCh(batch);
  }
  await createScoresCh(scores);
  for (const batch of chunk(events, 500)) {
    await createEventsCh(batch);
  }

  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND id = {traceId: String}`,
      { projectId: ctx.projectId, traceId },
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      `project_id = {projectId: String} AND trace_id = {traceId: String}`,
      { projectId: ctx.projectId, traceId },
      "uniqExact(id)",
    ),
    // The shapes this scenario exists to seed, verified as shapes rather than
    // as a row count: a demo that quietly lost its streaming marks or its
    // unfinished work would still count right.
    firstTokenMarks: await countRows(
      "observations",
      `project_id = {projectId: String} AND trace_id = {traceId: String} AND completion_start_time IS NOT NULL`,
      { projectId: ctx.projectId, traceId },
      "uniqExact(id)",
    ),
    inFlight: await countRows(
      "observations",
      `project_id = {projectId: String} AND trace_id = {traceId: String} AND end_time IS NULL`,
      { projectId: ctx.projectId, traceId },
      "uniqExact(id)",
    ),
    observationTypes: await countRows(
      "observations",
      `project_id = {projectId: String} AND trace_id = {traceId: String}`,
      { projectId: ctx.projectId, traceId },
      "uniqExact(type)",
    ),
  };
  if (withV4) {
    verified.events = await countRows(
      "events_full",
      `project_id = {projectId: String} AND trace_id = {traceId: String}`,
      { projectId: ctx.projectId, traceId },
      "uniqExact(span_id)",
    );
  }

  if (verified.traces < 1) {
    throw new SeedError(
      `Readback mismatch: trace ${traceId} not found after insert`,
    );
  }
  if (verified.observations < observations.length) {
    throw new SeedError(
      `Readback mismatch: expected ${observations.length} observations, found ${verified.observations}`,
    );
  }
  if (verified.inFlight < 2) {
    throw new SeedError(
      `Readback mismatch: expected 2 in-flight observations, found ${verified.inFlight}`,
    );
  }
  if (verified.observationTypes < 9) {
    throw new SeedError(
      `Readback mismatch: expected 9+ distinct observation types, found ${verified.observationTypes}`,
    );
  }
  if (withV4 && verified.events < events.length) {
    throw new SeedError(
      `Readback mismatch: expected ${events.length} events_full rows, found ${verified.events}`,
    );
  }

  return {
    scenario: "timeline-showcase",
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
      events: events.length,
    },
    verified,
    links: [traceLink(ctx, traceId, traceTimestamp)],
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const timelineShowcaseScenario: ScenarioDefinition = {
  name: "timeline-showcase",
  description:
    "ONE big trace with every timeline shape at once, sized for demos and screen recordings: a ~40-minute research run that is mostly idle, ~600 observations, a few hundred parallel searches, a dense embedding queue, a sixteen-level ladder, streaming first-token marks, three magnitudes of cost, a retry staircase, error attempts, zero-duration checkpoints, in-flight work with no end time, and nine observation types. Zoomed out it is a landscape; zoomed in it is named spans.",
  supportsV4: true,
  flags: [
    {
      flag: "scale",
      type: "number",
      default: 1,
      description:
        "multiplies the two fan-outs (searches and embeddings): 1 is ~600 observations, 4 is ~2400, 12 is ~7000",
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
