import type { NormalizedIOFixture } from "./types";

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
    input: [
      {
        role: "system",
        content: [
          {
            type: "text",
            text: "You are a helpful synthetic assistant 007.",
            synthetic_field_001: {
              type: "You are a helpful synthetic assistant 008.",
              synthetic_field_002: "You are a helpful synthetic assistant 009.",
            },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Synthetic user request 010.",
          },
        ],
      },
      {
        role: "assistant",
        content: [
          {
            text: "Synthetic assistant response 011.",
            type: "text",
          },
          {
            id: "call_001",
            caller: {
              type: "direct",
            },
            input: {
              synthetic_field_003: "Synthetic assistant response 012.",
            },
            name: "synthetic_tool_001",
            type: "tool_use",
          },
          {
            id: "call_002",
            caller: {
              type: "direct",
            },
            input: {
              synthetic_field_003: "Synthetic assistant response 013.",
            },
            name: "synthetic_tool_001",
            type: "tool_use",
          },
        ],
        tool_calls: [
          {
            name: "synthetic_tool_001",
            args: {
              synthetic_field_003: "Synthetic assistant response 014.",
            },
            id: "call_001",
            type: "tool_call",
          },
          {
            name: "synthetic_tool_001",
            args: {
              synthetic_field_003: "Synthetic assistant response 015.",
            },
            id: "call_002",
            type: "tool_call",
          },
        ],
      },
      {
        role: "tool",
        content: "synthetic-value-016",
        tool_call_id: "call_001",
      },
      {
        role: "tool",
        content: "synthetic-value-017",
        tool_call_id: "call_002",
      },
      {
        role: "tool",
        content: {
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
    output: {
      role: "assistant",
      content: "Synthetic assistant response 043.",
    },
    metadata: {
      attributes: {
        "synthetic.metadata.002": "synthetic-value-002",
        "synthetic.metadata.003": "synthetic-value-003",
        "langfuse.trace.metadata.participant-id": "synthetic-value-004",
        "langfuse.trace.metadata.session-id": "synthetic-value-005",
        "langfuse.trace.metadata.ls_integration": "synthetic-value-006",
        "langfuse.observation.input": [
          {
            role: "system",
            content: [
              {
                type: "text",
                text: "You are a helpful synthetic assistant 007.",
                synthetic_field_001: {
                  type: "You are a helpful synthetic assistant 008.",
                  synthetic_field_002:
                    "You are a helpful synthetic assistant 009.",
                },
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Synthetic user request 010.",
              },
            ],
          },
          {
            role: "assistant",
            content: [
              {
                text: "Synthetic assistant response 011.",
                type: "text",
              },
              {
                id: "call_001",
                caller: {
                  type: "direct",
                },
                input: {
                  synthetic_field_003: "Synthetic assistant response 012.",
                },
                name: "synthetic_tool_001",
                type: "tool_use",
              },
              {
                id: "call_002",
                caller: {
                  type: "direct",
                },
                input: {
                  synthetic_field_003: "Synthetic assistant response 013.",
                },
                name: "synthetic_tool_001",
                type: "tool_use",
              },
            ],
            tool_calls: [
              {
                name: "synthetic_tool_001",
                args: {
                  synthetic_field_003: "Synthetic assistant response 014.",
                },
                id: "call_001",
                type: "tool_call",
              },
              {
                name: "synthetic_tool_001",
                args: {
                  synthetic_field_003: "Synthetic assistant response 015.",
                },
                id: "call_002",
                type: "tool_call",
              },
            ],
          },
          {
            role: "tool",
            content: "synthetic-value-016",
            tool_call_id: "call_001",
          },
          {
            role: "tool",
            content: "synthetic-value-017",
            tool_call_id: "call_002",
          },
          {
            role: "tool",
            content: {
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
        "langfuse.observation.model.parameters": {
          synthetic_field_005: 1,
          synthetic_field_006: 32000,
        },
        "langfuse.observation.metadata.tags": ["synthetic-value-022"],
        "langfuse.observation.metadata.participant-id": "synthetic-value-023",
        "langfuse.observation.metadata.session-id": "synthetic-value-024",
        "langfuse.observation.metadata.ls_integration": "synthetic-value-025",
        "langfuse.observation.metadata.langgraph_step": null,
        "langfuse.observation.metadata.langgraph_node": "synthetic-value-027",
        "langfuse.observation.metadata.langgraph_triggers": [
          "synthetic-value-028",
        ],
        "langfuse.observation.metadata.langgraph_path": [
          "synthetic-value-029",
          "synthetic-value-030",
        ],
        "langfuse.observation.metadata.langgraph_checkpoint_ns":
          "synthetic-value-031",
        "langfuse.observation.metadata.checkpoint_ns": "synthetic-value-032",
        "langfuse.observation.metadata.ls_provider": "synthetic-value-033",
        "langfuse.observation.metadata.ls_model_name": "synthetic-value-034",
        "langfuse.observation.metadata.ls_model_type": "synthetic-value-035",
        "langfuse.observation.metadata.ls_temperature": "synthetic-value-036",
        "langfuse.observation.metadata.ls_max_tokens": null,
        "langfuse.observation.metadata.lc_versions": {
          synthetic_field_007: "synthetic-value-038",
          synthetic_field_008: "synthetic-value-039",
          synthetic_field_009: "synthetic-value-040",
        },
        "langfuse.observation.metadata.ocs_provider_type":
          "synthetic-value-041",
        "langfuse.observation.type": "synthetic-value-042",
        "langfuse.observation.output": {
          role: "assistant",
          content: "Synthetic assistant response 043.",
        },
        "langfuse.observation.model.name": "synthetic-value-044",
        "langfuse.observation.usage_details": {
          synthetic_field_010: 13252,
          synthetic_field_011: 0,
          input: 1,
          output: 406,
          synthetic_field_012: 0,
          synthetic_field_013: 13252,
        },
      },
      resourceAttributes: {
        "telemetry.sdk.language": "python",
        "telemetry.sdk.name": "opentelemetry",
        "telemetry.sdk.version": "1.38.0",
        "service.name": "synthetic-service",
      },
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
          },
          {
            type: "tool-call",
            toolCallId: "call_002",
            toolName: "synthetic_tool_001",
            input: {
              synthetic_field_003: "Synthetic assistant response 013.",
            },
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
