import type { NormalizedIOFixture } from "../fixture-types";

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
            toolType: "tool_call",
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

/**
 * LangChain dict serialization (`.dict()` / LangSmith-style): messages carry
 * `type: "tool"` instead of a `role` key. A ToolMessage dict with a
 * tool_call_id must become a tool-result part — not a text part titled by
 * `name` — and `name` is the tool's name, never a participant name.
 */
export const langchainDictToolMessageFixture = {
  name: "normalizes a LangChain dict-serialized tool message",
  spanIO: {
    input: [
      {
        content: "It's 60 degrees and foggy.",
        additional_kwargs: {},
        response_metadata: {},
        type: "tool",
        name: "search",
        id: "220ba511-6816-4d1a-8acf-8e5791c2d88e",
        tool_call_id: "call_pNLR4DoZiptb5xGlb299QsoN",
        artifact: null,
        status: "success",
      },
    ],
    output: undefined,
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        id: "220ba511-6816-4d1a-8acf-8e5791c2d88e",
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: "call_pNLR4DoZiptb5xGlb299QsoN",
            toolName: "search",
            output: "It's 60 degrees and foggy.",
          },
        ],
        source: "input",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

export const langgraphProductionShapeFixture = {
  name: "normalizes an anonymized LangGraph production-shaped span",
  otel: {
    scopeSpan: {
      scope: {
        name: "langfuse-sdk",
        version: "4.14.1",
        attributes: [
          {
            key: "synthetic.metadata.001",
            value: {
              stringValue: "synthetic-value-001",
            },
          },
        ],
      },
      spans: [
        {
          traceId: Buffer.from("00000000000000000000000000000001", "hex"),
          spanId: Buffer.from("0000000000000001", "hex"),
          parentSpanId: Buffer.from("0000000000000002", "hex"),
          name: "synthetic_name_001",
          kind: 1,
          attributes: [
            {
              key: "synthetic.metadata.002",
              value: {
                stringValue: "synthetic-value-002",
              },
            },
            {
              key: "synthetic.metadata.003",
              value: {
                stringValue: "synthetic-value-003",
              },
            },
            {
              key: "langfuse.trace.metadata.participant-id",
              value: {
                stringValue: "synthetic-value-004",
              },
            },
            {
              key: "langfuse.trace.metadata.session-id",
              value: {
                stringValue: "synthetic-value-005",
              },
            },
            {
              key: "langfuse.trace.metadata.ls_integration",
              value: {
                stringValue: "synthetic-value-006",
              },
            },
            {
              key: "langfuse.observation.input",
              value: {
                stringValue:
                  '[{"role":"system","content":[{"type":"text","text":"You are a helpful synthetic assistant 007.","synthetic_field_001":{"type":"You are a helpful synthetic assistant 008.","synthetic_field_002":"You are a helpful synthetic assistant 009."}}]},{"role":"user","content":[{"type":"text","text":"Synthetic user request 010."}]},{"role":"assistant","content":[{"text":"Synthetic assistant response 011.","type":"text"},{"id":"call_001","caller":{"type":"direct"},"input":{"synthetic_field_003":"Synthetic assistant response 012."},"name":"synthetic_tool_001","type":"tool_use"},{"id":"call_002","caller":{"type":"direct"},"input":{"synthetic_field_003":"Synthetic assistant response 013."},"name":"synthetic_tool_001","type":"tool_use"}],"tool_calls":[{"name":"synthetic_tool_001","args":{"synthetic_field_003":"Synthetic assistant response 014."},"id":"call_001","type":"tool_call"},{"name":"synthetic_tool_001","args":{"synthetic_field_003":"Synthetic assistant response 015."},"id":"call_002","type":"tool_call"}]},{"role":"tool","content":"synthetic-value-016","tool_call_id":"call_001"},{"role":"tool","content":"synthetic-value-017","tool_call_id":"call_002"},{"role":"tool","content":{"name":"synthetic_tool_001","synthetic_field_004":{"properties":{"synthetic_field_003":{"description":"Synthetic description 018.","type":"string"}},"required":["synthetic_field_003"],"type":"object"},"description":"Synthetic description 019.","synthetic_field_001":{"type":"synthetic-value-020","synthetic_field_002":"synthetic-value-021"}}}]',
              },
            },
            {
              key: "langfuse.observation.model.parameters",
              value: {
                stringValue:
                  '{"synthetic_field_005":1,"synthetic_field_006":32000}',
              },
            },
            {
              key: "langfuse.observation.metadata.tags",
              value: {
                stringValue: '["synthetic-value-022"]',
              },
            },
            {
              key: "langfuse.observation.metadata.participant-id",
              value: {
                stringValue: "synthetic-value-023",
              },
            },
            {
              key: "langfuse.observation.metadata.session-id",
              value: {
                stringValue: "synthetic-value-024",
              },
            },
            {
              key: "langfuse.observation.metadata.ls_integration",
              value: {
                stringValue: "synthetic-value-025",
              },
            },
            {
              key: "langfuse.observation.metadata.langgraph_step",
              value: {
                intValue: "synthetic-value-026",
              },
            },
            {
              key: "langfuse.observation.metadata.langgraph_node",
              value: {
                stringValue: "synthetic-value-027",
              },
            },
            {
              key: "langfuse.observation.metadata.langgraph_triggers",
              value: {
                stringValue: '["synthetic-value-028"]',
              },
            },
            {
              key: "langfuse.observation.metadata.langgraph_path",
              value: {
                stringValue: '["synthetic-value-029","synthetic-value-030"]',
              },
            },
            {
              key: "langfuse.observation.metadata.langgraph_checkpoint_ns",
              value: {
                stringValue: "synthetic-value-031",
              },
            },
            {
              key: "langfuse.observation.metadata.checkpoint_ns",
              value: {
                stringValue: "synthetic-value-032",
              },
            },
            {
              key: "langfuse.observation.metadata.ls_provider",
              value: {
                stringValue: "synthetic-value-033",
              },
            },
            {
              key: "langfuse.observation.metadata.ls_model_name",
              value: {
                stringValue: "synthetic-value-034",
              },
            },
            {
              key: "langfuse.observation.metadata.ls_model_type",
              value: {
                stringValue: "synthetic-value-035",
              },
            },
            {
              key: "langfuse.observation.metadata.ls_temperature",
              value: {
                stringValue: "synthetic-value-036",
              },
            },
            {
              key: "langfuse.observation.metadata.ls_max_tokens",
              value: {
                intValue: "synthetic-value-037",
              },
            },
            {
              key: "langfuse.observation.metadata.lc_versions",
              value: {
                stringValue:
                  '{"synthetic_field_007":"synthetic-value-038","synthetic_field_008":"synthetic-value-039","synthetic_field_009":"synthetic-value-040"}',
              },
            },
            {
              key: "langfuse.observation.metadata.ocs_provider_type",
              value: {
                stringValue: "synthetic-value-041",
              },
            },
            {
              key: "langfuse.observation.type",
              value: {
                stringValue: "synthetic-value-042",
              },
            },
            {
              key: "langfuse.observation.output",
              value: {
                stringValue:
                  '{"role":"assistant","content":"Synthetic assistant response 043."}',
              },
            },
            {
              key: "langfuse.observation.model.name",
              value: {
                stringValue: "synthetic-value-044",
              },
            },
            {
              key: "langfuse.observation.usage_details",
              value: {
                stringValue:
                  '{"synthetic_field_010":13252,"synthetic_field_011":0,"input":1,"output":406,"synthetic_field_012":0,"synthetic_field_013":13252}',
              },
            },
          ],
          status: {},
        },
      ],
    },
    resourceAttributes: {
      "telemetry.sdk.language": "python",
      "telemetry.sdk.name": "opentelemetry",
      "telemetry.sdk.version": "1.38.0",
      "service.name": "synthetic-service",
    },
  },
  spanIO: {
    input:
      '[{"role":"system","content":[{"type":"text","text":"You are a helpful synthetic assistant 007.","synthetic_field_001":{"type":"You are a helpful synthetic assistant 008.","synthetic_field_002":"You are a helpful synthetic assistant 009."}}]},{"role":"user","content":[{"type":"text","text":"Synthetic user request 010."}]},{"role":"assistant","content":[{"text":"Synthetic assistant response 011.","type":"text"},{"id":"call_001","caller":{"type":"direct"},"input":{"synthetic_field_003":"Synthetic assistant response 012."},"name":"synthetic_tool_001","type":"tool_use"},{"id":"call_002","caller":{"type":"direct"},"input":{"synthetic_field_003":"Synthetic assistant response 013."},"name":"synthetic_tool_001","type":"tool_use"}],"tool_calls":[{"name":"synthetic_tool_001","args":{"synthetic_field_003":"Synthetic assistant response 014."},"id":"call_001","type":"tool_call"},{"name":"synthetic_tool_001","args":{"synthetic_field_003":"Synthetic assistant response 015."},"id":"call_002","type":"tool_call"}]},{"role":"tool","content":"synthetic-value-016","tool_call_id":"call_001"},{"role":"tool","content":"synthetic-value-017","tool_call_id":"call_002"},{"role":"tool","content":{"name":"synthetic_tool_001","synthetic_field_004":{"properties":{"synthetic_field_003":{"description":"Synthetic description 018.","type":"string"}},"required":["synthetic_field_003"],"type":"object"},"description":"Synthetic description 019.","synthetic_field_001":{"type":"synthetic-value-020","synthetic_field_002":"synthetic-value-021"}}}]',
    output:
      '{"role":"assistant","content":"Synthetic assistant response 043."}',
    metadata: {
      resourceAttributes: {
        "telemetry.sdk.language": "python",
        "telemetry.sdk.name": "opentelemetry",
        "telemetry.sdk.version": "1.38.0",
        "service.name": "synthetic-service",
      },
      scope: {
        name: "langfuse-sdk",
        version: "4.14.1",
        attributes: {
          "synthetic.metadata.001": "synthetic-value-001",
        },
      },
      tags: '["synthetic-value-022"]',
      "participant-id": "synthetic-value-004",
      "session-id": "synthetic-value-005",
      ls_integration: "synthetic-value-006",
      langgraph_step: '{"intValue":"synthetic-value-026"}',
      langgraph_node: "synthetic-value-027",
      langgraph_triggers: '["synthetic-value-028"]',
      langgraph_path: '["synthetic-value-029","synthetic-value-030"]',
      langgraph_checkpoint_ns: "synthetic-value-031",
      checkpoint_ns: "synthetic-value-032",
      ls_provider: "synthetic-value-033",
      ls_model_name: "synthetic-value-034",
      ls_model_type: "synthetic-value-035",
      ls_temperature: "synthetic-value-036",
      ls_max_tokens: '{"intValue":"synthetic-value-037"}',
      lc_versions:
        '{"synthetic_field_007":"synthetic-value-038","synthetic_field_008":"synthetic-value-039","synthetic_field_009":"synthetic-value-040"}',
      ocs_provider_type: "synthetic-value-041",
    },
  },
  expected: {
    messages: [
      {
        role: "system",
        parts: [
          {
            type: "text",
            text: "You are a helpful synthetic assistant 007.",
            providerMetadata: {
              synthetic_field_001: {
                type: "You are a helpful synthetic assistant 008.",
                synthetic_field_002:
                  "You are a helpful synthetic assistant 009.",
              },
            },
          },
        ],
        source: "input",
      },
      {
        role: "user",
        parts: [
          {
            type: "text",
            text: "Synthetic user request 010.",
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Synthetic assistant response 011.",
          },
          {
            type: "tool-call",
            toolCallId: "call_001",
            toolName: "synthetic_tool_001",
            input: {
              synthetic_field_003: "Synthetic assistant response 012.",
            },
            toolType: "tool_use",
            providerMetadata: { caller: { type: "direct" } },
          },
          {
            type: "tool-call",
            toolCallId: "call_002",
            toolName: "synthetic_tool_001",
            input: {
              synthetic_field_003: "Synthetic assistant response 013.",
            },
            toolType: "tool_use",
            providerMetadata: { caller: { type: "direct" } },
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: "call_001",
            output: "synthetic-value-016",
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: "call_002",
            output: "synthetic-value-017",
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "data",
            value: {
              name: "synthetic_tool_001",
              synthetic_field_004: {
                properties: {
                  synthetic_field_003: {
                    description: "Synthetic description 018.",
                    type: "string",
                  },
                },
                required: ["synthetic_field_003"],
                type: "object",
              },
              description: "Synthetic description 019.",
              synthetic_field_001: {
                type: "synthetic-value-020",
                synthetic_field_002: "synthetic-value-021",
              },
            },
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Synthetic assistant response 043.",
          },
        ],
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;
