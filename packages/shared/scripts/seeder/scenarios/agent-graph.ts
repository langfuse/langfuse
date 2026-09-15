import {
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
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
 * One trace that is large as a GRAPH rather than as a tree: many distinct
 * `langgraph_node` names, and many distinct name-pair connections between them.
 *
 * This is a different axis from trace-tree/deep-chain, where thousands of
 * observations still collapse into a handful of graph nodes. The aggregated graph
 * connects every node of one super-step to every node of the next, so a step
 * carrying `--parallel` branches contributes parallel² connections per step
 * boundary — the shape that made a reported trace hand ELK ~1,400 distinct edges
 * (~23k before dedupe) and freeze the tab for minutes.
 *
 * Defaults land ~1,350 distinct connections from 350 observations. Scale
 * `--nodes`/`--parallel` up to cross the layout ceiling (`--nodes 120 --steps 100
 * --parallel 8` ≈ 5,100 connections → the "too large to lay out" notice), or make
 * a smaller graph pathologically dense (`--nodes 80 --steps 30 --parallel 4`
 * ≈ 450 connections over 80 nodes, tens of seconds of layout).
 */

const LANGGRAPH_NODE_TAG = "langgraph_node";
const LANGGRAPH_STEP_TAG = "langgraph_step";

// Node-name vocabulary: `${ROLE}_${index}` keeps every name distinct while
// reading like a real agent graph.
const ROLES = [
  "planner",
  "router",
  "retriever",
  "ranker",
  "generator",
  "critic",
  "tool_caller",
  "summarizer",
];

const TYPES: ObservationType[] = [
  "AGENT",
  "RETRIEVER",
  "GENERATION",
  "EVALUATOR",
  "TOOL",
];

const nodeName = (index: number) => `${ROLES[index % ROLES.length]}_${index}`;

/**
 * Node indices visited in super-step `step`. Hash-spread over the vocabulary
 * (stateless in (seed, step, slot)) rather than a rotating stride: a stride
 * repeats its step-to-step differences and the distinct-pair count saturates in
 * the low hundreds, while a spread keeps minting new name pairs.
 */
function stepNodes(
  seed: number,
  step: number,
  nodes: number,
  parallel: number,
): number[] {
  const picked: number[] = [];
  for (let slot = 0; picked.length < Math.min(parallel, nodes); slot++) {
    if (slot > parallel * 4) break; // give up rather than loop on a tiny vocabulary
    const index = jitter(seed, step * 1_009 + slot, nodes - 1);
    if (!picked.includes(index)) picked.push(index);
  }
  return picked;
}

/** Distinct (from,to) name pairs the aggregated graph will derive — the number
 * the layout budget is measured against. */
function countDistinctEdges(
  seed: number,
  steps: number,
  nodes: number,
  parallel: number,
): number {
  const pairs = new Set<string>();
  for (let step = 0; step < steps - 1; step++) {
    for (const from of stepNodes(seed, step, nodes, parallel)) {
      for (const to of stepNodes(seed, step + 1, nodes, parallel)) {
        if (from !== to) pairs.add(`${from}>${to}`);
      }
    }
  }
  // Plus the terminal edges into the synthetic __end__ node.
  return pairs.size + stepNodes(seed, steps - 1, nodes, parallel).length;
}

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const nodes = params["nodes"] as number;
  const steps = params["steps"] as number;
  const parallel = params["parallel"] as number;
  const withV4 = params["v4"] as boolean;

  if (nodes < 2 || steps < 2 || parallel < 1) {
    throw new SeedError(
      `--nodes and --steps must be >= 2 and --parallel >= 1, got ${nodes}/${steps}/${parallel}`,
      "try the defaults: --nodes 60 --steps 60 --parallel 5",
    );
  }

  const rng = new Rng(ctx.seed);
  const traceId = `${ctx.idPrefix}-trace`;
  const traceTimestamp = utcDayStartMs();
  const distinctEdges = countDistinctEdges(ctx.seed, steps, nodes, parallel);

  type PlannedObs = {
    index: number;
    node: string;
    step: number;
    type: ObservationType;
    startOffset: number;
    endOffset: number;
  };

  const planned: PlannedObs[] = [];
  const STEP_MS = 220; // wall-clock advance per super-step
  for (let step = 0; step < steps; step++) {
    for (const nodeIndex of stepNodes(ctx.seed, step, nodes, parallel)) {
      const index = planned.length;
      // Branches inside a step overlap (that IS the parallelism); steps never do.
      const start = step * STEP_MS + jitter(ctx.seed, index, 20);
      planned.push({
        index,
        node: nodeName(nodeIndex),
        step: step + 1, // langgraph_step is 1-based
        type: TYPES[nodeIndex % TYPES.length],
        startOffset: start,
        endOffset: start + 80 + jitter(ctx.seed, index + 1, 100),
      });
    }
  }

  const counts: Record<string, number> = {
    traces: 1,
    observations: planned.length,
    events: withV4 ? planned.length + 1 : 0,
    // Distinct names actually visited, NOT the --nodes vocabulary: the hash spread
    // does not guarantee full coverage (steps x parallel picks over `nodes` slots),
    // so a small run touches fewer names than the flag asks for.
    graphNodes: new Set(planned.map((p) => p.node)).size,
    graphConnections: distinctEdges,
  };

  if (ctx.dryRun) {
    return {
      scenario: "agent-graph",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [traceId],
      sessionIds: [],
      counts,
      verified: {},
      links: [traceLink(ctx, traceId, traceTimestamp)],
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const trace = createTrace({
    id: traceId,
    project_id: ctx.projectId,
    environment: ctx.environment,
    name: `seed-agent-graph (${nodes} nodes, ${distinctEdges} connections)`,
    timestamp: traceTimestamp,
    user_id: `user-${ctx.idPrefix}`,
    session_id: null,
    release: "seed-1.0.0",
    version: "seed-agent-graph-v1",
    tags: ["seed", "agent-graph"],
    public: false,
    bookmarked: false,
    metadata: { scenario: "agent-graph", seed: String(ctx.seed) },
    input: JSON.stringify({ task: "resolve a multi-hop research question" }),
    output: JSON.stringify({ answer: "done", steps }),
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
  });

  const observations: ObservationRecordInsertType[] = planned.map((p) => {
    const start = traceTimestamp + p.startOffset;
    const end = traceTimestamp + p.endOffset;
    const isGeneration = p.type === "GENERATION";
    const usageInput = rng.int(200, 3000);
    const usageOutput = rng.int(50, 1200);

    return createObservation({
      id: `${ctx.idPrefix}-obs-${p.index}`,
      trace_id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      type: p.type,
      parent_observation_id: null, // every node span sits directly under the trace
      name: p.node,
      start_time: start,
      end_time: end,
      completion_start_time: isGeneration ? start + 20 : null,
      level: "DEFAULT",
      status_message: null,
      version: null,
      input: isGeneration
        ? JSON.stringify({
            messages: [
              { role: "user", content: buildPayload("text", 200, rng) },
            ],
          })
        : JSON.stringify({ node: p.node, step: p.step }),
      output: isGeneration ? buildPayload("text", 150, rng) : null,
      metadata: {
        scenario: "agent-graph",
        [LANGGRAPH_NODE_TAG]: p.node,
        [LANGGRAPH_STEP_TAG]: String(p.step),
      },
      provided_model_name: isGeneration ? "gpt-5.4-mini" : null,
      internal_model_id: null,
      model_parameters: isGeneration
        ? JSON.stringify({ temperature: 0.2, max_tokens: 1024 })
        : "{}",
      ...(isGeneration
        ? generationUsageCost(usageInput, usageOutput)
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

  const events = withV4
    ? [
        traceToEvent(trace),
        ...observations.map((o) => observationToEvent(o, trace)),
      ]
    : [];
  counts.events = events.length;

  ctx.log(
    `writing 1 trace, ${observations.length} observations across ${steps} steps → ~${distinctEdges} distinct graph connections${withV4 ? `, ${events.length} events` : ""}`,
  );
  await createTracesCh([trace]);
  for (const batch of chunk(observations, 1000)) {
    await createObservationsCh(batch);
  }
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
    // The distinct node names ARE the point of this scenario — verify them, not
    // just the row count.
    langgraphNodes: await countRows(
      "observations",
      `project_id = {projectId: String} AND trace_id = {traceId: String} AND metadata[{nodeTag: String}] != ''`,
      { projectId: ctx.projectId, traceId, nodeTag: LANGGRAPH_NODE_TAG },
      `uniqExact(metadata[{nodeTag: String}])`,
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
    scenario: "agent-graph",
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

export const agentGraphScenario: ScenarioDefinition = {
  name: "agent-graph",
  description:
    "One trace that is large as a GRAPH, not as a tree: many distinct langgraph_node names with parallel branches per super-step, so the aggregated graph gets thousands of distinct node-pair connections from a few hundred observations (the shape that froze the trace graph). Defaults ≈ 1,350 connections; scale --nodes/--parallel to cross the layout ceiling, or use --nodes 80 --steps 30 --parallel 4 for a small-but-dense graph.",
  supportsV4: true,
  flags: [
    {
      flag: "nodes",
      type: "number",
      default: 60,
      description: "distinct graph node names (the vocabulary)",
    },
    {
      flag: "steps",
      type: "number",
      default: 70,
      description: "super-steps in the run (observations = steps × parallel)",
    },
    {
      flag: "parallel",
      type: "number",
      default: 5,
      description:
        "branches per super-step; connections per step boundary are parallel²",
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
