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
import { utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, sessionLink, traceLink } from "./verify";

/**
 * A demo-grade, production-looking agent run: one fixed, fully handcrafted
 * trace of a customer-support copilot resolving a duplicate-charge refund.
 *
 * Unlike the other scenarios (which generate lorem-style payloads at scale),
 * every observation here carries real-looking content — actual message
 * arrays, tool arguments and JSON results, believable token counts, per-model
 * costs, staggered timings with a parallel context fan-out and a 3-turn
 * ReAct loop (`llm.chat` repeats, tools differ). Deterministic: re-seeding
 * reproduces the identical trace, which makes it ideal for videos,
 * screenshots, and docs.
 *
 * Graph view: the repeated `llm.chat` collapses to one `(3/3)` node with
 * loop-back edges in Aggregated mode; Expanded mode unrolls the run into the
 * as-it-ran DAG with the load-context fork/join.
 */

const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.5e-6, output: 1e-5 },
  "gpt-4o-mini": { input: 1.5e-7, output: 6e-7 },
};

type DemoObs = {
  key: string;
  parentKey: string | null;
  type: ObservationType;
  name: string;
  /** ms offsets from the trace timestamp */
  start: number;
  end: number;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, string>;
  model?: keyof typeof MODEL_PRICES;
  /** [input tokens, output tokens] — generations only */
  usage?: [number, number];
  /** time-to-first-token in ms — generations only */
  ttft?: number;
  modelParameters?: Record<string, unknown>;
};

const CUSTOMER_MESSAGE =
  "Hi — I was charged twice for my Pro subscription this month " +
  "(invoices inv_20260701 and inv_20260701-2, $49 each). " +
  "Can you refund the duplicate?";

const AGENT_SYSTEM_PROMPT =
  "You are Acme's support copilot. Resolve the customer's billing issue " +
  "end-to-end using the available tools (stripe_find_charges, " +
  "stripe_create_refund, escalate_to_human). Verify before acting: never " +
  "refund without confirming the duplicate against Stripe. When done, " +
  "summarize the resolution for the reply drafter.";

const FINAL_REPLY =
  "Hi Maya, thanks for flagging this! I've confirmed the duplicate $49.00 " +
  "charge from July 1st (both hit within 5 seconds — a payment retry bug on " +
  "our side) and issued a refund for the second charge (re_8Fj2kQ). You " +
  "should see it back on your card within 5–10 business days. I've also " +
  "passed the retry issue to our payments team so it doesn't happen again. " +
  "Sorry for the hassle!";

/** The whole run, handcrafted. Offsets are ms from the trace timestamp. */
const PLAN: DemoObs[] = [
  {
    key: "root",
    parentKey: null,
    type: "AGENT",
    name: "support-copilot",
    start: 0,
    end: 11052,
    input: { message: CUSTOMER_MESSAGE, customer_id: "cus_LqT4v8" },
    output: {
      reply: FINAL_REPLY,
      resolution: "refund_issued",
      refund_id: "re_8Fj2kQ",
      confidence: 0.94,
    },
    metadata: { channel: "in-app-chat", plan: "pro", region: "eu-central-1" },
  },
  {
    key: "guard-in",
    parentKey: "root",
    type: "GUARDRAIL",
    name: "guardrail.input",
    start: 45,
    end: 168,
    input: {
      text: CUSTOMER_MESSAGE,
      checks: ["prompt_injection", "pii", "toxicity"],
    },
    output: { verdict: "pass", flags: [], pii_redactions: 0 },
    metadata: { provider: "internal", policy: "support-v2" },
  },
  {
    key: "classify",
    parentKey: "root",
    type: "GENERATION",
    name: "classify-intent",
    start: 205,
    end: 818,
    model: "gpt-4o-mini",
    usage: [412, 31],
    ttft: 158,
    modelParameters: { temperature: 0, max_tokens: 128 },
    input: {
      messages: [
        {
          role: "system",
          content:
            "Classify the support request. Return JSON: " +
            "{intent, urgency, sentiment}.",
        },
        { role: "user", content: CUSTOMER_MESSAGE },
      ],
    },
    output: {
      intent: "billing.duplicate_charge",
      urgency: "medium",
      sentiment: "frustrated",
    },
  },
  {
    key: "load-context",
    parentKey: "root",
    type: "SPAN",
    name: "load-context",
    start: 858,
    end: 1512,
    input: { customer_id: "cus_LqT4v8" },
    output: { sources: ["crm", "billing", "tickets"], cache_hit: false },
  },
  {
    key: "crm",
    parentKey: "load-context",
    type: "TOOL",
    name: "crm.get-customer",
    start: 881,
    end: 1129,
    input: { customer_id: "cus_LqT4v8" },
    output: {
      name: "Maya Chen",
      company: "Acme Robotics",
      plan: "pro",
      seats: 14,
      mrr_usd: 49,
      customer_since: "2024-03-12",
      churn_risk: "low",
    },
    metadata: { provider: "salesforce" },
  },
  {
    key: "billing",
    parentKey: "load-context",
    type: "TOOL",
    name: "billing.list-invoices",
    start: 886,
    end: 1494,
    input: { customer_id: "cus_LqT4v8", period: "2026-06..2026-07" },
    output: {
      invoices: [
        {
          id: "inv_20260701",
          amount_usd: 49.0,
          status: "paid",
          charged_at: "2026-07-01T06:12:04Z",
        },
        {
          id: "inv_20260701-2",
          amount_usd: 49.0,
          status: "paid",
          charged_at: "2026-07-01T06:12:09Z",
        },
      ],
    },
    metadata: { provider: "stripe", api_version: "2026-06-01" },
  },
  {
    key: "tickets",
    parentKey: "load-context",
    type: "TOOL",
    name: "tickets.search",
    start: 893,
    end: 1263,
    input: { query: "duplicate charge cus_LqT4v8", limit: 5 },
    output: {
      hits: 1,
      tickets: [
        {
          id: "TCK-4821",
          subject: "Card charged twice on renewal",
          status: "closed",
          resolution: "refund",
          opened_at: "2026-02-17",
        },
      ],
    },
    metadata: { provider: "zendesk" },
  },
  {
    key: "llm-1",
    parentKey: "root",
    type: "GENERATION",
    name: "llm.chat",
    start: 1561,
    end: 3389,
    model: "gpt-4o",
    usage: [1846, 94],
    ttft: 243,
    modelParameters: {
      temperature: 0.3,
      max_tokens: 1024,
      tool_choice: "auto",
    },
    input: {
      messages: [
        { role: "system", content: AGENT_SYSTEM_PROMPT },
        { role: "user", content: CUSTOMER_MESSAGE },
        {
          role: "assistant",
          content:
            "Context: pro plan customer (Maya Chen, Acme Robotics), two $49 " +
            "invoices paid 5s apart on 2026-07-01, one prior ticket with the " +
            "same pattern resolved by refund.",
        },
      ],
    },
    output: {
      content: null,
      tool_calls: [
        {
          id: "call_qL83mN",
          type: "function",
          function: {
            name: "stripe_find_charges",
            arguments:
              '{"customer_id":"cus_LqT4v8","period":"2026-07","amount_usd":49}',
          },
        },
      ],
    },
  },
  {
    key: "find-charges",
    parentKey: "root",
    type: "TOOL",
    name: "stripe.find-charges",
    start: 3441,
    end: 4118,
    input: { customer_id: "cus_LqT4v8", period: "2026-07", amount_usd: 49 },
    output: {
      charges: [
        {
          id: "ch_3PqK8r",
          amount_usd: 49.0,
          created: "2026-07-01T06:12:04Z",
          invoice: "inv_20260701",
          payment_intent: "pi_3PqK8q",
        },
        {
          id: "ch_3PqK9b",
          amount_usd: 49.0,
          created: "2026-07-01T06:12:09Z",
          invoice: "inv_20260701-2",
          payment_intent: "pi_3PqK8q",
        },
      ],
      duplicate_confidence: 0.98,
      note: "same payment_intent — retry produced a second capture",
    },
    metadata: { provider: "stripe", api_version: "2026-06-01" },
  },
  {
    key: "llm-2",
    parentKey: "root",
    type: "GENERATION",
    name: "llm.chat",
    start: 4172,
    end: 5924,
    model: "gpt-4o",
    usage: [2413, 72],
    ttft: 212,
    modelParameters: {
      temperature: 0.3,
      max_tokens: 1024,
      tool_choice: "auto",
    },
    input: {
      messages: [
        { role: "system", content: AGENT_SYSTEM_PROMPT },
        {
          role: "tool",
          tool_call_id: "call_qL83mN",
          content:
            '{"charges":[{"id":"ch_3PqK8r"},{"id":"ch_3PqK9b"}],' +
            '"duplicate_confidence":0.98}',
        },
      ],
    },
    output: {
      content: null,
      tool_calls: [
        {
          id: "call_xT19vB",
          type: "function",
          function: {
            name: "stripe_create_refund",
            arguments:
              '{"charge_id":"ch_3PqK9b","reason":"duplicate",' +
              '"idempotency_key":"refund-cus_LqT4v8-20260709"}',
          },
        },
      ],
    },
  },
  {
    key: "refund",
    parentKey: "root",
    type: "TOOL",
    name: "stripe.create-refund",
    start: 5978,
    end: 6893,
    input: {
      charge_id: "ch_3PqK9b",
      reason: "duplicate",
      idempotency_key: "refund-cus_LqT4v8-20260709",
    },
    output: {
      refund_id: "re_8Fj2kQ",
      status: "succeeded",
      amount_usd: 49.0,
      charge_id: "ch_3PqK9b",
      expected_arrival: "5-10 business days",
    },
    metadata: { provider: "stripe", api_version: "2026-06-01" },
  },
  {
    key: "llm-3",
    parentKey: "root",
    type: "GENERATION",
    name: "llm.chat",
    start: 6947,
    end: 8731,
    model: "gpt-4o",
    usage: [2987, 141],
    ttft: 264,
    modelParameters: {
      temperature: 0.3,
      max_tokens: 1024,
      tool_choice: "auto",
    },
    input: {
      messages: [
        { role: "system", content: AGENT_SYSTEM_PROMPT },
        {
          role: "tool",
          tool_call_id: "call_xT19vB",
          content: '{"refund_id":"re_8Fj2kQ","status":"succeeded"}',
        },
      ],
    },
    output: {
      content:
        "Resolution complete. Verified duplicate capture (same " +
        "payment_intent, 5s apart), refunded ch_3PqK9b (re_8Fj2kQ, $49.00). " +
        "Root cause: payment retry double-capture — flag to payments team. " +
        "Ready to draft the customer reply.",
      tool_calls: [],
    },
  },
  {
    key: "draft",
    parentKey: "root",
    type: "GENERATION",
    name: "draft-response",
    start: 8790,
    end: 10377,
    model: "gpt-4o",
    usage: [1312, 187],
    ttft: 231,
    modelParameters: { temperature: 0.7, max_tokens: 512 },
    input: {
      messages: [
        {
          role: "system",
          content:
            "Draft a friendly, concise support reply. Facts only from the " +
            "resolution summary. Match the customer's tone; no corporate " +
            "boilerplate.",
        },
        {
          role: "user",
          content:
            "Resolution: duplicate $49 charge confirmed (retry bug), " +
            "refund re_8Fj2kQ issued, arrives in 5-10 business days. " +
            "Customer: Maya, frustrated but polite.",
        },
      ],
    },
    output: { reply: FINAL_REPLY },
  },
  {
    key: "guard-out",
    parentKey: "root",
    type: "GUARDRAIL",
    name: "guardrail.output",
    start: 10426,
    end: 10557,
    input: { text: FINAL_REPLY, checks: ["policy", "tone", "pii"] },
    output: { verdict: "pass", tone: "empathetic", policy_violations: [] },
    metadata: { provider: "internal", policy: "support-v2" },
  },
  {
    key: "send",
    parentKey: "root",
    type: "TOOL",
    name: "zendesk.send-reply",
    start: 10609,
    end: 10881,
    input: { thread_id: "thread_7Hf3kX", body: FINAL_REPLY },
    output: { message_id: "msg_9uTb4w", status: "sent" },
    metadata: { provider: "zendesk" },
  },
];

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const withV4 = params["v4"] as boolean;

  // The prefix IS the trace id (no "-trace" suffix): the id shows in the
  // trace header, so a demo seeded with a hex-looking prefix (e.g.
  // --id-prefix 0198f2ab41c7e93d) reads like a production trace on camera.
  const traceId = ctx.idPrefix;
  const sessionId = `${ctx.idPrefix}-thread`;
  const traceTimestamp = utcDayStartMs();

  if (ctx.dryRun) {
    return {
      scenario: "support-agent",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [traceId],
      sessionIds: [sessionId],
      counts: {
        traces: 1,
        observations: PLAN.length,
        events: withV4 ? PLAN.length + 1 : 0,
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

  const root = PLAN[0];
  const trace = createTrace({
    id: traceId,
    project_id: ctx.projectId,
    environment: ctx.environment,
    name: "support-copilot",
    timestamp: traceTimestamp,
    user_id: "maya.chen@acme-robotics.io",
    session_id: sessionId,
    release: "2026.07.03-1",
    version: "copilot-v3.2",
    tags: ["support", "billing", "tier:pro"],
    public: false,
    bookmarked: false,
    metadata: {
      scenario: "support-agent",
      customer_id: "cus_LqT4v8",
      channel: "in-app-chat",
    },
    input: JSON.stringify(root.input),
    output: JSON.stringify(root.output),
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
  });

  const keyToId = new Map<string, string>(
    PLAN.map((p, i) => [p.key, `${ctx.idPrefix}-obs-${i}`]),
  );

  const observations: ObservationRecordInsertType[] = PLAN.map((p) => {
    const prices = p.model ? MODEL_PRICES[p.model] : null;
    const [usageInput, usageOutput] = p.usage ?? [0, 0];
    const inputCost = prices ? usageInput * prices.input : 0;
    const outputCost = prices ? usageOutput * prices.output : 0;

    return createObservation({
      id: keyToId.get(p.key)!,
      trace_id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      type: p.type,
      parent_observation_id:
        p.parentKey === null ? null : (keyToId.get(p.parentKey) ?? null),
      name: p.name,
      start_time: traceTimestamp + p.start,
      end_time: traceTimestamp + p.end,
      completion_start_time:
        p.ttft !== undefined ? traceTimestamp + p.start + p.ttft : null,
      level: "DEFAULT",
      status_message: null,
      version: null,
      input: p.input !== undefined ? JSON.stringify(p.input) : null,
      output: p.output !== undefined ? JSON.stringify(p.output) : null,
      metadata: { scenario: "support-agent", ...p.metadata },
      provided_model_name: p.model ?? null,
      internal_model_id: null,
      model_parameters: p.modelParameters
        ? JSON.stringify(p.modelParameters)
        : "{}",
      // Empty fields stay explicit for non-generations: the createObservation
      // factory would otherwise fill non-empty usage/cost defaults.
      ...(prices
        ? {
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
            provided_cost_details: { input: inputCost, output: outputCost },
            cost_details: {
              input: inputCost,
              output: outputCost,
              total: inputCost + outputCost,
            },
            total_cost: inputCost + outputCost,
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
    `writing 1 support-copilot trace, ${observations.length} observations${withV4 ? `, ${events.length} events` : ""}`,
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
    scenario: "support-agent",
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

export const supportAgentScenario: ScenarioDefinition = {
  name: "support-agent",
  description:
    "One demo-grade, fully handcrafted trace: a customer-support copilot resolving a duplicate-charge refund — input guardrail → intent classification → parallel context fan-out (CRM/billing/tickets) → 3-turn ReAct loop (llm.chat + Stripe tools) → drafted reply → output guardrail → send. Real-looking payloads, per-model token/cost numbers, deterministic timings. Built for videos/screenshots; exercises the graph view's Aggregated (llm.chat 3/3 loop) vs Expanded (as-it-ran DAG with fork/join) modes.",
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
