import type { TranscriptFixture } from "../fixture-types";

/**
 * Support copilot resolving a duplicate-charge refund. Seeded scenario
 * (`support-agent-seed`), authored as ClickHouse `observations` seed records
 * for the shared `createObservation` test factory.
 * url: https://cloud.langfuse.com/project/clkpwwm0m000gmm094odg11gi/traces/sa2026083102o?observation=sa2026083102o-cls&timestamp=2026-08-31T12:33:16.561Z&traceId=sa2026083102o
 *
 * Trace tree (export order differs: the AGENT is listed before its parent SPAN)
 *
 * [SPAN] support-copilot                       t-sa2026083102o      root
 *   [AGENT] support-copilot                    sa2026083102o-root
 *     [GUARDRAIL]  guardrail.input             -gin
 *     [GENERATION] classify-intent  gpt-5.4-mini  -cls   in: system + user        out: JSON object (intent)
 *     [SPAN]       load-context                -load
 *       [TOOL]     crm.get-customer            -crm
 *       [TOOL]     billing.list-invoices       -bill
 *       [TOOL]     tickets.search              -tix
 *     [GENERATION] llm.chat         gpt-5.4    -llm1  in: system + user        out: tool_call stripe_find_charges
 *     [TOOL]       stripe.find-charges         -find  in: = llm1 call args     out: charges + duplicate_confidence
 *     [GENERATION] llm.chat         gpt-5.4    -llm2  in: system + tool(partial result, no tool_call_id)
 *                                                                              out: tool_call stripe_create_refund
 *     [TOOL]       stripe.create-refund        -ref   in: = llm2 call args     out: refund_id
 *     [GENERATION] llm.chat         gpt-5.4    -llm3  in: system only          out: "Resolution complete."
 *     [GENERATION] draft-response   gpt-5.4    -drf   in: user "Draft the reply."  out: JSON object {reply}
 *     [GUARDRAIL]  guardrail.output            -gout
 *     [TOOL]       zendesk.send-reply          -send
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
      messages: [
        { role: "system", content: "Classify the support request." },
        { role: "user", content: customerMessage },
      ],
    }),
    output: JSON.stringify({
      intent: "billing.duplicate_charge",
      urgency: "medium",
      sentiment: "frustrated",
    }),
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
      messages: [
        { role: "system", content: copilotSystemPrompt },
        { role: "user", content: customerMessage },
      ],
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
    name: "stripe.find-charges",
    provided_model_name: null,
    start_time: "2026-08-31T12:33:17.441Z",
    end_time: "2026-08-31T12:33:18.118Z",
    input: JSON.stringify(findChargesArguments),
    output: JSON.stringify({
      charges: [{ id: "ch_3PqK8r" }, { id: "ch_3PqK9b" }],
      duplicate_confidence: 0.98,
    }),
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
      messages: [
        { role: "system", content: copilotSystemPrompt },
        // Partial tool result, no tool_call_id: the full result lives only on
        // the sibling TOOL observation above.
        {
          role: "tool",
          content: JSON.stringify({ duplicate_confidence: 0.98 }),
        },
      ],
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
    name: "stripe.create-refund",
    provided_model_name: null,
    start_time: "2026-08-31T12:33:19.978Z",
    end_time: "2026-08-31T12:33:20.893Z",
    input: JSON.stringify(createRefundArguments),
    output: JSON.stringify({
      refund_id: refundId,
      status: "succeeded",
      amount_usd: 99,
    }),
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
      messages: [{ role: "system", content: copilotSystemPrompt }],
    }),
    output: JSON.stringify({ content: "Resolution complete.", tool_calls: [] }),
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
      messages: [{ role: "user", content: "Draft the reply." }],
    }),
    output: JSON.stringify({ reply: finalReply }),
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
  name: "support copilot refund loop with tool results only on TOOL observations",
  scope: "trace",
  description: [
    "Five generations under one AGENT, none of which replays earlier assistant output in its input.",
    "Tool results exist only as sibling TOOL observations whose input equals the preceding generation's tool-call arguments;",
    "the following generation carries a partial result in a `tool` message without a tool_call_id.",
    "`classify-intent` and `draft-response` output bare JSON objects rather than messages.",
    "The same system message repeats across the three `llm.chat` generations.",
    "Non-contributing types (SPAN, GUARDRAIL) are present, and the export lists the AGENT before its parent SPAN.",
  ].join(" "),
  observations,
  expected: undefined,
} satisfies TranscriptFixture;

export const supportCopilotRefundLoopWithoutSystemFixture = {
  ...supportCopilotRefundLoopFixture,
  name: "support copilot refund loop without system messages",
  description:
    "Same tree as the default case, built with `includeSystemMessages: false`. The repeated copilot system prompt and the classifier instruction disappear; everything else is unchanged.",
  config: { includeSystemMessages: false },
} satisfies TranscriptFixture;
