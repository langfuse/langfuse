import {
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
  createEventsCh,
  ObservationRecordInsertType,
} from "../../../src/server";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { jitter, utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, traceLink } from "./verify";

/**
 * A single trace whose observations form ONE parent chain: every observation
 * is the sole child of the previous one, so tree depth equals the observation
 * count. Timings are SEQUENTIAL — each "child" starts shortly after its
 * parent ends — the shape produced when an integration parents each LLM call
 * onto the previous call instead of a common root (reported in LFE-10959 with
 * ~1400 generations over ~2.8h). Every row therefore carries a subtree
 * duration (∑) far larger than its own latency, and cumulative cost/usage
 * badges. This shape collapses tree/timeline layouts at extreme depth.
 */

const CHAIN_NAME = "ChatGoogleGenerativeAI";
const WRAPPER_NAME = "KnowledgeSummaryQuery.invoke_chain";
// Wrapper-named nodes are interspersed every ~3 positions from index 28 on,
// mirroring the reported trace's name distribution (~1/3 of nodes).
const WRAPPER_START_INDEX = 28;
const WRAPPER_EVERY = 3;

// Duration model (ms), tuned to the reported trace: p50 ≈ 5.7s, p95 ≈ 11s,
// max ≈ 79s, inter-node gap p50 ≈ 0.8s. All jitter()-derived: start_time is
// an events_full ORDER BY key, so no rng-stream or wall-clock randomness.
const BASE_DURATION_MS = 3000;
const DURATION_JITTER_MS = 5600;
const TAIL_EXTRA_MS = 8000; // ~1 in 12 nodes get a slow-call tail
const GIANT_DURATIONS_MS: Record<number, number> = {
  137: 25_000,
  613: 45_000,
  1204: 73_000,
};
const BASE_GAP_MS = 100;
const GAP_JITTER_MS = 1400;

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const observationCount = params["observations"] as number;
  const withV4 = params["v4"] as boolean;

  if (observationCount < 2 || observationCount > 100_000) {
    throw new SeedError(
      `--observations must be between 2 and 100000, got ${observationCount}`,
      "the reported layout collapse needs extreme depth; try the default 1401",
    );
  }

  const traceId = `${ctx.idPrefix}-trace`;
  const traceTimestamp = utcDayStartMs();

  if (ctx.dryRun) {
    return {
      scenario: "deep-chain",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [traceId],
      sessionIds: [],
      counts: {
        traces: 1,
        observations: observationCount,
        scores: 0,
        events: withV4 ? observationCount + 1 : 0,
      },
      verified: {},
      links: [traceLink(ctx, traceId, traceTimestamp)],
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  // Sequential chain offsets: start[i] = end[i-1] + gap. Prefix sums over
  // jitter() values stay deterministic for a given (seed, observations).
  const durations = new Array<number>(observationCount);
  const startOffsets = new Array<number>(observationCount);
  let cursor = 0;
  for (let i = 0; i < observationCount; i++) {
    let duration =
      BASE_DURATION_MS + jitter(ctx.seed, i * 7 + 1, DURATION_JITTER_MS);
    if (jitter(ctx.seed, i * 7 + 2, 11) === 0) {
      duration += jitter(ctx.seed, i * 7 + 3, TAIL_EXTRA_MS);
    }
    duration += GIANT_DURATIONS_MS[i] ?? 0;
    durations[i] = duration;
    startOffsets[i] = cursor;
    cursor +=
      duration + BASE_GAP_MS + jitter(ctx.seed, i * 7 + 4, GAP_JITTER_MS);
  }

  const trace = createTrace({
    id: traceId,
    project_id: ctx.projectId,
    environment: ctx.environment,
    // The reported trace's title derives from its root generation's name.
    name: CHAIN_NAME,
    timestamp: traceTimestamp,
    user_id: null,
    session_id: `${ctx.idPrefix}-session:topic:deep-chain`,
    release: null,
    version: null,
    tags: [],
    public: false,
    bookmarked: false,
    metadata: {
      scenario: "deep-chain",
      seed: String(ctx.seed),
      "shape.depth": String(observationCount),
    },
    input: null,
    output: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
  });

  const observations: ObservationRecordInsertType[] = [];
  for (let i = 0; i < observationCount; i++) {
    const isWrapper =
      i >= WRAPPER_START_INDEX &&
      (i - WRAPPER_START_INDEX) % WRAPPER_EVERY === 0;

    // Usage model mirrors the reported rows: prompt ~2.2-3.1k (occasionally
    // tiny), completion ~90-350 with rare large outliers, plus reasoning
    // tokens. total = input + output + reasoning (Gemini-style accounting).
    const smallInput = jitter(ctx.seed, i * 11 + 5, 19) === 0;
    const usageInput = smallInput
      ? 300 + jitter(ctx.seed, i * 11 + 6, 120)
      : 2200 + jitter(ctx.seed, i * 11 + 6, 900);
    const bigOutput = jitter(ctx.seed, i * 11 + 7, 14) === 0;
    const usageOutput = bigOutput
      ? 800 + jitter(ctx.seed, i * 11 + 8, 3600)
      : 90 + jitter(ctx.seed, i * 11 + 8, 260);
    const usageReasoning = 500 + jitter(ctx.seed, i * 11 + 9, 400);
    const usageTotal = usageInput + usageOutput + usageReasoning;
    const usageDetails = {
      input: usageInput,
      output: usageOutput,
      total: usageTotal,
      input_cache_read: 0,
      output_reasoning: usageReasoning,
    };
    // Flash-tier pricing: $0.5/M prompt, $3/M completion + reasoning.
    const costInput = usageInput * 0.5e-6;
    const costOutput = usageOutput * 3e-6;
    const costReasoning = usageReasoning * 3e-6;
    const costDetails = {
      input: costInput,
      output: costOutput,
      output_reasoning: costReasoning,
      total: costInput + costOutput + costReasoning,
    };

    observations.push(
      createObservation({
        id: `${ctx.idPrefix}-obs-${i}`,
        trace_id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type: "GENERATION",
        parent_observation_id: i === 0 ? null : `${ctx.idPrefix}-obs-${i - 1}`,
        name: isWrapper ? WRAPPER_NAME : CHAIN_NAME,
        start_time: traceTimestamp + startOffsets[i],
        end_time: traceTimestamp + startOffsets[i] + durations[i],
        completion_start_time: null,
        level: "DEFAULT",
        status_message: null,
        version: null,
        input: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "Describe the attached image for a knowledge base, and judge whether it's worth indexing.",
            },
            {
              role: "user",
              content: `The image file is named 'document_page_${i}_image_1.jpg'. Text of the page this image was cropped from: technical documentation page ${i}.`,
            },
          ],
        }),
        output: JSON.stringify({
          should_index: jitter(ctx.seed, i * 11 + 10, 1) === 0,
          description: `Technical diagram ${i}: layout of the described component with callouts.`,
        }),
        metadata: {},
        provided_model_name: "gemini-flash-preview",
        internal_model_id: null,
        model_parameters: JSON.stringify({ temperature: 1 }),
        provided_usage_details: usageDetails,
        usage_details: usageDetails,
        provided_cost_details: costDetails,
        cost_details: costDetails,
        total_cost: costDetails.total,
        prompt_id: null,
        prompt_name: null,
        prompt_version: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      }),
    );
  }
  const events = withV4
    ? [
        traceToEvent(trace),
        ...observations.map((obs) => observationToEvent(obs, trace)),
      ]
    : [];

  const counts: Record<string, number> = {
    traces: 1,
    observations: observations.length,
    scores: 0,
    events: events.length,
  };

  ctx.log(
    `writing 1 trace, ${observations.length} chained observations${withV4 ? `, ${events.length} events` : ""} (total wall-clock ${(cursor / 60000).toFixed(1)} min)`,
  );
  await createTracesCh([trace]);
  for (const batch of chunk(observations, 1000)) {
    await createObservationsCh(batch);
  }
  for (const batch of chunk(events, 500)) {
    await createEventsCh(batch);
  }

  // uniqExact(id): count() would see pre-merge ReplacingMergeTree duplicates
  // after re-runs with the same id prefix.
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
  if (withV4 && verified.events < events.length) {
    throw new SeedError(
      `Readback mismatch: expected ${events.length} events_full rows, found ${verified.events}`,
    );
  }

  return {
    scenario: "deep-chain",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: [traceId],
    sessionIds: [],
    counts,
    verified,
    links: [traceLink(ctx, traceId, traceTimestamp)],
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const deepChainScenario: ScenarioDefinition = {
  name: "deep-chain",
  description:
    "One trace whose observations form a single deep parent chain of sequential generations (child starts after parent ends; depth = observation count) — the mis-parented-instrumentation shape that collapses tree/timeline layouts at extreme depth (LFE-10959).",
  supportsV4: true,
  flags: [
    {
      flag: "observations",
      type: "number",
      default: 1401,
      description:
        "chain length = tree depth (default mirrors the reported trace)",
    },
    {
      flag: "v4",
      type: "boolean",
      default: false,
      description: "also mirror the chain into v4 events_full/events_core",
    },
  ],
  run,
};
