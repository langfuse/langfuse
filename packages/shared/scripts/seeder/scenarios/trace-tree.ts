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
} from "../../../src/server";
import { ObservationType } from "../../../src/domain";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { buildPayload, PayloadStyle, PAYLOAD_STYLES } from "./payload";
import { jitter, Rng, utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, traceLink } from "./verify";

const ALL_KINDS: ObservationType[] = [
  "AGENT",
  "CHAIN",
  "RETRIEVER",
  "EMBEDDING",
  "TOOL",
  "GENERATION",
  "EVALUATOR",
  "GUARDRAIL",
  "SPAN",
  "EVENT",
];

const NAME_BY_KIND: Record<string, string[]> = {
  AGENT: ["router-agent", "support-agent", "planner-agent"],
  CHAIN: ["rag-chain", "summarize-chain"],
  RETRIEVER: ["docs-retriever", "kb-retriever"],
  EMBEDDING: ["query-embedding", "chunk-embedding"],
  TOOL: ["search-products", "fetch-invoice", "issue-refund", "http-request"],
  GENERATION: ["gpt-4o-completion", "claude-completion", "draft-answer"],
  EVALUATOR: ["relevance-evaluator", "toxicity-evaluator"],
  GUARDRAIL: ["pii-guardrail", "jailbreak-guardrail"],
  SPAN: ["preprocess", "postprocess", "parse-response"],
  EVENT: ["cache-hit", "rate-limit", "user-feedback"],
};

type TreeNode = {
  index: number;
  parentIndex: number | null;
  depth: number;
  kind: ObservationType;
};

/**
 * Deterministic tree shape: a backbone chain guarantees the requested depth,
 * one "hub" node gets `breadth` direct children (the many-children-under-one-
 * parent shape), and remaining nodes attach with a bias toward the hub.
 */
const buildTreeShape = (
  count: number,
  depth: number,
  breadth: number,
  kinds: ObservationType[],
  seed: number,
): TreeNode[] => {
  const nodes: TreeNode[] = [];
  // jitter() not rng for kinds: observation `type` is the 2nd v3 ORDER BY
  // column, and stream-position randomness would re-key rows when flags
  // that shift rng consumption change between same-prefix re-runs.
  const kindAt = (index: number): ObservationType =>
    index < kinds.length
      ? kinds[index]
      : jitter(seed, index * 5 + 3, 9) < 4
        ? "GENERATION"
        : kinds[jitter(seed, index * 5 + 4, kinds.length - 1)];

  for (let i = 0; i < count; i++) {
    if (i === 0) {
      nodes.push({ index: 0, parentIndex: null, depth: 0, kind: kinds[0] });
      continue;
    }
    let parentIndex: number;
    if (i < depth) {
      parentIndex = i - 1; // backbone chain → guaranteed depth
    } else if (i < depth + breadth) {
      parentIndex = Math.min(2, depth - 1); // hub fan-out
    } else {
      // jitter() not rng: parentIndex cascades into start_time (an
      // events_full ORDER BY key) via startOffsets, so stream-position
      // randomness would re-key rows across same-prefix re-runs.
      parentIndex =
        jitter(seed, i * 17 + 1, 4) < 1
          ? Math.min(2, depth - 1)
          : jitter(seed, i * 17 + 2, i - 1);
    }
    nodes.push({
      index: i,
      parentIndex,
      depth: nodes[parentIndex].depth + 1,
      kind: kindAt(i),
    });
  }
  return nodes;
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const observationCount = params["observations"] as number;
  const requestedDepth = params["depth"] as number;
  const breadth = params["breadth"] as number;
  // depth deeper than the observation count is geometrically impossible;
  // clamping it down is helpful, not a silent rewrite of intent (the
  // validator below enforces the >= 2 lower bound on the requested value)
  const depth = Math.min(requestedDepth, observationCount);
  const payloadBytes = params["payload-bytes"] as number;
  const payloadStyle = params["payload-style"] as PayloadStyle;
  const withV4 = params["v4"] as boolean;

  if (!PAYLOAD_STYLES.includes(payloadStyle)) {
    throw new SeedError(
      `Unknown --payload-style "${payloadStyle}"`,
      `pass one of: ${PAYLOAD_STYLES.join(", ")}`,
    );
  }
  if (requestedDepth < 2) {
    throw new SeedError(
      `--depth must be >= 2, got ${requestedDepth}`,
      "pass at least 2 (root plus one level), e.g. --depth 8",
    );
  }
  if (breadth < 1) {
    throw new SeedError(
      `--breadth must be >= 1, got ${breadth}`,
      "pass a positive integer, e.g. --breadth 30",
    );
  }
  if (observationCount < 1) {
    throw new SeedError(
      `--observations must be >= 1, got ${observationCount}`,
      "pass a positive integer, e.g. --observations 200",
    );
  }
  if (payloadBytes < 0 || payloadBytes > 50_000_000) {
    throw new SeedError(
      `--payload-bytes must be between 0 and 50000000 (50 MB), got ${payloadBytes}`,
      "larger payloads exceed V8 string limits during generation",
    );
  }

  const rng = new Rng(ctx.seed);
  const traceId = `${ctx.idPrefix}-trace`;
  const traceTimestamp = utcDayStartMs();

  if (ctx.dryRun) {
    // counts are derivable from the flags — skip payload/array generation
    return {
      scenario: "trace-tree",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [traceId],
      sessionIds: [],
      counts: {
        traces: 1,
        observations: observationCount,
        scores: 3 + (observationCount >= 7 ? 1 : 0),
        events: withV4 ? observationCount + 1 : 0,
      },
      verified: {},
      links: [traceLink(ctx, traceId, traceTimestamp)],
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const shape = buildTreeShape(
    observationCount,
    depth,
    breadth,
    ALL_KINDS,
    ctx.seed,
  );

  const rootInput = buildPayload(payloadStyle, payloadBytes, rng);
  const rootOutput = buildPayload(
    payloadStyle,
    Math.ceil(payloadBytes / 2),
    rng,
  );

  const trace = createTrace({
    id: traceId,
    project_id: ctx.projectId,
    environment: ctx.environment,
    name: `seed-trace-tree (${observationCount} obs)`,
    timestamp: traceTimestamp,
    user_id: `user-${ctx.idPrefix}`,
    session_id: null,
    release: "seed-1.0.0",
    version: "seed-v2",
    tags: ["seed", "trace-tree", payloadStyle],
    public: false,
    bookmarked: false,
    metadata: {
      scenario: "trace-tree",
      seed: String(ctx.seed),
      "shape.depth": String(depth),
      "shape.breadth": String(breadth),
    },
    input: rootInput,
    output: rootOutput,
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
  });

  // Timeline offsets, all jitter()-derived (never the sequential rng stream
  // or wall clock — start_time is an events_full ORDER BY key, and stream
  // randomness would re-key rows when unrelated flags change on re-run).
  // Top-down: a child starts shortly after its OWN PARENT starts, so the
  // waterfall shows no orphaned gaps. Bottom-up: a parent's end covers its
  // children. parentIndex < index makes both single passes safe.
  const startOffsets = new Array<number>(shape.length).fill(0);
  for (const node of shape) {
    startOffsets[node.index] =
      node.parentIndex === null
        ? 0
        : startOffsets[node.parentIndex] +
          10 +
          jitter(ctx.seed, node.index, 80);
  }
  const endOffsets = new Array<number>(shape.length).fill(0);
  for (let i = shape.length - 1; i >= 0; i--) {
    const node = shape[i];
    const ownDuration =
      node.kind === "GENERATION"
        ? 600 + jitter(ctx.seed, i * 3 + 1, 3400)
        : 5 + jitter(ctx.seed, i * 3 + 2, 395);
    // endOffsets[i] holds the max end of already-processed children here
    const end = Math.max(startOffsets[i] + ownDuration, endOffsets[i] + 5);
    endOffsets[i] = end;
    if (node.parentIndex !== null) {
      endOffsets[node.parentIndex] = Math.max(
        endOffsets[node.parentIndex],
        end,
      );
    }
  }

  let retryNodeUsed = false;
  const observations: ObservationRecordInsertType[] = shape.map((node) => {
    const isGeneration = node.kind === "GENERATION";
    const startTime = traceTimestamp + startOffsets[node.index];
    const missingEndTime = node.index > 0 && node.index % 19 === 0;
    const isError = node.index % 29 === 7;
    const isFailedToolRetryPair =
      !retryNodeUsed && node.kind === "TOOL" && node.index > depth;
    if (isFailedToolRetryPair) retryNodeUsed = true;

    const longName = node.index % 37 === 11;
    const baseName = rng.pick(NAME_BY_KIND[node.kind]);
    const name = longName
      ? `${baseName}-with-an-extremely-long-name-${"x".repeat(140)}`
      : isFailedToolRetryPair
        ? `${baseName}-retry`
        : baseName;

    const payloadForNode = (): string | null => {
      if (node.index === 0) return rootInput;
      if (node.index === Math.floor(observationCount / 2)) {
        return buildPayload("malformed", Math.min(payloadBytes, 20_000), rng);
      }
      if (isGeneration) {
        return JSON.stringify({
          messages: [
            { role: "system", content: "You are a helpful support agent." },
            {
              role: "user",
              content: buildPayload("text", rng.int(200, 1200), rng),
            },
          ],
        });
      }
      return rng.bool(0.4)
        ? buildPayload("json", rng.int(150, 2000), rng)
        : null;
    };

    const usageInput = rng.int(50, 3000);
    const usageOutput = rng.int(20, 1500);

    return createObservation({
      id: `${ctx.idPrefix}-obs-${node.index}`,
      trace_id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      type: node.kind,
      parent_observation_id:
        node.parentIndex === null
          ? null
          : `${ctx.idPrefix}-obs-${node.parentIndex}`,
      name,
      start_time: startTime,
      end_time: missingEndTime ? null : traceTimestamp + endOffsets[node.index],
      completion_start_time: isGeneration ? startTime + rng.int(80, 400) : null,
      level:
        isError || isFailedToolRetryPair
          ? "ERROR"
          : node.index % 13 === 5
            ? "WARNING"
            : "DEFAULT",
      status_message:
        isError || isFailedToolRetryPair
          ? node.kind === "TOOL"
            ? "Tool execution failed: upstream timeout after 30s"
            : "Execution failed: upstream timeout after 30s"
          : null,
      version: null,
      input: payloadForNode(),
      output:
        node.index === 0
          ? rootOutput
          : isGeneration
            ? buildPayload("text", rng.int(150, 900), rng)
            : null,
      metadata: {
        scenario: "trace-tree",
        "node.depth": String(node.depth),
        ...(isFailedToolRetryPair ? { "retry.count": "2" } : {}),
      },
      provided_model_name: isGeneration ? "gpt-4o" : null,
      internal_model_id: null,
      model_parameters: isGeneration
        ? JSON.stringify({ temperature: 0.2, max_tokens: 1024 })
        : "{}",
      provided_usage_details: isGeneration
        ? {
            input: usageInput,
            output: usageOutput,
            total: usageInput + usageOutput,
          }
        : {},
      usage_details: isGeneration
        ? {
            input: usageInput,
            output: usageOutput,
            total: usageInput + usageOutput,
          }
        : {},
      provided_cost_details: isGeneration
        ? { input: usageInput * 2e-6, output: usageOutput * 6e-6 }
        : {},
      cost_details: isGeneration
        ? {
            input: usageInput * 2e-6,
            output: usageOutput * 6e-6,
            total: usageInput * 2e-6 + usageOutput * 6e-6,
          }
        : {},
      total_cost: isGeneration ? usageInput * 2e-6 + usageOutput * 6e-6 : null,
      prompt_id: null,
      prompt_name: null,
      prompt_version: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    });
  });

  const evaluatorNode = observations.find((o) => o.type === "EVALUATOR");
  const scores: ScoreRecordInsertType[] = [
    createTraceScore({
      id: `${ctx.idPrefix}-score-quality`,
      project_id: ctx.projectId,
      trace_id: traceId,
      environment: ctx.environment,
      name: "quality",
      value: Math.round(rng.next() * 100) / 100,
      data_type: "NUMERIC",
      source: "API",
      comment: "seeded numeric score",
      timestamp: traceTimestamp,
    }),
    createTraceScore({
      id: `${ctx.idPrefix}-score-sentiment`,
      project_id: ctx.projectId,
      trace_id: traceId,
      environment: ctx.environment,
      name: "sentiment",
      value: 1,
      string_value: rng.pick(["positive", "neutral", "negative"]),
      data_type: "CATEGORICAL",
      source: "API",
      comment: null,
      timestamp: traceTimestamp,
    }),
    createTraceScore({
      id: `${ctx.idPrefix}-score-success`,
      project_id: ctx.projectId,
      trace_id: traceId,
      environment: ctx.environment,
      name: "success",
      value: rng.bool(0.7) ? 1 : 0,
      string_value: undefined,
      data_type: "BOOLEAN",
      source: "API",
      timestamp: traceTimestamp,
    }),
    ...(evaluatorNode
      ? [
          createTraceScore({
            id: `${ctx.idPrefix}-score-relevance`,
            project_id: ctx.projectId,
            trace_id: traceId,
            observation_id: evaluatorNode.id,
            environment: ctx.environment,
            name: "relevance",
            value: Math.round(rng.next() * 100) / 100,
            data_type: "NUMERIC",
            source: "EVAL",
            timestamp: traceTimestamp,
          }),
        ]
      : []),
  ];

  // BOOLEAN scores need a string_value mirroring the numeric value
  const successScore = scores.find((s) => s.name === "success");
  if (successScore) {
    successScore.string_value = successScore.value === 1 ? "True" : "False";
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
    scores: scores.length,
    events: events.length,
  };

  ctx.log(
    `writing 1 trace, ${observations.length} observations, ${scores.length} scores${withV4 ? `, ${events.length} events` : ""}`,
  );
  await createTracesCh([trace]);
  for (const batch of chunk(observations, 1000)) {
    await createObservationsCh(batch);
  }
  await createScoresCh(scores);
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
    observationKinds: await countRows(
      "observations",
      `project_id = {projectId: String} AND trace_id = {traceId: String}`,
      { projectId: ctx.projectId, traceId },
      "uniqExact(type)",
    ),
    scores: await countRows(
      "scores",
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
  const expectedKinds = Math.min(observations.length, ALL_KINDS.length);
  if (verified.observationKinds < expectedKinds) {
    throw new SeedError(
      `Readback mismatch: expected ${expectedKinds} distinct observation kinds, found ${verified.observationKinds}`,
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
    scenario: "trace-tree",
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

export const traceTreeScenario: ScenarioDefinition = {
  name: "trace-tree",
  description:
    "One trace with a large, branching observation tree: all observation kinds, guaranteed depth, a hub node with many children, errors/retries/missing end times, configurable payload size and style.",
  supportsV4: true,
  flags: [
    {
      flag: "observations",
      type: "number",
      default: 200,
      description: "total observations in the tree",
    },
    {
      flag: "depth",
      type: "number",
      default: 8,
      description: "guaranteed tree depth (backbone chain)",
    },
    {
      flag: "breadth",
      type: "number",
      default: 30,
      description: "children under the hub node",
    },
    {
      flag: "payload-bytes",
      type: "number",
      default: 25_000,
      description: "approx bytes for the root input payload (max 50 MB)",
    },
    {
      flag: "payload-style",
      type: "string",
      default: "json",
      description: "json | text | malformed | unicode",
    },
    {
      flag: "v4",
      type: "boolean",
      default: false,
      description: "also mirror the tree into v4 events_full/events_core",
    },
  ],
  run,
};
