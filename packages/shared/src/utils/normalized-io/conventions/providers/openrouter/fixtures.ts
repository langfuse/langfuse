import type { NormalizedIOFixture } from "../fixture-types";

// Output envelopes are structurally preserved from captured OpenRouter
// Broadcast generations; text is shortened and anonymized. Inputs follow the
// Chat Completions request format those generations carry, with synthetic
// text. Input and output are stored as JSON strings.

type ExpectedMessage = NormalizedIOFixture["expected"]["messages"][number];

const getCustomerTool = {
  type: "function",
  function: {
    name: "get_customer",
    description:
      "Get the customer's plan, payment method, invoices and hardware order.",
    parameters: {
      type: "object",
      required: ["customer_id"],
      properties: { customer_id: { type: "string" } },
    },
  },
};

const getCustomerCall = {
  id: "call_0ffa9b40bdb94eafbb03ec75",
  index: 0,
  type: "function",
  function: {
    name: "get_customer",
    arguments: '{"customer_id": "cus_1001"}',
  },
};

const rawRequest = {
  model: "liquid/lfm-3-1.7b",
  tool_choice: "auto",
  user: "cus_1001",
  trace: {
    trace_id: "610c545746424882b29a768e99e7380c",
    trace_name: "support-assistant",
    environment: "staging",
  },
  _skin: "chat-completions",
};

const systemPrompt =
  "You are a support assistant. Look up the customer before answering.";
const question = "When does my order arrive?";
const customerRecord =
  "Maya, order ORD-70310 (receipt printer), status: processing";

const requestMessages = [
  { role: "system", content: systemPrompt },
  { role: "user", content: question },
];

const expectedRequestMessages: ExpectedMessage[] = [
  {
    role: "system",
    parts: [{ type: "text", text: systemPrompt }],
    source: "input",
  },
  {
    role: "user",
    parts: [{ type: "text", text: question }],
    source: "input",
  },
];

const expectedGetCustomerCall: ExpectedMessage["parts"][number] = {
  type: "tool-call",
  toolCallId: getCustomerCall.id,
  toolName: "get_customer",
  input: { customer_id: "cus_1001" },
  toolType: "function",
  providerMetadata: { index: 0 },
};

const expectedToolDefinitions: NormalizedIOFixture["expected"]["toolDefinitions"] =
  [
    {
      name: "get_customer",
      description: getCustomerTool.function.description,
      inputSchema: getCustomerTool.function.parameters,
      type: "function",
    },
  ];

const toolCallReasoning =
  "The user is asking when their order arrives. I should look up the customer first.";
const answerReasoning =
  "We need to answer the customer's question about the order. get_customer returned order ORD-70310 with status processing.";
const answer =
  "Hi Maya! Your receipt printer (order ORD-70310) is currently processing and ships within 2 business days.";

export const openRouterBroadcastFixtures: NormalizedIOFixture[] = [
  {
    name: "reads the text reply, reasoning and request tools of a Broadcast output",
    spanIO: {
      input: JSON.stringify({
        messages: [
          ...requestMessages,
          {
            role: "assistant",
            content: "",
            tool_calls: [getCustomerCall],
            reasoning_content: "",
          },
          {
            role: "tool",
            content: customerRecord,
            tool_call_id: getCustomerCall.id,
          },
        ],
      }),
      output: JSON.stringify({
        completion: answer,
        reasoning: answerReasoning,
        toolCalls: [],
        rawRequest: {
          model: rawRequest.model,
          tool_choice: rawRequest.tool_choice,
          tools: [getCustomerTool],
          user: rawRequest.user,
          trace: rawRequest.trace,
          _skin: rawRequest._skin,
        },
      }),
      metadata: null,
    },
    expected: {
      messages: [
        ...expectedRequestMessages,
        {
          role: "assistant",
          parts: [expectedGetCustomerCall],
          source: "input",
        },
        {
          role: "tool",
          parts: [
            {
              type: "tool-result",
              toolCallId: getCustomerCall.id,
              output: { type: "text", value: customerRecord },
            },
          ],
          source: "input",
        },
        {
          role: "assistant",
          parts: [
            {
              type: "reasoning",
              content: { kind: "text", text: answerReasoning },
            },
            { type: "text", text: answer },
          ],
          source: "output",
        },
      ],
      toolDefinitions: expectedToolDefinitions,
    },
  },
  {
    name: "reads the tool calls and reasoning of a Broadcast output with an empty completion",
    spanIO: {
      input: JSON.stringify({ messages: requestMessages }),
      output: JSON.stringify({
        completion: "",
        reasoning: toolCallReasoning,
        tools: [getCustomerTool],
        toolCalls: [getCustomerCall],
        rawRequest,
      }),
      metadata: null,
    },
    expected: {
      messages: [
        ...expectedRequestMessages,
        {
          role: "assistant",
          parts: [
            {
              type: "reasoning",
              content: { kind: "text", text: toolCallReasoning },
            },
            expectedGetCustomerCall,
          ],
          source: "output",
        },
      ],
      toolDefinitions: expectedToolDefinitions,
    },
  },
];
