import type { NormalizedIOFixture } from "../../fixture-types";

/**
 * Loosely structured shapes surfaced by the ChatML-corpus cross-check:
 * - Agno's Python-repr message strings ("role='...' content='...' name=None").
 * - BeeAI's roleless `{text}` message records.
 * - Koog/TraceLoop turns labeled `tool` without a tool_call_id: a JSON-string
 *   array of calls is a mislabeled assistant turn; plain text is the tool's
 *   response (tool-result), not conversation text.
 * - LangGraph putting the tool name in the role field (falls back to the
 *   contextual role, raw string preserved as senderName).
 * - Non-message payloads (function-span args/results) becoming data parts
 *   instead of being dropped.
 * - GenAI choice-event envelopes ({index, message, finish_reason}) unwrapping
 *   to the nested message.
 */
export const looseProviderMessageShapesFixture = {
  name: "normalizes loosely structured provider message shapes",
  spanIO: {
    input: [
      "role='system' content='Answer politely.' name=None tool_call_id=None",
      {
        text: "What is the weather in Berlin?",
        provider_extension: { confidence: 0.9 },
      },
      {
        role: "tool",
        content:
          '[{"function":{"name":"get_weather","arguments":"{\\"city\\":\\"Berlin\\"}"},"id":"call_loose_1","type":"function"}]',
      },
      { role: "tool", content: "Sunny, 22 degrees" },
      { role: "get_weather", content: "Sunny, 22 degrees (echo)" },
      { unrecognized_payload: { rows: [1, 2] } },
    ],
    output: {
      index: 0,
      message: { role: "assistant", content: "It is sunny in Berlin." },
      finish_reason: "stop",
      "event.name": "gen_ai.choice",
    },
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "system",
        parts: [{ type: "text", text: "Answer politely." }],
        source: "input",
      },
      {
        role: "user",
        parts: [
          {
            type: "text",
            text: "What is the weather in Berlin?",
            providerMetadata: {
              provider_extension: { confidence: 0.9 },
            },
          },
        ],
        source: "input",
      },
      {
        // Mislabeled assistant tool-call turn.
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: "call_loose_1",
            toolName: "get_weather",
            input: { city: "Berlin" },
            toolType: "function",
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: null,
            output: "Sunny, 22 degrees",
          },
        ],
        source: "input",
      },
      {
        role: "user",
        senderName: "get_weather",
        parts: [{ type: "text", text: "Sunny, 22 degrees (echo)" }],
        source: "input",
      },
      {
        role: "user",
        parts: [
          { type: "data", value: { unrecognized_payload: { rows: [1, 2] } } },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [{ type: "text", text: "It is sunny in Berlin." }],
        finishReason: { type: "stop", raw: "stop" },
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;
