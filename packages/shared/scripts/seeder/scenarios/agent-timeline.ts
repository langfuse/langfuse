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
import { countRows, sessionLink, traceLink } from "./verify";

/**
 * A realistic agent run over a *timeline*: a LangGraph-style refine loop
 * (planner → retriever → generator → critic → back to planner …), unrolled for
 * N turns. Unlike trace-tree (which piles many children under one hub at the
 * same instant), each step here starts after the previous one finishes, so the
 * observations spread across a real ~20-30s timeline with a little parallelism.
 *
 * Node observations carry `langgraph_node` + `langgraph_step` metadata, so the
 * graph view uses its explicit-step model and renders a real flow with a loop
 * (the repeated node names collapse to one vertex each, critic → planner is the
 * refine back-edge). Their LLM/tool children have no langgraph metadata, so they
 * enrich the timeline without becoming graph nodes.
 */

const LANGGRAPH_NODE_TAG = "langgraph_node";
const LANGGRAPH_STEP_TAG = "langgraph_step";

// One turn of the loop: four nodes, each its own super-step.
const LOOP_NODES: { node: string; type: ObservationType }[] = [
  { node: "planner", type: "AGENT" },
  { node: "retriever", type: "RETRIEVER" },
  { node: "generator", type: "GENERATION" },
  { node: "critic", type: "EVALUATOR" },
];

// Rough per-node own-duration windows (ms), min + jitter range.
const DURATION: Record<string, [number, number]> = {
  planner: [350, 500],
  retriever: [150, 300],
  generator: [1200, 2600],
  critic: [500, 700],
};

type PlannedObs = {
  index: number;
  parentIndex: number | null;
  type: ObservationType;
  name: string;
  node: string | null; // langgraph_node (null for child spans)
  step: number | null; // langgraph_step
  startOffset: number;
  endOffset: number;
  isGeneration: boolean;
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const turns = params["turns"] as number;
  const withV4 = params["v4"] as boolean;
  // Default: attach langgraph metadata (the explicit-flow graph). --timing-only
  // omits it to exercise the pure timing-based graph fallback. (A boolean that
  // defaults true can't be unset via the CLI's presence-only flags, so this is
  // phrased as an opt-in.)
  const withMetadata = !(params["timing-only"] as boolean);

  if (turns < 1) {
    throw new SeedError(
      `--turns must be >= 1, got ${turns}`,
      "pass a positive integer, e.g. --turns 6",
    );
  }

  const rng = new Rng(ctx.seed);
  const traceId = `${ctx.idPrefix}-trace`;
  const sessionId = `${ctx.idPrefix}-session`;
  const traceTimestamp = utcDayStartMs();

  // Plan the observations along a single moving timeline cursor. `cursor` is the
  // ms offset from the trace timestamp; each node step advances it so nothing
  // overlaps across steps (children may overlap within a step = parallelism).
  const planned: PlannedObs[] = [];
  let cursor = 40; // small lead-in before the first node
  let step = 0;

  for (let turn = 0; turn < turns; turn++) {
    for (const { node, type } of LOOP_NODES) {
      step += 1;
      const nodeIndex = planned.length;
      const [dmin, drange] = DURATION[node];
      const ownDuration = dmin + jitter(ctx.seed, step * 7 + 1, drange);
      const nodeStart = cursor;
      const nodeEnd = nodeStart + ownDuration;

      planned.push({
        index: nodeIndex,
        parentIndex: null, // top-level node span under the trace
        type,
        name: node,
        node,
        step,
        startOffset: nodeStart,
        endOffset: nodeEnd,
        isGeneration: type === "GENERATION",
      });

      // Child work inside this node's window (no langgraph metadata → timeline
      // detail, not graph nodes). Some run in parallel to show a busy slice.
      const childSpecs: { type: ObservationType; name: string }[] =
        node === "planner"
          ? [{ type: "GENERATION", name: "plan-llm" }]
          : node === "retriever"
            ? [
                { type: "EMBEDDING", name: "query-embedding" },
                { type: "TOOL", name: "vector-search" },
              ]
            : node === "critic"
              ? [{ type: "GENERATION", name: "critique-llm" }]
              : []; // generator IS the LLM call — no child

      childSpecs.forEach((child, ci) => {
        // stagger children a touch; retriever's two run in parallel (same start)
        const childStart = nodeStart + 5 + (node === "retriever" ? 0 : ci * 20);
        const childEnd = Math.min(
          nodeEnd - 5,
          childStart + Math.max(20, Math.floor(ownDuration * 0.7)),
        );
        planned.push({
          index: planned.length,
          parentIndex: nodeIndex,
          type: child.type,
          name: child.name,
          node: null,
          step: null,
          startOffset: childStart,
          endOffset: Math.max(childStart + 10, childEnd),
          isGeneration: child.type === "GENERATION",
        });
      });

      cursor = nodeEnd + 20 + jitter(ctx.seed, step * 7 + 2, 60); // gap to next step
    }
  }

  if (ctx.dryRun) {
    return {
      scenario: "agent-timeline",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [traceId],
      sessionIds: [sessionId],
      counts: {
        traces: 1,
        observations: planned.length,
        events: withV4 ? planned.length + 1 : 0,
      },
      verified: {},
      links: [
        traceLink(ctx, traceId, traceTimestamp),
        sessionLink(ctx, sessionId),
      ],
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const rootInput = JSON.stringify({
    question: "How do I get a refund for a duplicate charge on my invoice?",
  });
  const rootOutput = JSON.stringify({
    answer:
      "I found the duplicate charge and issued a refund; it should appear in 3-5 business days.",
    turns,
  });

  const trace = createTrace({
    id: traceId,
    project_id: ctx.projectId,
    environment: ctx.environment,
    name: `seed-agent-timeline (${turns} turns)`,
    timestamp: traceTimestamp,
    user_id: `user-${ctx.idPrefix}`,
    session_id: sessionId,
    release: "seed-1.0.0",
    version: "seed-agent-v1",
    tags: ["seed", "agent-timeline"],
    public: false,
    bookmarked: false,
    metadata: { scenario: "agent-timeline", seed: String(ctx.seed) },
    input: rootInput,
    output: rootOutput,
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
  });

  const observations: ObservationRecordInsertType[] = planned.map((p) => {
    const start = traceTimestamp + p.startOffset;
    const end = traceTimestamp + p.endOffset;
    const durationMs = p.endOffset - p.startOffset;
    const usageInput = rng.int(200, 3000);
    const usageOutput = rng.int(50, 1200);
    const metadata: Record<string, string> = {
      scenario: "agent-timeline",
    };
    if (withMetadata && p.node !== null && p.step !== null) {
      metadata[LANGGRAPH_NODE_TAG] = p.node;
      metadata[LANGGRAPH_STEP_TAG] = String(p.step);
    }

    return createObservation({
      id: `${ctx.idPrefix}-obs-${p.index}`,
      trace_id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      type: p.type,
      parent_observation_id:
        p.parentIndex === null ? null : `${ctx.idPrefix}-obs-${p.parentIndex}`,
      name: p.name,
      start_time: start,
      end_time: end,
      // Clamp the time-to-first-token into the observation's own window so
      // completion_start_time never lands after end_time (short generations).
      // Exactly one rng.int draw either way — the rng stream is unchanged.
      completion_start_time: p.isGeneration
        ? start + Math.min(rng.int(60, 300), Math.max(10, durationMs - 10))
        : null,
      level: "DEFAULT",
      status_message: null,
      version: null,
      input: p.isGeneration
        ? JSON.stringify({
            messages: [
              { role: "system", content: "You are a helpful support agent." },
              {
                role: "user",
                content: buildPayload("text", rng.int(200, 800), rng),
              },
            ],
          })
        : p.node
          ? JSON.stringify({ node: p.node, step: p.step })
          : null,
      output: p.isGeneration
        ? buildPayload("text", rng.int(150, 700), rng)
        : null,
      metadata,
      provided_model_name: p.isGeneration ? "gpt-4o" : null,
      internal_model_id: null,
      model_parameters: p.isGeneration
        ? JSON.stringify({ temperature: 0.2, max_tokens: 1024 })
        : "{}",
      // Empty fields stay explicit for non-generations: the createObservation
      // factory would otherwise fill non-empty usage/cost defaults.
      ...(p.isGeneration
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

  const counts: Record<string, number> = {
    traces: 1,
    observations: observations.length,
    events: events.length,
  };

  ctx.log(
    `writing 1 trace (${turns} turns), ${observations.length} observations${withV4 ? `, ${events.length} events` : ""}`,
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
  };
  if (withMetadata) {
    // The langgraph metadata is what this scenario exists to seed (the graph
    // view's explicit-step model) — verify it landed, not just the row counts.
    verified.langgraphNodes = await countRows(
      "observations",
      `project_id = {projectId: String} AND trace_id = {traceId: String} AND metadata[{nodeTag: String}] != ''`,
      { projectId: ctx.projectId, traceId, nodeTag: LANGGRAPH_NODE_TAG },
      `uniqExact(metadata[{nodeTag: String}])`,
    );
  }
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
  if (withMetadata && verified.langgraphNodes < LOOP_NODES.length) {
    throw new SeedError(
      `Readback mismatch: expected ${LOOP_NODES.length} distinct langgraph_node metadata values, found ${verified.langgraphNodes}`,
    );
  }
  if (withV4 && verified.events < events.length) {
    throw new SeedError(
      `Readback mismatch: expected ${events.length} events_full rows, found ${verified.events}`,
    );
  }

  return {
    scenario: "agent-timeline",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: [traceId],
    sessionIds: [sessionId],
    counts,
    verified,
    links: [
      traceLink(ctx, traceId, traceTimestamp),
      sessionLink(ctx, sessionId),
    ],
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const agentTimelineScenario: ScenarioDefinition = {
  name: "agent-timeline",
  description:
    "One trace: a realistic LangGraph-style refine-loop agent (planner → retriever → generator → critic → loop) unrolled over N turns, with observations staggered across a real timeline and langgraph_node/step metadata. Exercises the graph's real-flow-with-loop rendering and a scrubbable timeline (vs. trace-tree's all-at-once hub).",
  supportsV4: true,
  flags: [
    {
      flag: "turns",
      type: "number",
      default: 6,
      description:
        "refine-loop iterations (each is planner→retriever→generator→critic)",
    },
    {
      flag: "timing-only",
      type: "boolean",
      default: false,
      description:
        "omit langgraph_node/langgraph_step metadata, so the graph is built from the pure timing-based fallback (every observation becomes a node)",
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
