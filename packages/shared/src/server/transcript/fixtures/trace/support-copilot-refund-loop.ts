import type { TranscriptFixture } from "../fixture-types";

/**
 * Adapted support-agent seed: every generation replays the full conversation.
 * Classification, calls, results, resolution, and final reply form one thread.
 * TOOL names match model call names; history preserves tool_call_id links.
 * Context-loading tools without model calls remain outside the transcript.
 */

const traceId = "sa2026083102o";
const projectId = "sa2026083102o-project";
const rootSpanId = "t-sa2026083102o";
const agentId = "sa2026083102o-root";
const loadContextId = "sa2026083102o-load";

const customerId = "cus_LqT4v8";
const refundId = "re_18Lk1Q";
const findChargesToolCallId = "call_find_2";
const createRefundToolCallId = "call_act_2";

const customerMessage =
  "Hi — I was charged twice for my subscription this month (invoices inv_20260709 and inv_20260709-2, $99 each). Can you refund the duplicate?";
const copilotSystemPrompt =
  "You are Acme's support copilot. Resolve the customer's billing issue end-to-end using the available tools.";
const finalReply =
  "Hi Jordan, thanks for flagging this! I've confirmed the duplicate $99.00 charge and issued a refund (re_18Lk1Q). You should see it back on your card within 5–10 business days.";

// Tool-call arguments as the model emitted them (a JSON string inside the
// chat-completions payload) and as the TOOL observation received them.
const findChargesArguments = { customer_id: customerId, period: "2026-07" };
const createRefundArguments = { charge_id: "ch_3PqK9b", reason: "duplicate" };

const initialHistory = [
  { role: "system", content: copilotSystemPrompt },
  { role: "user", content: customerMessage },
];
const classification = {
  role: "assistant",
  content: JSON.stringify({
    intent: "billing.duplicate_charge",
    urgency: "medium",
    sentiment: "frustrated",
  }),
};
const findChargesCall = {
  role: "assistant",
  content: null,
  tool_calls: [
    {
      id: findChargesToolCallId,
      type: "function",
      function: {
        name: "stripe_find_charges",
        arguments: JSON.stringify(findChargesArguments),
      },
    },
  ],
};
const charges = {
  charges: [{ id: "ch_3PqK8r" }, { id: "ch_3PqK9b" }],
  duplicate_confidence: 0.98,
};
const findChargesResult = {
  role: "tool",
  tool_call_id: findChargesToolCallId,
  content: JSON.stringify(charges),
};
const refundCall = {
  role: "assistant",
  content: null,
  tool_calls: [
    {
      id: createRefundToolCallId,
      type: "function",
      function: {
        name: "stripe_create_refund",
        arguments: JSON.stringify(createRefundArguments),
      },
    },
  ],
};
const refund = { refund_id: refundId, status: "succeeded", amount_usd: 99 };
const refundResult = {
  role: "tool",
  tool_call_id: createRefundToolCallId,
  content: JSON.stringify(refund),
};
const classifiedHistory = [...initialHistory, classification];
const chargesHistory = [
  ...classifiedHistory,
  findChargesCall,
  findChargesResult,
];
const refundHistory = [...chargesHistory, refundCall, refundResult];
const resolution = { role: "assistant", content: "Resolution complete." };

const metadata = {
  channel: "in-app-chat",
  customer_id: customerId,
  kind: "ok",
  scenario: "support-agent-seed",
};

const common = {
  trace_id: traceId,
  project_id: projectId,
  metadata,
};

const observations = [
  {
    ...common,
    metadata: { ...metadata, plan: "pro" },
    id: agentId,
    parent_observation_id: rootSpanId,
    type: "AGENT",
    name: "support-copilot",
    provided_model_name: null,
    start_time: "2026-08-31T12:33:14.000Z",
    end_time: "2026-08-31T12:33:25.052Z",
    input: JSON.stringify({
      message: customerMessage,
      customer_id: customerId,
    }),
    output: JSON.stringify({
      reply: finalReply,
      resolution: "refund_issued",
      refund_id: refundId,
    }),
  },
  {
    ...common,
    id: rootSpanId,
    parent_observation_id: null,
    type: "SPAN",
    name: "support-copilot",
    provided_model_name: null,
    start_time: "2026-08-31T12:33:14.000Z",
    end_time: null,
    input: JSON.stringify({
      message: customerMessage,
      customer_id: customerId,
    }),
    output: JSON.stringify({
      reply: finalReply,
      resolution: "refund_issued",
      refund_id: refundId,
    }),
  },
  {
    ...common,
    id: "sa2026083102o-gin",
    parent_observation_id: agentId,
    type: "GUARDRAIL",
    name: "guardrail.input",
    provided_model_name: null,
    start_time: "2026-08-31T12:33:14.045Z",
    end_time: "2026-08-31T12:33:14.168Z",
    input: JSON.stringify({
      text: customerMessage,
      checks: ["prompt_injection", "pii"],
    }),
    output: JSON.stringify({ verdict: "pass", flags: [] }),
  },
  {
    ...common,
    id: "sa2026083102o-cls",
    parent_observation_id: agentId,
    type: "GENERATION",
    name: "classify-intent",
    provided_model_name: "gpt-5.4-mini",
    start_time: "2026-08-31T12:33:14.205Z",
    end_time: "2026-08-31T12:33:14.818Z",
    input: JSON.stringify({
      messages: initialHistory,
    }),
    output: JSON.stringify(classification),
  },
  {
    ...common,
    id: loadContextId,
    parent_observation_id: agentId,
    type: "SPAN",
    name: "load-context",
    provided_model_name: null,
    start_time: "2026-08-31T12:33:14.858Z",
    end_time: "2026-08-31T12:33:15.512Z",
    input: JSON.stringify({ customer_id: customerId }),
    output: JSON.stringify({ sources: ["crm", "billing", "tickets"] }),
  },
  {
    ...common,
    id: "sa2026083102o-crm",
    parent_observation_id: loadContextId,
    type: "TOOL",
    name: "crm.get-customer",
    provided_model_name: null,
    start_time: "2026-08-31T12:33:14.881Z",
    end_time: "2026-08-31T12:33:15.129Z",
    input: JSON.stringify({ customer_id: customerId }),
    output: JSON.stringify({ name: "Jordan Rivera", plan: "pro", mrr_usd: 99 }),
  },
  {
    ...common,
    id: "sa2026083102o-bill",
    parent_observation_id: loadContextId,
    type: "TOOL",
    name: "billing.list-invoices",
    provided_model_name: null,
    start_time: "2026-08-31T12:33:14.886Z",
    end_time: "2026-08-31T12:33:15.994Z",
    input: JSON.stringify({
      customer_id: customerId,
      period: "2026-06..2026-07",
    }),
    output: JSON.stringify({
      invoices: [{ id: "inv_20260709" }, { id: "inv_20260709-2" }],
    }),
  },
  {
    ...common,
    id: "sa2026083102o-tix",
    parent_observation_id: loadContextId,
    type: "TOOL",
    name: "tickets.search",
    provided_model_name: null,
    start_time: "2026-08-31T12:33:14.893Z",
    end_time: "2026-08-31T12:33:15.263Z",
    input: JSON.stringify({ query: "duplicate charge cus_LqT4v8" }),
    output: JSON.stringify({ hits: 1 }),
  },
  {
    ...common,
    id: "sa2026083102o-llm1",
    parent_observation_id: agentId,
    type: "GENERATION",
    name: "llm.chat",
    provided_model_name: "gpt-5.4",
    start_time: "2026-08-31T12:33:16.561Z",
    end_time: "2026-08-31T12:33:17.389Z",
    input: JSON.stringify({
      messages: classifiedHistory,
    }),
    output: JSON.stringify({
      content: null,
      tool_calls: [
        {
          id: findChargesToolCallId,
          type: "function",
          function: {
            name: "stripe_find_charges",
            arguments: JSON.stringify(findChargesArguments),
          },
        },
      ],
    }),
  },
  {
    ...common,
    id: "sa2026083102o-find",
    parent_observation_id: agentId,
    type: "TOOL",
    name: "stripe_find_charges",
    provided_model_name: null,
    start_time: "2026-08-31T12:33:17.441Z",
    end_time: "2026-08-31T12:33:18.118Z",
    input: JSON.stringify(findChargesArguments),
    output: JSON.stringify(charges),
  },
  {
    ...common,
    id: "sa2026083102o-llm2",
    parent_observation_id: agentId,
    type: "GENERATION",
    name: "llm.chat",
    provided_model_name: "gpt-5.4",
    start_time: "2026-08-31T12:33:18.172Z",
    end_time: "2026-08-31T12:33:19.924Z",
    input: JSON.stringify({
      messages: chargesHistory,
    }),
    output: JSON.stringify({
      content: null,
      tool_calls: [
        {
          id: createRefundToolCallId,
          type: "function",
          function: {
            name: "stripe_create_refund",
            arguments: JSON.stringify(createRefundArguments),
          },
        },
      ],
    }),
  },
  {
    ...common,
    id: "sa2026083102o-ref",
    parent_observation_id: agentId,
    type: "TOOL",
    name: "stripe_create_refund",
    provided_model_name: null,
    start_time: "2026-08-31T12:33:19.978Z",
    end_time: "2026-08-31T12:33:20.893Z",
    input: JSON.stringify(createRefundArguments),
    output: JSON.stringify(refund),
  },
  {
    ...common,
    id: "sa2026083102o-llm3",
    parent_observation_id: agentId,
    type: "GENERATION",
    name: "llm.chat",
    provided_model_name: "gpt-5.4",
    start_time: "2026-08-31T12:33:20.947Z",
    end_time: "2026-08-31T12:33:22.731Z",
    input: JSON.stringify({
      messages: refundHistory,
    }),
    output: JSON.stringify(resolution),
  },
  {
    ...common,
    id: "sa2026083102o-drf",
    parent_observation_id: agentId,
    type: "GENERATION",
    name: "draft-response",
    provided_model_name: "gpt-5.4",
    start_time: "2026-08-31T12:33:22.790Z",
    end_time: "2026-08-31T12:33:24.377Z",
    input: JSON.stringify({
      messages: [
        ...refundHistory,
        resolution,
        { role: "user", content: "Draft the reply." },
      ],
    }),
    output: JSON.stringify({ role: "assistant", content: finalReply }),
  },
  {
    ...common,
    id: "sa2026083102o-gout",
    parent_observation_id: agentId,
    type: "GUARDRAIL",
    name: "guardrail.output",
    provided_model_name: null,
    start_time: "2026-08-31T12:33:24.426Z",
    end_time: "2026-08-31T12:33:24.557Z",
    input: JSON.stringify({ text: finalReply }),
    output: JSON.stringify({ verdict: "pass" }),
  },
  {
    ...common,
    id: "sa2026083102o-send",
    parent_observation_id: agentId,
    type: "TOOL",
    name: "zendesk.send-reply",
    provided_model_name: null,
    start_time: "2026-08-31T12:33:24.609Z",
    end_time: "2026-08-31T12:33:24.881Z",
    input: JSON.stringify({ thread_id: "thread_7Hf3kX", body: finalReply }),
    output: JSON.stringify({ message_id: "msg_9uTb4w", status: "sent" }),
  },
];

export const supportCopilotRefundLoopFixture = {
  name: "support copilot refund loop with cumulative conversation history",
  scope: "trace",
  description:
    "Five generations replay all prior messages. Matching TOOL observations supply authoritative results, while replayed history is deduplicated and retains first-emitter provenance.",
  observations,
  expected: {
    threads: [
      {
        observations: ["cls", "llm1", "find", "llm2", "ref", "llm3", "drf"].map(
          (suffix) => ({ id: `sa2026083102o-${suffix}`, traceId }),
        ),
        messages: [
          {
            role: "system",
            source: "input",
            observationId: "sa2026083102o-cls",
            traceId,
            parts: [{ type: "text", text: copilotSystemPrompt }],
          },
          {
            role: "user",
            source: "input",
            observationId: "sa2026083102o-cls",
            traceId,
            parts: [{ type: "text", text: customerMessage }],
          },
          {
            role: "assistant",
            source: "output",
            observationId: "sa2026083102o-cls",
            traceId,
            parts: [{ type: "text", text: classification.content }],
          },
          {
            role: "assistant",
            source: "output",
            observationId: "sa2026083102o-llm1",
            traceId,
            parts: [
              {
                type: "tool-call",
                toolCallId: findChargesToolCallId,
                toolName: "stripe_find_charges",
                input: findChargesArguments,
                toolType: "function",
              },
            ],
          },
          {
            role: "tool",
            source: "output",
            observationId: "sa2026083102o-find",
            traceId,
            parts: [{ type: "data", value: charges }],
          },
          {
            role: "assistant",
            source: "output",
            observationId: "sa2026083102o-llm2",
            traceId,
            parts: [
              {
                type: "tool-call",
                toolCallId: createRefundToolCallId,
                toolName: "stripe_create_refund",
                input: createRefundArguments,
                toolType: "function",
              },
            ],
          },
          {
            role: "tool",
            source: "output",
            observationId: "sa2026083102o-ref",
            traceId,
            parts: [{ type: "data", value: refund }],
          },
          {
            role: "assistant",
            source: "output",
            observationId: "sa2026083102o-llm3",
            traceId,
            parts: [{ type: "text", text: "Resolution complete." }],
          },
          {
            role: "user",
            source: "input",
            observationId: "sa2026083102o-drf",
            traceId,
            parts: [{ type: "text", text: "Draft the reply." }],
          },
          {
            role: "assistant",
            source: "output",
            observationId: "sa2026083102o-drf",
            traceId,
            parts: [{ type: "text", text: finalReply }],
          },
        ],
      },
    ],
  },
} satisfies TranscriptFixture;
