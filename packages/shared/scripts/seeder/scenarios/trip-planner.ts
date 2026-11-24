import {
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
  createEventsCh,
  createScoresCh,
  createTraceScore,
  ScoreRecordInsertType,
  convertCallsToArrays,
  convertDefinitionsToMap,
  extractToolsFromObservation,
  ObservationRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import { ObservationType } from "../../../src/domain/observations";
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
 * Demo-grade travel-planning agent runs for agent-execution evals: one user
 * asks for a trip under a budget, and the agent plans it with tool calls.
 *
 * Run 0 is the hero run: a long execution (`--hero-steps`, default 186
 * observations) where the agent loops on `search_hotels`, never calls
 * `check_budget`, and returns an itinerary over budget. The remaining runs
 * cycle through four failure modes (tool loop, skipped budget check,
 * unconfirmed booking, over budget) and clean runs, so a trace table shows
 * what whole-execution evaluators would flag. Payloads use OpenAI-style
 * messages and tool_calls, so transcripts render as a real conversation.
 */

const MODEL = "gpt-5.4";
const PRICE = { input: 1.25e-6, output: 1e-5 };

type Mode = "hero" | "loop" | "skip" | "unconfirmed" | "over" | "clean";

const MODES: Mode[] = [
  "loop",
  "skip",
  "unconfirmed",
  "over",
  "clean",
  "clean",
  "clean",
  "loop",
  "clean",
  "skip",
  "clean",
];

const CITIES = [
  { city: "Lisbon", days: 5, budget: 2000 },
  { city: "Porto", days: 4, budget: 1500 },
  { city: "Barcelona", days: 6, budget: 2500 },
  { city: "Copenhagen", days: 3, budget: 1800 },
  { city: "Kyoto", days: 7, budget: 4000 },
  { city: "Vienna", days: 4, budget: 1600 },
];

const TOOLS = [
  "search_flights",
  "search_hotels",
  "check_weather",
  "check_budget",
  "book_flight",
] as const;
type Tool = (typeof TOOLS)[number];

const TOOL_DEFINITIONS = TOOLS.map((name) => ({
  type: "function",
  function: {
    name,
    description: `${name.replace("_", " ")} for the trip`,
    parameters: { type: "object", properties: {} },
  },
}));

const SYSTEM_PROMPT =
  "You are a travel planning agent. Plan trips end-to-end with the " +
  "available tools. Always verify the total with check_budget before " +
  "answering, and never call book_flight without explicit user confirmation.";

type Step = {
  key: string;
  parentKey: string | null;
  type: ObservationType;
  name: string;
  start: number;
  end: number;
  input?: unknown;
  output?: unknown;
  usage?: [number, number];
  level?: "DEFAULT" | "WARNING" | "ERROR";
  statusMessage?: string;
};

/** Judge verdicts per failure mode: [goal completion, check label, comment]. */
const VERDICTS: Record<Mode, [number, string, string]> = {
  hero: [
    0.31,
    "Tool loop",
    "search_hotels called {hotels} times with near-identical arguments; check_budget never ran; final itinerary is $2,340 against a $2,000 budget.",
  ],
  loop: [
    0.64,
    "Tool loop",
    "search_hotels called 5 times in a row with the same city and nights before the agent moved on.",
  ],
  skip: [
    0.42,
    "Skipped step",
    "The agent answered without calling check_budget, so the total was never verified.",
  ],
  unconfirmed: [
    0.55,
    "Wrong tool",
    "book_flight was called before the user confirmed the itinerary.",
  ],
  over: [
    0.38,
    "Goal missed",
    "The final itinerary exceeds the requested budget.",
  ],
  clean: [
    0.94,
    "Passed",
    "All required tools ran once, in order, and the plan is within budget.",
  ],
};

type Run = {
  mode: Mode;
  city: string;
  days: number;
  budget: number;
  question: string;
  answer: string;
  total: number;
  steps: Step[];
};

function toolResult(
  tool: Tool,
  city: string,
  days: number,
  page: number,
  total: number,
) {
  switch (tool) {
    case "search_flights":
      return {
        results: [
          { carrier: "TAP", from: "BER", to: city, price_usd: 286 },
          { carrier: "easyJet", from: "BER", to: city, price_usd: 214 },
        ],
      };
    case "search_hotels":
      return {
        page,
        results: [
          { name: `Casa ${city} Baixa`, nightly_usd: 168, rating: 4.6 },
          { name: `${city} Riverside Suites`, nightly_usd: 241, rating: 4.8 },
        ],
        has_more: true,
      };
    case "check_weather":
      return { forecast: "sunny", high_c: 21, low_c: 13, days };
    case "check_budget":
      return { total_usd: total, within_budget: true };
    case "book_flight":
      return { status: "booked", confirmation: "TP-8Q4K2M", price_usd: 286 };
  }
}

function toolArgs(tool: Tool, city: string, days: number, page: number) {
  switch (tool) {
    case "search_flights":
      return { from: "BER", to: city, depart: "2026-12-14", return_days: days };
    case "search_hotels":
      return { city, nights: days, max_nightly_usd: 250, page };
    case "check_weather":
      return { city, month: "December" };
    case "check_budget":
      return { items: ["flight", "hotel", "activities"] };
    case "book_flight":
      return { offer_id: "TP-286-BER", passengers: 1 };
  }
}

/** Builds one run as an agent → (llm.chat → tool) loop under a root AGENT. */
function buildRun(
  index: number,
  mode: Mode,
  heroSteps: number,
  seedNum: number,
): Run {
  // Every flagged run is the same Lisbon request, so the failures read as
  // one agent getting the same question wrong in different ways.
  const c = mode === "clean" ? CITIES[index % CITIES.length] : CITIES[0];
  const question = `Can you plan a ${c.days}-day ${c.city} trip under $${c.budget.toLocaleString("en-US")}?`;

  // Which tools the agent calls, in order.
  let sequence: Tool[] = [
    "search_flights",
    "search_hotels",
    "check_weather",
    "check_budget",
  ];
  if (mode === "loop") {
    sequence = [
      "search_flights",
      ...Array<Tool>(5).fill("search_hotels"),
      "check_weather",
      "check_budget",
    ];
  } else if (mode === "skip") {
    sequence = ["search_flights", "search_hotels", "check_weather"];
  } else if (mode === "unconfirmed") {
    sequence = [
      "search_flights",
      "book_flight",
      "search_hotels",
      "check_weather",
      "check_budget",
    ];
  } else if (mode === "hero") {
    // Each loop turn is llm.chat + tool (2 observations); the root, the
    // opening plan generation and the final answer add 3.
    const turns = Math.max(6, Math.floor((heroSteps - 3) / 2));
    const middle = turns - 3;
    sequence = [
      "search_flights",
      ...Array.from({ length: middle }, (_, i): Tool =>
        i % 9 === 4 ? "check_weather" : "search_hotels",
      ),
      "search_flights",
      "check_weather",
    ];
  }

  const overBudget = mode === "hero" || mode === "over" || mode === "skip";
  const total = overBudget
    ? Math.round(c.budget * 1.17)
    : Math.round(c.budget * 0.91);
  const answer = overBudget
    ? `Here's your ${c.days}-day ${c.city} plan: TAP flight from Berlin ($286), ${c.days} nights at ${c.city} Riverside Suites ($241/night), a day trip and food tour. Total: $${total.toLocaleString("en-US")}.`
    : `Here's your ${c.days}-day ${c.city} plan: easyJet from Berlin ($214), ${c.days} nights at Casa ${c.city} Baixa ($168/night), plus a walking tour and museum pass. Total: $${total.toLocaleString("en-US")}, within your $${c.budget.toLocaleString("en-US")} budget.`;

  const planMessage = {
    role: "assistant",
    content: "Plan: flights → hotels → weather → budget check → answer.",
  };
  const steps: Step[] = [];
  const messages: unknown[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: question },
  ];
  const openingMessages = [...messages];
  messages.push(planMessage);
  let t = 120;
  const llmMs = (i: number) => 700 + jitter(seedNum + index, i, 900);
  const toolMs = (i: number) => 180 + jitter(seedNum * 3 + index, i, 600);

  sequence.forEach((tool, i) => {
    const page = sequence.slice(0, i + 1).filter((s) => s === tool).length;
    const callId = `call_${index}_${i}`;
    const args = toolArgs(tool, c.city, c.days, page);
    const genStart = t;
    const genEnd = genStart + llmMs(i);
    const toolCall = {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: callId,
          type: "function",
          function: { name: tool, arguments: JSON.stringify(args) },
        },
      ],
    };
    steps.push({
      key: `llm-${i}`,
      parentKey: "root",
      type: "GENERATION",
      name: "llm.chat",
      start: genStart,
      end: genEnd,
      // Every call carries the full history, as a real agent loop does; the
      // transcript relies on it to keep the run in one thread.
      input: { messages: [...messages], tools: TOOL_DEFINITIONS },
      output: toolCall,
      usage: [900 + i * 140, 48],
    });
    const result = toolResult(tool, c.city, c.days, page, total);
    steps.push({
      key: `tool-${i}`,
      parentKey: "root",
      type: "TOOL",
      name: tool,
      start: genEnd + 15,
      end: genEnd + 15 + toolMs(i),
      input: args,
      output: result,
    });
    messages.push(toolCall, {
      role: "tool",
      tool_call_id: callId,
      content: JSON.stringify(result),
    });
    t = genEnd + 40 + toolMs(i);
  });

  const finalStart = t;
  const finalEnd = finalStart + 1600;
  steps.push({
    key: "final",
    parentKey: "root",
    type: "GENERATION",
    name: "llm.chat",
    start: finalStart,
    end: finalEnd,
    input: { messages: [...messages], tools: TOOL_DEFINITIONS },
    output: { role: "assistant", content: answer },
    usage: [2400, 220],
  });

  const plan = {
    key: "plan",
    parentKey: "root",
    type: "GENERATION" as ObservationType,
    name: "plan-trip",
    start: 20,
    end: 110,
    input: { messages: openingMessages },
    output: planMessage,
    usage: [420, 36] as [number, number],
  };

  return {
    mode,
    city: c.city,
    days: c.days,
    budget: c.budget,
    question,
    answer,
    total,
    steps: [
      {
        key: "root",
        parentKey: null,
        type: "AGENT",
        name: "trip-planner",
        start: 0,
        end: finalEnd + 30,
        input: { messages: openingMessages.slice(1) },
        output: { role: "assistant", content: answer },
      },
      plan,
      ...steps,
    ],
  };
}

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const withV4 = params["v4"] as boolean;
  const runCount = Math.max(1, Number(params["runs"] ?? 24));
  const heroSteps = Math.max(15, Number(params["hero-steps"] ?? 186));
  const seedNum = Number(params["seed"] ?? 42);
  const withScores = params["scores"] as boolean;

  const runs = Array.from({ length: runCount }, (_, i) =>
    buildRun(
      i,
      i === 0 ? "hero" : MODES[(i - 1) % MODES.length],
      heroSteps,
      seedNum,
    ),
  );
  // The hero run is the newest trace; others spread back over a few hours.
  const anchor = utcDayStartMs() + 10 * 3_600_000;
  const timestampOf = (i: number) =>
    anchor - i * 7 * 60_000 - jitter(seedNum, i, 50_000);
  const traceIdOf = (i: number) => `${ctx.idPrefix}-${i}`;

  const observationCount = runs.reduce((n, r) => n + r.steps.length, 0);
  const links = [traceLink(ctx, traceIdOf(0), timestampOf(0))];

  if (ctx.dryRun) {
    return {
      scenario: "trip-planner",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: runs.map((_, i) => traceIdOf(i)),
      sessionIds: [],
      counts: {
        traces: runs.length,
        observations: observationCount,
        events: withV4 ? observationCount + runs.length : 0,
      },
      verified: {},
      links,
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const events: ReturnType<typeof observationToEvent>[] = [];
  const scores: ScoreRecordInsertType[] = [];

  runs.forEach((r, i) => {
    const traceId = traceIdOf(i);
    const ts = timestampOf(i);
    const root = r.steps[0];
    const trace = createTrace({
      id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      name: "trip-planner",
      timestamp: ts,
      user_id: `traveler-${(i * 37) % 97}`,
      session_id: null,
      release: "2026.11.20-1",
      version: "planner-v2.4",
      tags: ["travel", r.city.toLowerCase()],
      public: false,
      bookmarked: false,
      metadata: { scenario: "trip-planner", mode: r.mode },
      input: JSON.stringify(root.input),
      output: JSON.stringify(root.output),
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    });
    traces.push(trace);

    const keyToId = new Map(
      r.steps.map((s, j) => [s.key, `${traceId}-obs-${j}`]),
    );
    for (const s of r.steps) {
      const [usageIn, usageOut] = s.usage ?? [0, 0];
      const inCost = s.usage ? usageIn * PRICE.input : 0;
      const outCost = s.usage ? usageOut * PRICE.output : 0;
      const { toolDefinitions, toolArguments } = extractToolsFromObservation(
        s.input,
        s.output,
      );
      const toolCallArrays = convertCallsToArrays(toolArguments);
      const obs = createObservation({
        tool_definitions: convertDefinitionsToMap(toolDefinitions),
        tool_calls: toolCallArrays.tool_calls,
        tool_call_names: toolCallArrays.tool_call_names,
        id: keyToId.get(s.key)!,
        trace_id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type: s.type,
        parent_observation_id:
          s.parentKey === null ? null : (keyToId.get(s.parentKey) ?? null),
        name: s.name,
        start_time: ts + s.start,
        end_time: ts + s.end,
        completion_start_time: null,
        level: s.level ?? "DEFAULT",
        status_message: s.statusMessage ?? null,
        version: null,
        input: s.input !== undefined ? JSON.stringify(s.input) : null,
        output: s.output !== undefined ? JSON.stringify(s.output) : null,
        metadata: { scenario: "trip-planner" },
        provided_model_name: s.usage ? MODEL : null,
        internal_model_id: null,
        model_parameters: s.usage ? JSON.stringify({ temperature: 0.2 }) : "{}",
        ...(s.usage
          ? {
              provided_usage_details: {
                input: usageIn,
                output: usageOut,
                total: usageIn + usageOut,
              },
              usage_details: {
                input: usageIn,
                output: usageOut,
                total: usageIn + usageOut,
              },
              provided_cost_details: { input: inCost, output: outCost },
              cost_details: {
                input: inCost,
                output: outCost,
                total: inCost + outCost,
              },
              total_cost: inCost + outCost,
            }
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
      observations.push(obs);
      if (withV4) events.push(observationToEvent(obs, trace));
    }
    if (withV4) events.push(traceToEvent(trace));

    if (withScores) {
      const [goal, check, template] = VERDICTS[r.mode];
      const hotels = r.steps.filter((st) => st.name === "search_hotels").length;
      const comment = template.replace("{hotels}", String(hotels));
      const scoreTs = ts + r.steps[0].end + 20_000;
      scores.push(
        createTraceScore({
          id: `${traceId}-score-goal`,
          project_id: ctx.projectId,
          trace_id: traceId,
          observation_id: null,
          environment: ctx.environment,
          name: "Goal completion",
          value: Math.min(1, goal + jitter(seedNum, i, 4) / 100),
          data_type: "NUMERIC",
          source: "EVAL",
          comment,
          metadata: {},
          timestamp: scoreTs,
        }),
        createTraceScore({
          id: `${traceId}-score-check`,
          project_id: ctx.projectId,
          trace_id: traceId,
          observation_id: null,
          environment: ctx.environment,
          name: "Execution check",
          value: 0,
          string_value: check,
          data_type: "CATEGORICAL",
          source: "EVAL",
          comment,
          metadata: {},
          timestamp: scoreTs,
        }),
      );
    }
  });

  ctx.log(
    `writing ${traces.length} trip-planner traces, ${observations.length} observations${withV4 ? `, ${events.length} events` : ""}`,
  );
  await createTracesCh(traces);
  for (const batch of chunk(observations, 1000)) {
    await createObservationsCh(batch);
  }
  for (const batch of chunk(events, 500)) {
    await createEventsCh(batch);
  }
  for (const batch of chunk(scores, 1000)) {
    await createScoresCh(batch);
  }

  const idFilter = `project_id = {projectId: String} AND startsWith(trace_id, {prefix: String})`;
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND startsWith(id, {prefix: String})`,
      { projectId: ctx.projectId, prefix: `${ctx.idPrefix}-` },
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      idFilter,
      { projectId: ctx.projectId, prefix: `${ctx.idPrefix}-` },
      "uniqExact(id)",
    ),
  };
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

  return {
    scenario: "trip-planner",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: traces.map((t) => t.id),
    sessionIds: [],
    counts: {
      traces: traces.length,
      observations: observations.length,
      events: events.length,
      scores: scores.length,
    },
    verified,
    links,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const tripPlannerScenario: ScenarioDefinition = {
  name: "trip-planner",
  description:
    "Demo-grade travel-planning agent runs for agent-execution evals: run 0 is a long hero execution (--hero-steps, default 186) that loops on search_hotels, skips check_budget and ends over budget; the other runs cycle through tool loop, skipped budget check, unconfirmed book_flight, over budget, and clean runs. OpenAI-style messages and tool_calls, so transcripts render as a conversation.",
  supportsV4: true,
  flags: [
    {
      flag: "v4",
      type: "boolean",
      default: false,
      description: "also mirror into v4 events_full/events_core",
    },
    {
      flag: "runs",
      type: "number",
      default: 24,
      description: "number of agent runs (traces); run 0 is the hero run",
    },
    {
      flag: "hero-steps",
      type: "number",
      default: 186,
      description: "observations in the hero run",
    },
    {
      flag: "scores",
      type: "boolean",
      default: true,
      description:
        "write trace-level EVAL scores (Goal completion, Execution check) with judge comments",
    },
  ],
  run,
};
