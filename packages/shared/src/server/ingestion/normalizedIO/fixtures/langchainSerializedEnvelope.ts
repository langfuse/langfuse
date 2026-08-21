import type { NormalizedIOFixture } from "./types";

/**
 * LangChain serialization envelope: instrumentation that dumps LangChain
 * message objects (dumpd) wraps each message in constructor kwargs with the
 * class path in `id`. Covers role derivation from the class name, tool calls
 * inside kwargs, invalid_tool_calls (kept as flagged tool calls, excluded
 * from tool columns), and finish_reason nested under response_metadata.
 * tool_call_chunks are deliberately ignored (streaming deltas, redundant
 * with tool_calls — see README).
 */
export const langchainSerializedEnvelopeFixture = {
  name: "normalizes LangChain serialized message envelopes",
  spanIO: {
    input: JSON.stringify([
      {
        lc: 1,
        type: "constructor",
        id: ["langchain_core", "messages", "SystemMessage"],
        kwargs: { content: "You are a weather assistant." },
      },
      {
        lc: 1,
        type: "constructor",
        id: ["langchain_core", "messages", "HumanMessage"],
        kwargs: { content: "What is the weather in Zurich?" },
      },
    ]),
    output: JSON.stringify([
      {
        lc: 1,
        type: "constructor",
        id: ["langchain_core", "messages", "AIMessage"],
        kwargs: {
          content: "",
          tool_calls: [
            {
              id: "call_lc_1",
              name: "get_weather",
              args: { city: "Zurich" },
              type: "tool_call",
            },
          ],
          invalid_tool_calls: [
            {
              id: "call_lc_2",
              name: "get_weather",
              args: '{"city":',
              error: "Malformed args.",
              type: "invalid_tool_call",
            },
          ],
          response_metadata: { finish_reason: "tool_calls" },
        },
      },
      {
        lc: 1,
        type: "constructor",
        id: ["langchain_core", "messages", "ToolMessage"],
        kwargs: {
          content: "Weather service unavailable.",
          tool_call_id: "call_lc_1",
          status: "error",
          artifact: { attempts: 2 },
        },
      },
    ]),
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "system",
        parts: [{ type: "text", text: "You are a weather assistant." }],
        source: "input",
      },
      {
        role: "user",
        parts: [{ type: "text", text: "What is the weather in Zurich?" }],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: "call_lc_1",
            toolName: "get_weather",
            input: { city: "Zurich" },
          },
          {
            type: "tool-call",
            toolCallId: "call_lc_2",
            toolName: "get_weather",
            // Arguments stay the raw unparsable string.
            input: '{"city":',
            invalid: true,
            providerMetadata: { error: "Malformed args." },
          },
        ],
        finishReason: { type: "tool-calls", raw: "tool_calls" },
        source: "output",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: "call_lc_1",
            output: "Weather service unavailable.",
            isError: true,
            // Side-band artifact data, preserved without becoming output.
            providerMetadata: { artifact: { attempts: 2 } },
          },
        ],
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;
