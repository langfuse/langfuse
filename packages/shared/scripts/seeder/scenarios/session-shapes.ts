import { prisma } from "../../../src/db";
import {
  createTrace,
  createObservation,
  createSessionScore,
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
import { countRows, sessionLink } from "./verify";

/**
 * Diverse v4 session shapes for the session-detail view (LFE-10520).
 *
 * The v4 session view renders one card per trace. Pre-LFE-10520 it defaulted to
 * a "First Generation in Trace" preset that surfaced only the first
 * `type=GENERATION` observation per trace — which broke agentic sessions whose
 * I/O lives on AGENT/TOOL observations with no GENERATION at all (every card
 * rendered "No observations match the current filter."). The default is now
 * "All observations with I/O", which renders those correctly. This scenario
 * seeds the shapes to see both the fix and the shapes it targets:
 *
 *  - chat   one GENERATION per turn carrying accumulating ChatML messages;
 *           renders as a chat.
 *  - agent  a coding/agent session: I/O on the root AGENT + TOOL children,
 *           NO GENERATION — the shape the old default rendered empty.
 *  - mixed  alternating chat/agent turns.
 *
 * Each shape is written as its own session (id `<prefix>-<shape>`) so a single
 * `--shape all` run hands back one session link per shape.
 */

type Shape = "chat" | "agent" | "mixed";

const SHAPES: readonly Shape[] = ["chat", "agent", "mixed"];

const CHAT_TURNS: ReadonlyArray<{ user: string; assistant: string }> = [
  {
    user: "Hi! How do I get a refund for order #4821? It arrived damaged.",
    assistant:
      "I'm sorry to hear that. I can start a refund for order #4821 right away — refunds for damaged items are processed within 5 business days to your original payment method. Would you like a replacement shipped instead?",
  },
  {
    user: "A refund is fine. Do I need to send the damaged item back?",
    assistant:
      "No need to return it for a damaged-on-arrival item. I've issued the refund and emailed you the confirmation. Is there anything else I can help with?",
  },
  {
    user: "Can you also update the shipping address on my account?",
    assistant:
      "Of course. I've opened the address form — please share the new street, city, and postal code and I'll update it on your profile.",
  },
  {
    user: "It's 14 Rue de la Paix, Paris, 75002.",
    assistant:
      "Done — your default shipping address is now 14 Rue de la Paix, Paris, 75002. Future orders will ship there unless you choose otherwise.",
  },
];

const CODING_TASKS: ReadonlyArray<{
  request: string;
  read: { path: string; content: string };
  patch: { diff: string; result: string };
  test: { command: string; result: string };
  summary: string;
}> = [
  {
    request:
      "The test `validateToken` in src/auth.test.ts is failing after the latest refactor. Find the bug, fix it, and make sure the auth tests pass.",
    read: {
      path: "src/auth.ts",
      content:
        "export function validateToken(token) {\n  const payload = decode(token);\n  return payload.exp > Date.now() / 1000;\n}",
    },
    patch: {
      diff: "@@ -1,4 +1,5 @@\n export function validateToken(token) {\n   const payload = decode(token);\n-  return payload.exp > Date.now() / 1000;\n+  if (!payload) return false;\n+  return payload.exp > Date.now() / 1000;\n }",
      result: "Patch applied to src/auth.ts (1 hunk, +2 -1).",
    },
    test: {
      command: "pnpm vitest run src/auth.test.ts",
      result:
        "✓ src/auth.test.ts (14 tests) 312ms\n  ✓ validateToken rejects a null payload\n\nTest Files  1 passed (1)\n     Tests  14 passed (14)",
    },
    summary:
      "Fixed a missing null-check in validateToken(): a malformed token made decode() return null and threw on `.exp`. Added an early `return false`. All 14 auth tests pass and lint is clean.",
  },
  {
    request:
      "Add a `--dry-run` flag to the export script in scripts/export.ts so it prints the plan without writing files.",
    read: {
      path: "scripts/export.ts",
      content:
        "async function main() {\n  const rows = await load();\n  await writeFiles(rows);\n}",
    },
    patch: {
      diff: "@@ -1,4 +1,7 @@\n async function main() {\n+  const dryRun = process.argv.includes('--dry-run');\n   const rows = await load();\n-  await writeFiles(rows);\n+  if (dryRun) { console.log(`would write ${rows.length} files`); return; }\n+  await writeFiles(rows);\n }",
      result: "Patch applied to scripts/export.ts (1 hunk, +3 -1).",
    },
    test: {
      command: "pnpm tsx scripts/export.ts --dry-run",
      result: "would write 128 files",
    },
    summary:
      "Added a `--dry-run` flag: when present, the export script logs the file count it would write and exits before touching disk. Verified it prints the plan and writes nothing.",
  },
];

const buildChatMessages = (turnIdx: number): string => {
  const messages: Array<{ role: string; content: string }> = [
    {
      role: "system",
      content:
        "You are a friendly customer-support assistant for an e-commerce store. Be concise and helpful.",
    },
  ];
  for (let i = 0; i <= turnIdx; i++) {
    const turn = CHAT_TURNS[i % CHAT_TURNS.length];
    messages.push({ role: "user", content: turn.user });
    if (i < turnIdx) {
      messages.push({ role: "assistant", content: turn.assistant });
    }
  }
  return JSON.stringify({ messages });
};

const microPrice = (tokens: number, rate: number) => tokens * rate;

/**
 * Builds the rows for one chat trace: a root AGENT turn (no I/O) plus a
 * GENERATION carrying the accumulating ChatML conversation. The default
 * "first generation" preset surfaces the GENERATION, so the card renders as a
 * chat.
 */
const buildChatTrace = (
  ctx: ScenarioContext,
  rng: Rng,
  sessionId: string,
  traceId: string,
  turnIdx: number,
  timestamp: number,
): {
  trace: TraceRecordInsertType;
  observations: ObservationRecordInsertType[];
} => {
  const turn = CHAT_TURNS[turnIdx % CHAT_TURNS.length];
  const trace = createTrace({
    id: traceId,
    project_id: ctx.projectId,
    environment: ctx.environment,
    session_id: sessionId,
    timestamp,
    name: "chat-turn",
    user_id: `user-${ctx.idPrefix}`,
    release: "v2.0.0",
    version: "v2.0.0",
    tags: ["seed", "session-shapes", "chat"],
    public: false,
    bookmarked: false,
    metadata: {
      scenario: "session-shapes",
      shape: "chat",
      turn: String(turnIdx),
    },
    input: turn.user,
    output: turn.assistant,
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
  });

  const rootStart = timestamp + jitter(ctx.seed, turnIdx * 7, 60);
  const genStart = rootStart + 40 + jitter(ctx.seed, turnIdx * 7 + 1, 80);
  const genEnd = genStart + rng.int(700, 2600);
  const usageInput = rng.int(200, 1800);
  const usageOutput = rng.int(60, 500);

  const observations: ObservationRecordInsertType[] = [
    createObservation({
      id: `${traceId}-o0`,
      trace_id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      type: "AGENT",
      parent_observation_id: null,
      name: "assistant-turn",
      start_time: rootStart,
      end_time: genEnd + 20,
      completion_start_time: null,
      level: "DEFAULT",
      status_message: null,
      version: null,
      input: null,
      output: null,
      metadata: { scenario: "session-shapes", shape: "chat" },
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
    }),
    createObservation({
      id: `${traceId}-o1`,
      trace_id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      type: "GENERATION",
      parent_observation_id: `${traceId}-o0`,
      name: "gpt-4o-completion",
      start_time: genStart,
      end_time: genEnd,
      completion_start_time: genStart + rng.int(90, 320),
      level: "DEFAULT",
      status_message: null,
      version: null,
      input: buildChatMessages(turnIdx),
      output: turn.assistant,
      metadata: { scenario: "session-shapes", shape: "chat" },
      provided_model_name: "gpt-4o",
      internal_model_id: null,
      model_parameters: JSON.stringify({ temperature: 0.4 }),
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
        input: microPrice(usageInput, 2e-6),
        output: microPrice(usageOutput, 6e-6),
      },
      cost_details: {
        input: microPrice(usageInput, 2e-6),
        output: microPrice(usageOutput, 6e-6),
        total: microPrice(usageInput, 2e-6) + microPrice(usageOutput, 6e-6),
      },
      total_cost: microPrice(usageInput, 2e-6) + microPrice(usageOutput, 6e-6),
      prompt_id: null,
      prompt_name: null,
      prompt_version: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    }),
  ];

  return { trace, observations };
};

/**
 * Builds the rows for one coding/agent trace: a root AGENT carrying the user's
 * request and the agent's final answer, plus TOOL children with real I/O and
 * an empty SPAN. There is NO GENERATION, so the default "first generation"
 * preset selects nothing and the card renders empty — the LFE-10520 bug.
 */
const buildAgentTrace = (
  ctx: ScenarioContext,
  rng: Rng,
  sessionId: string,
  traceId: string,
  turnIdx: number,
  timestamp: number,
): {
  trace: TraceRecordInsertType;
  observations: ObservationRecordInsertType[];
} => {
  const task = CODING_TASKS[turnIdx % CODING_TASKS.length];
  const trace = createTrace({
    id: traceId,
    project_id: ctx.projectId,
    environment: ctx.environment,
    session_id: sessionId,
    timestamp,
    name: "coding-agent",
    user_id: `user-${ctx.idPrefix}`,
    release: "v2.0.0",
    version: "v2.0.0",
    tags: ["seed", "session-shapes", "agent"],
    public: false,
    bookmarked: false,
    metadata: {
      scenario: "session-shapes",
      shape: "agent",
      turn: String(turnIdx),
    },
    input: task.request,
    output: task.summary,
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
  });

  const base = timestamp + jitter(ctx.seed, turnIdx * 13, 60);
  const mkTime = (slot: number) =>
    base + slot * 400 + jitter(ctx.seed, turnIdx * 13 + slot + 1, 120);

  const observations: ObservationRecordInsertType[] = [];

  const mkChild = (
    slot: number,
    id: string,
    type: "TOOL" | "SPAN",
    name: string,
    input: string | null,
    output: string | null,
  ) => {
    const start = mkTime(slot);
    observations.push(
      createObservation({
        id,
        trace_id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type,
        parent_observation_id: `${traceId}-o0`,
        name,
        start_time: start,
        end_time: start + rng.int(20, 400),
        completion_start_time: null,
        level: "DEFAULT",
        status_message: null,
        version: null,
        input,
        output,
        metadata: { scenario: "session-shapes", shape: "agent" },
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
      }),
    );
  };

  // Root AGENT carries the request + final answer (generation-like I/O, but
  // NOT a GENERATION type — this is exactly what the default preset misses).
  const rootStart = base;
  observations.push(
    createObservation({
      id: `${traceId}-o0`,
      trace_id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      type: "AGENT",
      parent_observation_id: null,
      name: "coding-agent",
      start_time: rootStart,
      end_time: mkTime(5) + 50,
      completion_start_time: null,
      level: "DEFAULT",
      status_message: null,
      version: null,
      input: task.request,
      output: task.summary,
      metadata: { scenario: "session-shapes", shape: "agent" },
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
    }),
  );

  mkChild(1, `${traceId}-o1`, "SPAN", "plan", null, null);
  mkChild(
    2,
    `${traceId}-o2`,
    "TOOL",
    "read_file",
    JSON.stringify({ path: task.read.path }),
    task.read.content,
  );
  mkChild(
    3,
    `${traceId}-o3`,
    "TOOL",
    "apply_patch",
    JSON.stringify({ path: task.read.path, diff: task.patch.diff }),
    task.patch.result,
  );
  mkChild(
    4,
    `${traceId}-o4`,
    "TOOL",
    "run_tests",
    JSON.stringify({ command: task.test.command }),
    task.test.result,
  );

  return { trace, observations };
};

const buildSession = (
  ctx: ScenarioContext,
  rng: Rng,
  shape: Shape,
  turns: number,
): {
  sessionId: string;
  sessionStart: number;
  traces: TraceRecordInsertType[];
  observations: ObservationRecordInsertType[];
} => {
  const sessionId = `${ctx.idPrefix}-${shape}`;
  // Anchor each session in a recent, distinct hour so UI time windows show
  // them and the three sessions don't overlap their timestamps.
  const shapeOffsetMin = (SHAPES.indexOf(shape) + 1) * 90;
  const sessionStart = utcDayStartMs() - shapeOffsetMin * 60 * 1000;
  const stepMs = (45 * 60 * 1000) / Math.max(turns, 1);

  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];

  for (let t = 0; t < turns; t++) {
    const traceId = `${ctx.idPrefix}-${shape}-t${t}`;
    const timestamp =
      sessionStart + Math.floor(t * stepMs) + jitter(ctx.seed, t, 400);

    // mixed alternates chat/agent turns; chat/agent are uniform.
    const turnShape: Exclude<Shape, "mixed"> =
      shape === "mixed" ? (t % 2 === 0 ? "chat" : "agent") : shape;

    const built =
      turnShape === "chat"
        ? buildChatTrace(ctx, rng, sessionId, traceId, t, timestamp)
        : buildAgentTrace(ctx, rng, sessionId, traceId, t, timestamp);

    traces.push(built.trace);
    observations.push(...built.observations);
  }

  return { sessionId, sessionStart, traces, observations };
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const shapeParam = String(params["shape"]);
  const turns = params["turns"] as number;
  const withV4 = params["v4"] as boolean;

  if (shapeParam !== "all" && !SHAPES.includes(shapeParam as Shape)) {
    throw new SeedError(
      `--shape must be one of ${SHAPES.join(", ")}, all — got "${shapeParam}"`,
      "e.g. --shape agent (the empty-cards repro) or --shape all",
    );
  }
  if (turns < 1) {
    throw new SeedError(
      `--turns must be >= 1, got ${turns}`,
      "pass a positive integer, e.g. --turns 8",
    );
  }

  const shapesToSeed: Shape[] =
    shapeParam === "all" ? [...SHAPES] : [shapeParam as Shape];

  const rng = new Rng(ctx.seed);

  if (ctx.dryRun) {
    return {
      scenario: "session-shapes",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: shapesToSeed.map((shape) => `${ctx.idPrefix}-${shape}-t0`),
      sessionIds: shapesToSeed.map((shape) => `${ctx.idPrefix}-${shape}`),
      counts: {
        sessions: shapesToSeed.length,
        traces: shapesToSeed.length * turns,
      },
      verified: {},
      links: shapesToSeed.map((shape) =>
        sessionLink(ctx, `${ctx.idPrefix}-${shape}`),
      ),
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const allTraces: TraceRecordInsertType[] = [];
  const allObservations: ObservationRecordInsertType[] = [];
  const allScores: ScoreRecordInsertType[] = [];
  const allEvents: EventRecordInsertType[] = [];
  const sessionIds: string[] = [];
  const links: string[] = [];

  for (const shape of shapesToSeed) {
    const { sessionId, sessionStart, traces, observations } = buildSession(
      ctx,
      rng,
      shape,
      turns,
    );
    sessionIds.push(sessionId);
    links.push(sessionLink(ctx, sessionId));
    allTraces.push(...traces);
    allObservations.push(...observations);

    allScores.push(
      createSessionScore({
        id: `${sessionId}-quality`,
        project_id: ctx.projectId,
        session_id: sessionId,
        environment: ctx.environment,
        name: "session-quality",
        value: Math.round(rng.next() * 100) / 100,
        data_type: "NUMERIC",
        source: "API",
        comment: null,
        metadata: {},
        timestamp: sessionStart,
      }),
    );

    // The session detail page 404s without the Postgres trace_sessions row.
    await prisma.traceSession.upsert({
      where: { id_projectId: { id: sessionId, projectId: ctx.projectId } },
      update: {},
      create: {
        id: sessionId,
        projectId: ctx.projectId,
        environment: ctx.environment,
        createdAt: new Date(sessionStart),
      },
    });
  }

  if (withV4) {
    const tracesById = new Map(allTraces.map((tr) => [tr.id, tr]));
    for (const trace of allTraces) {
      allEvents.push(traceToEvent(trace));
    }
    for (const obs of allObservations) {
      const trace = obs.trace_id ? tracesById.get(obs.trace_id) : undefined;
      if (trace) allEvents.push(observationToEvent(obs, trace));
    }
  }

  ctx.log(
    `writing ${sessionIds.length} sessions, ${allTraces.length} traces, ${allObservations.length} observations, ${allScores.length} scores${
      withV4 ? `, ${allEvents.length} events` : ""
    }`,
  );
  for (const batch of chunk(allTraces, 1000)) {
    await createTracesCh(batch);
  }
  for (const batch of chunk(allObservations, 1000)) {
    await createObservationsCh(batch);
  }
  await createScoresCh(allScores);
  for (const batch of chunk(allEvents, 500)) {
    await createEventsCh(batch);
  }

  const traceIds = allTraces.map((tr) => tr.id);
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND session_id IN {sessionIds: Array(String)}`,
      { projectId: ctx.projectId, sessionIds },
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      `project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`,
      { projectId: ctx.projectId, traceIds },
      "uniqExact(id)",
    ),
  };
  if (withV4) {
    verified.events = await countRows(
      "events_full",
      `project_id = {projectId: String} AND session_id IN {sessionIds: Array(String)}`,
      { projectId: ctx.projectId, sessionIds },
      "uniqExact(span_id)",
    );
  }

  if (verified.traces < allTraces.length) {
    throw new SeedError(
      `Readback mismatch: expected ${allTraces.length} session traces, found ${verified.traces}`,
    );
  }
  if (verified.observations < allObservations.length) {
    throw new SeedError(
      `Readback mismatch: expected ${allObservations.length} observations, found ${verified.observations}`,
    );
  }
  if (withV4 && verified.events < allEvents.length) {
    throw new SeedError(
      `Readback mismatch: expected ${allEvents.length} events_full rows, found ${verified.events}`,
    );
  }

  return {
    scenario: "session-shapes",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: traceIds.slice(0, 5),
    sessionIds,
    counts: {
      sessions: sessionIds.length,
      traces: allTraces.length,
      observations: allObservations.length,
      scores: allScores.length,
      events: allEvents.length,
    },
    verified,
    links,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const sessionShapesScenario: ScenarioDefinition = {
  name: "session-shapes",
  description:
    "Diverse v4 session shapes for the session-detail view: a clean multi-turn CHAT session (renders as chat), a coding/AGENT session whose I/O lives on AGENT/TOOL observations with NO GENERATION (the default 'first generation' preset yields empty cards — LFE-10520), and a MIXED session. Creates the Postgres trace_sessions rows.",
  supportsV4: true,
  flags: [
    {
      flag: "shape",
      type: "string",
      default: "all",
      description: "session shape: chat | agent | mixed | all",
    },
    {
      flag: "turns",
      type: "number",
      default: 8,
      description: "traces (turns) per session",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description:
        "mirror into v4 events tables (on by default: v4-only surface)",
    },
  ],
  run,
};
