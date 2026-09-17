import type { NormalizedIOFixture } from "../fixture-types";

export const microsoftAgentProductionShapeFixture = {
  name: "normalizes an anonymized Microsoft Agent Framework span",
  otel: {
    scopeSpan: {
      scope: {
        name: "agent_framework",
        version: "0.0.0",
      },
      spans: [
        {
          traceId: Buffer.from("00000000000000000000000000000001", "hex"),
          spanId: Buffer.from("0000000000000003", "hex"),
          parentSpanId: Buffer.from("0000000000000002", "hex"),
          name: "synthetic_name_002",
          kind: 1,
          attributes: [
            {
              key: "gen_ai.input.messages",
              value: {
                stringValue:
                  '[{"role":"system","parts":[{"type":"text","content":"You are a helpful synthetic assistant 011."}]},{"role":"user","parts":[{"type":"text","content":"Synthetic user request 012."}]}]',
              },
            },
            {
              key: "gen_ai.system_instructions",
              value: {
                stringValue:
                  '[{"type":"text","content":"synthetic-value-013"}]',
              },
            },
            {
              key: "gen_ai.request.choice.count",
              value: {
                intValue: "synthetic-value-014",
              },
            },
            {
              key: "gen_ai.operation.name",
              value: {
                stringValue: "invoke_agent",
              },
            },
            {
              key: "gen_ai.provider.name",
              value: {
                stringValue: "microsoft.agent_framework",
              },
            },
            {
              key: "gen_ai.agent.id",
              value: {
                stringValue: "synthetic-value-015",
              },
            },
            {
              key: "gen_ai.agent.name",
              value: {
                stringValue: "synthetic-value-016",
              },
            },
            {
              key: "gen_ai.request.model",
              value: {
                stringValue: "gpt-5.4",
              },
            },
            {
              key: "gen_ai.tool.definitions",
              value: {
                stringValue:
                  '[{"type":"function","function":{"name":"synthetic_tool_001","description":"Synthetic description 017.","parameters":{"synthetic_field_001":{"synthetic_field_002":{"enum":["synthetic-value-018","synthetic-value-019","synthetic-value-020","synthetic-value-021","synthetic-value-022","synthetic-value-023"],"synthetic_field_003":"synthetic-value-024","type":"string"}},"properties":{"synthetic_field_004":{"anyOf":[{"type":"string"},{"type":"null"}],"synthetic_field_005":null,"description":"Synthetic description 025.","synthetic_field_003":"synthetic-value-026"},"synthetic_field_006":{"anyOf":[{"type":"string"},{"type":"null"}],"synthetic_field_005":null,"description":"Synthetic description 027.","synthetic_field_003":"synthetic-value-028"},"synthetic_field_007":{"anyOf":[{"enum":["synthetic-value-029","synthetic-value-030"],"type":"string"},{"type":"null"}],"synthetic_field_005":null,"description":"Synthetic description 031.","synthetic_field_003":"synthetic-value-032"},"synthetic_field_008":{"anyOf":[{"enum":["synthetic-value-033","synthetic-value-034"],"type":"string"},{"type":"null"}],"synthetic_field_005":null,"description":"Synthetic description 035.","synthetic_field_003":"synthetic-value-036"},"synthetic_field_009":{"anyOf":[{"items":{"synthetic_field_010":"synthetic-value-037"},"type":"synthetic-value-038"},{"type":"null"}],"synthetic_field_005":null,"description":"Synthetic description 039.","synthetic_field_003":"synthetic-value-040"},"synthetic_field_011":{"anyOf":[{"type":"string"},{"type":"null"}],"synthetic_field_005":null,"description":"Synthetic description 041.","synthetic_field_003":"synthetic-value-042"},"synthetic_field_012":{"anyOf":[{"type":"string"},{"type":"null"}],"synthetic_field_005":null,"description":"Synthetic description 043.","synthetic_field_003":"synthetic-value-044"},"synthetic_field_013":{"synthetic_field_005":false,"description":"Synthetic description 045.","synthetic_field_003":"synthetic-value-046","type":"boolean"}},"synthetic_field_003":"synthetic-value-047","type":"object"}}},{"type":"function","function":{"name":"synthetic_tool_002","description":"Synthetic description 048.","parameters":{"synthetic_field_001":{"synthetic_field_014":{"description":"Synthetic description 049.","properties":{"synthetic_field_015":{"format":"synthetic-value-050","synthetic_field_003":"synthetic-value-051","type":"string"},"synthetic_field_016":{"synthetic_field_003":"synthetic-value-052","type":"string"}},"required":["synthetic_field_015","synthetic_field_016"],"synthetic_field_003":"synthetic-value-053","type":"object"}},"properties":{"synthetic_field_017":{"description":"Synthetic description 054.","synthetic_field_003":"synthetic-value-055","type":"string"},"synthetic_field_018":{"anyOf":[{"items":{"type":"string"},"type":"synthetic-value-056"},{"type":"null"}],"synthetic_field_005":null,"description":"Synthetic description 057.","synthetic_field_003":"synthetic-value-058"},"synthetic_field_019":{"anyOf":[{"additionalProperties":{"type":"string"},"type":"object"},{"type":"null"}],"synthetic_field_005":null,"description":"Synthetic description 059.","synthetic_field_003":"synthetic-value-060"},"synthetic_field_020":{"anyOf":[{"items":{"synthetic_field_010":"synthetic-value-061"},"type":"synthetic-value-062"},{"type":"null"}],"synthetic_field_005":null,"description":"Synthetic description 063.","synthetic_field_003":"synthetic-value-064"},"synthetic_field_021":{"anyOf":[{"enum":["synthetic-value-065","synthetic-value-066"],"type":"string"},{"type":"null"}],"synthetic_field_005":null,"description":"Synthetic description 067.","synthetic_field_003":"synthetic-value-068"},"synthetic_field_022":{"anyOf":[{"type":"string"},{"type":"null"}],"synthetic_field_005":null,"description":"Synthetic description 069.","synthetic_field_003":"synthetic-value-070"}},"required":["synthetic_field_017"],"synthetic_field_003":"synthetic-value-071","type":"object"}}},{"type":"function","function":{"name":"synthetic_tool_003","description":"Synthetic description 072.","parameters":{"properties":{"synthetic_field_017":{"description":"Synthetic description 073.","synthetic_field_003":"synthetic-value-074","type":"string"}},"required":["synthetic_field_017"],"synthetic_field_003":"synthetic-value-075","type":"object"}}},{"type":"function","function":{"name":"synthetic_tool_004","description":"Synthetic description 076.","parameters":{"properties":{"synthetic_field_011":{"description":"Synthetic description 077.","synthetic_field_003":"synthetic-value-078","type":"string"}},"required":["synthetic_field_011"],"synthetic_field_003":"synthetic-value-079","type":"object"}}},{"type":"function","function":{"name":"synthetic_tool_005","description":"Synthetic description 080.","parameters":{"properties":{"synthetic_field_023":{"description":"Synthetic description 081.","synthetic_field_003":"synthetic-value-082","type":"string"},"synthetic_field_024":{"description":"Synthetic description 083.","synthetic_field_003":"synthetic-value-084","type":"string"}},"required":["synthetic_field_023","synthetic_field_024"],"synthetic_field_003":"synthetic-value-085","type":"object"}}}]',
              },
            },
            {
              key: "langfuse.observation.type",
              value: {
                stringValue: "synthetic-value-086",
              },
            },
            {
              key: "gen_ai.output.messages",
              value: {
                stringValue:
                  '[{"role":"assistant","parts":[{"type":"text","content":"Synthetic assistant response 087."}]}]',
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
      "telemetry.sdk.version": "1.41.1",
      "service.name": "synthetic-service",
    },
  },
  spanIO: {
    input: {
      messages: [
        {
          role: "system",
          parts: [
            {
              type: "text",
              content: "You are a helpful synthetic assistant 011.",
            },
          ],
        },
        {
          role: "user",
          parts: [
            {
              type: "text",
              content: "Synthetic user request 012.",
            },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "synthetic_tool_001",
            description: "Synthetic description 017.",
            parameters: {
              synthetic_field_001: {
                synthetic_field_002: {
                  enum: [
                    "synthetic-value-018",
                    "synthetic-value-019",
                    "synthetic-value-020",
                    "synthetic-value-021",
                    "synthetic-value-022",
                    "synthetic-value-023",
                  ],
                  synthetic_field_003: "synthetic-value-024",
                  type: "string",
                },
              },
              properties: {
                synthetic_field_004: {
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  synthetic_field_005: null,
                  description: "Synthetic description 025.",
                  synthetic_field_003: "synthetic-value-026",
                },
                synthetic_field_006: {
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  synthetic_field_005: null,
                  description: "Synthetic description 027.",
                  synthetic_field_003: "synthetic-value-028",
                },
                synthetic_field_007: {
                  anyOf: [
                    {
                      enum: ["synthetic-value-029", "synthetic-value-030"],
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  synthetic_field_005: null,
                  description: "Synthetic description 031.",
                  synthetic_field_003: "synthetic-value-032",
                },
                synthetic_field_008: {
                  anyOf: [
                    {
                      enum: ["synthetic-value-033", "synthetic-value-034"],
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  synthetic_field_005: null,
                  description: "Synthetic description 035.",
                  synthetic_field_003: "synthetic-value-036",
                },
                synthetic_field_009: {
                  anyOf: [
                    {
                      items: {
                        synthetic_field_010: "synthetic-value-037",
                      },
                      type: "synthetic-value-038",
                    },
                    {
                      type: "null",
                    },
                  ],
                  synthetic_field_005: null,
                  description: "Synthetic description 039.",
                  synthetic_field_003: "synthetic-value-040",
                },
                synthetic_field_011: {
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  synthetic_field_005: null,
                  description: "Synthetic description 041.",
                  synthetic_field_003: "synthetic-value-042",
                },
                synthetic_field_012: {
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  synthetic_field_005: null,
                  description: "Synthetic description 043.",
                  synthetic_field_003: "synthetic-value-044",
                },
                synthetic_field_013: {
                  synthetic_field_005: false,
                  description: "Synthetic description 045.",
                  synthetic_field_003: "synthetic-value-046",
                  type: "boolean",
                },
              },
              synthetic_field_003: "synthetic-value-047",
              type: "object",
            },
          },
        },
        {
          type: "function",
          function: {
            name: "synthetic_tool_002",
            description: "Synthetic description 048.",
            parameters: {
              synthetic_field_001: {
                synthetic_field_014: {
                  description: "Synthetic description 049.",
                  properties: {
                    synthetic_field_015: {
                      format: "synthetic-value-050",
                      synthetic_field_003: "synthetic-value-051",
                      type: "string",
                    },
                    synthetic_field_016: {
                      synthetic_field_003: "synthetic-value-052",
                      type: "string",
                    },
                  },
                  required: ["synthetic_field_015", "synthetic_field_016"],
                  synthetic_field_003: "synthetic-value-053",
                  type: "object",
                },
              },
              properties: {
                synthetic_field_017: {
                  description: "Synthetic description 054.",
                  synthetic_field_003: "synthetic-value-055",
                  type: "string",
                },
                synthetic_field_018: {
                  anyOf: [
                    {
                      items: {
                        type: "string",
                      },
                      type: "synthetic-value-056",
                    },
                    {
                      type: "null",
                    },
                  ],
                  synthetic_field_005: null,
                  description: "Synthetic description 057.",
                  synthetic_field_003: "synthetic-value-058",
                },
                synthetic_field_019: {
                  anyOf: [
                    {
                      additionalProperties: {
                        type: "string",
                      },
                      type: "object",
                    },
                    {
                      type: "null",
                    },
                  ],
                  synthetic_field_005: null,
                  description: "Synthetic description 059.",
                  synthetic_field_003: "synthetic-value-060",
                },
                synthetic_field_020: {
                  anyOf: [
                    {
                      items: {
                        synthetic_field_010: "synthetic-value-061",
                      },
                      type: "synthetic-value-062",
                    },
                    {
                      type: "null",
                    },
                  ],
                  synthetic_field_005: null,
                  description: "Synthetic description 063.",
                  synthetic_field_003: "synthetic-value-064",
                },
                synthetic_field_021: {
                  anyOf: [
                    {
                      enum: ["synthetic-value-065", "synthetic-value-066"],
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  synthetic_field_005: null,
                  description: "Synthetic description 067.",
                  synthetic_field_003: "synthetic-value-068",
                },
                synthetic_field_022: {
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  synthetic_field_005: null,
                  description: "Synthetic description 069.",
                  synthetic_field_003: "synthetic-value-070",
                },
              },
              required: ["synthetic_field_017"],
              synthetic_field_003: "synthetic-value-071",
              type: "object",
            },
          },
        },
        {
          type: "function",
          function: {
            name: "synthetic_tool_003",
            description: "Synthetic description 072.",
            parameters: {
              properties: {
                synthetic_field_017: {
                  description: "Synthetic description 073.",
                  synthetic_field_003: "synthetic-value-074",
                  type: "string",
                },
              },
              required: ["synthetic_field_017"],
              synthetic_field_003: "synthetic-value-075",
              type: "object",
            },
          },
        },
        {
          type: "function",
          function: {
            name: "synthetic_tool_004",
            description: "Synthetic description 076.",
            parameters: {
              properties: {
                synthetic_field_011: {
                  description: "Synthetic description 077.",
                  synthetic_field_003: "synthetic-value-078",
                  type: "string",
                },
              },
              required: ["synthetic_field_011"],
              synthetic_field_003: "synthetic-value-079",
              type: "object",
            },
          },
        },
        {
          type: "function",
          function: {
            name: "synthetic_tool_005",
            description: "Synthetic description 080.",
            parameters: {
              properties: {
                synthetic_field_023: {
                  description: "Synthetic description 081.",
                  synthetic_field_003: "synthetic-value-082",
                  type: "string",
                },
                synthetic_field_024: {
                  description: "Synthetic description 083.",
                  synthetic_field_003: "synthetic-value-084",
                  type: "string",
                },
              },
              required: ["synthetic_field_023", "synthetic_field_024"],
              synthetic_field_003: "synthetic-value-085",
              type: "object",
            },
          },
        },
      ],
    },
    output:
      '[{"role":"assistant","parts":[{"type":"text","content":"Synthetic assistant response 087."}]}]',
    metadata: {
      attributes: {
        "gen_ai.request.choice.count": '{"intValue":"synthetic-value-014"}',
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.provider.name": "microsoft.agent_framework",
        "gen_ai.agent.id": "synthetic-value-015",
        "gen_ai.agent.name": "synthetic-value-016",
        "gen_ai.request.model": "gpt-5.4",
        "langfuse.observation.type": "synthetic-value-086",
      },
      resourceAttributes: {
        "telemetry.sdk.language": "python",
        "telemetry.sdk.name": "opentelemetry",
        "telemetry.sdk.version": "1.41.1",
        "service.name": "synthetic-service",
      },
      scope: {
        name: "agent_framework",
        version: "0.0.0",
        attributes: {},
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
            text: "You are a helpful synthetic assistant 011.",
          },
        ],
        source: "input",
      },
      {
        role: "user",
        parts: [
          {
            type: "text",
            text: "Synthetic user request 012.",
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Synthetic assistant response 087.",
          },
        ],
        source: "output",
      },
    ],
    toolDefinitions: [
      {
        name: "synthetic_tool_001",
        description: "Synthetic description 017.",
        inputSchema: {
          synthetic_field_001: {
            synthetic_field_002: {
              enum: [
                "synthetic-value-018",
                "synthetic-value-019",
                "synthetic-value-020",
                "synthetic-value-021",
                "synthetic-value-022",
                "synthetic-value-023",
              ],
              synthetic_field_003: "synthetic-value-024",
              type: "string",
            },
          },
          properties: {
            synthetic_field_004: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              synthetic_field_005: null,
              description: "Synthetic description 025.",
              synthetic_field_003: "synthetic-value-026",
            },
            synthetic_field_006: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              synthetic_field_005: null,
              description: "Synthetic description 027.",
              synthetic_field_003: "synthetic-value-028",
            },
            synthetic_field_007: {
              anyOf: [
                {
                  enum: ["synthetic-value-029", "synthetic-value-030"],
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              synthetic_field_005: null,
              description: "Synthetic description 031.",
              synthetic_field_003: "synthetic-value-032",
            },
            synthetic_field_008: {
              anyOf: [
                {
                  enum: ["synthetic-value-033", "synthetic-value-034"],
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              synthetic_field_005: null,
              description: "Synthetic description 035.",
              synthetic_field_003: "synthetic-value-036",
            },
            synthetic_field_009: {
              anyOf: [
                {
                  items: {
                    synthetic_field_010: "synthetic-value-037",
                  },
                  type: "synthetic-value-038",
                },
                {
                  type: "null",
                },
              ],
              synthetic_field_005: null,
              description: "Synthetic description 039.",
              synthetic_field_003: "synthetic-value-040",
            },
            synthetic_field_011: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              synthetic_field_005: null,
              description: "Synthetic description 041.",
              synthetic_field_003: "synthetic-value-042",
            },
            synthetic_field_012: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              synthetic_field_005: null,
              description: "Synthetic description 043.",
              synthetic_field_003: "synthetic-value-044",
            },
            synthetic_field_013: {
              synthetic_field_005: false,
              description: "Synthetic description 045.",
              synthetic_field_003: "synthetic-value-046",
              type: "boolean",
            },
          },
          synthetic_field_003: "synthetic-value-047",
          type: "object",
        },
        type: "function",
      },
      {
        name: "synthetic_tool_002",
        description: "Synthetic description 048.",
        inputSchema: {
          synthetic_field_001: {
            synthetic_field_014: {
              description: "Synthetic description 049.",
              properties: {
                synthetic_field_015: {
                  format: "synthetic-value-050",
                  synthetic_field_003: "synthetic-value-051",
                  type: "string",
                },
                synthetic_field_016: {
                  synthetic_field_003: "synthetic-value-052",
                  type: "string",
                },
              },
              required: ["synthetic_field_015", "synthetic_field_016"],
              synthetic_field_003: "synthetic-value-053",
              type: "object",
            },
          },
          properties: {
            synthetic_field_017: {
              description: "Synthetic description 054.",
              synthetic_field_003: "synthetic-value-055",
              type: "string",
            },
            synthetic_field_018: {
              anyOf: [
                {
                  items: {
                    type: "string",
                  },
                  type: "synthetic-value-056",
                },
                {
                  type: "null",
                },
              ],
              synthetic_field_005: null,
              description: "Synthetic description 057.",
              synthetic_field_003: "synthetic-value-058",
            },
            synthetic_field_019: {
              anyOf: [
                {
                  additionalProperties: {
                    type: "string",
                  },
                  type: "object",
                },
                {
                  type: "null",
                },
              ],
              synthetic_field_005: null,
              description: "Synthetic description 059.",
              synthetic_field_003: "synthetic-value-060",
            },
            synthetic_field_020: {
              anyOf: [
                {
                  items: {
                    synthetic_field_010: "synthetic-value-061",
                  },
                  type: "synthetic-value-062",
                },
                {
                  type: "null",
                },
              ],
              synthetic_field_005: null,
              description: "Synthetic description 063.",
              synthetic_field_003: "synthetic-value-064",
            },
            synthetic_field_021: {
              anyOf: [
                {
                  enum: ["synthetic-value-065", "synthetic-value-066"],
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              synthetic_field_005: null,
              description: "Synthetic description 067.",
              synthetic_field_003: "synthetic-value-068",
            },
            synthetic_field_022: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              synthetic_field_005: null,
              description: "Synthetic description 069.",
              synthetic_field_003: "synthetic-value-070",
            },
          },
          required: ["synthetic_field_017"],
          synthetic_field_003: "synthetic-value-071",
          type: "object",
        },
        type: "function",
      },
      {
        name: "synthetic_tool_003",
        description: "Synthetic description 072.",
        inputSchema: {
          properties: {
            synthetic_field_017: {
              description: "Synthetic description 073.",
              synthetic_field_003: "synthetic-value-074",
              type: "string",
            },
          },
          required: ["synthetic_field_017"],
          synthetic_field_003: "synthetic-value-075",
          type: "object",
        },
        type: "function",
      },
      {
        name: "synthetic_tool_004",
        description: "Synthetic description 076.",
        inputSchema: {
          properties: {
            synthetic_field_011: {
              description: "Synthetic description 077.",
              synthetic_field_003: "synthetic-value-078",
              type: "string",
            },
          },
          required: ["synthetic_field_011"],
          synthetic_field_003: "synthetic-value-079",
          type: "object",
        },
        type: "function",
      },
      {
        name: "synthetic_tool_005",
        description: "Synthetic description 080.",
        inputSchema: {
          properties: {
            synthetic_field_023: {
              description: "Synthetic description 081.",
              synthetic_field_003: "synthetic-value-082",
              type: "string",
            },
            synthetic_field_024: {
              description: "Synthetic description 083.",
              synthetic_field_003: "synthetic-value-084",
              type: "string",
            },
          },
          required: ["synthetic_field_023", "synthetic_field_024"],
          synthetic_field_003: "synthetic-value-085",
          type: "object",
        },
        type: "function",
      },
    ],
  },
} satisfies NormalizedIOFixture;

// Verbatim stored observation IO from ChatML integration-example exports.
export const capturedTraceFixtures: NormalizedIOFixture[] = [
  // Source: worker/src/__tests__/chatml/framework-traces/csharp-agent-with-gemini-2026-03-09.trace.json; observation c651c1dac855f97e
  {
    name: "verbatim csharp-agent-with-gemini-2026-03-09.trace.json / c651c1dac855f97e",
    spanIO: {
      input:
        '[\n  {\n    "role": "user",\n    "parts": [\n      {\n        "type": "text",\n        "content": "What are my month over month performance insights the past quarter, by cost, displays, clicks, CTR, sales, CVR? Please split by campaign taxonomy"\n      }\n    ]\n  }\n]',
      output:
        '[\n  {\n    "role": "assistant",\n    "parts": [\n      {\n        "type": "tool_call",\n        "id": "get_custom_report",\n        "name": "get_custom_report",\n        "arguments": {\n          "dimensions": [\n            "Campaign"\n          ],\n          "filters": {\n            "dateRange": {\n              "from_date": "2025-10-01",\n              "to_date": "2025-12-31"\n            }\n          },\n          "timeDimension": "Month",\n          "metrics": [\n            "Cost",\n            "Displays",\n            "Clicks",\n            "Ctr",\n            "Sales",\n            "Cvr"\n          ]\n        }\n      },\n      {\n        "type": "Microsoft.Extensions.AI.TextReasoningContent",\n        "content": {\n          "text": "",\n          "protectedData": "CooKAY89a1+CDPFO/TMZiXeenaPLkZSQA1LTxbQ7KmbinWe/uwbMou6HLwBeN20ZvZ+7QHhxpopqxYuZugBc3x3GariQWXjIh9esj8BB+ufQmBPUKMGRmM3tSqw0KqQ/TlEqq81dTM6leDfHUfiAfSa45iC4IUVWHtrD9ZXtN6O6HxdxN+/zf5tU3rS1zIKAsDev2nqR2tAYqG9FVtnC4Y//05fVMFq9BQjxlsfYhFn+pMIAnH9/GjM5iIzbg3eqH6EDqIuRHIT+Bg/8+bXd9PPgHKXZlcu/9aaQsOHbh9+8eSOfZgzzZ1wRHYAcj9i5fdnlK3UfKYTBoaXdPoqOc7mVteUKELYSY4xyh0Dzbp/27qTBPG1pgFuoxJV9NDi7zJiMby0HfRRVcL/kpI7z5Vxg3rSCMvlNFQHxVvglsDCoiQAph9373SSUKUvh2LgfclHi/nxcZOhKNpds/SFXj3cjZUi5NpFT/O2qhBat27ztbMpoL2j/aYrQ5HDxE+yJOLgUyeO3LoS+xw1eTsUcGTNb73T2g3RexvR+CuP5JqpFYX9oxU7A/98+DP7UaXSeV1cxHCGWShSvwTMDixO75AMhNspXiYa1ZiFOBmyWhOU4Mdqimh4uNXRmx3SVm8/XIkidZq0ffqXqRyPkN1TI9/Q6Uuy19QMbQZxLHdLYd9cXQCoNvYEYr1X76pHA3UVRnz2hors/vTmAvZqdGYI/42gWKNy5kntAVssG0UOTkrt7cMgW2pZNFTe3aMVvZL5cTuI+ssfxrtl7YqpopDexX1b0szixtkt0O69r1kl8W0ubJ2/YdcJ5NjC2AMaFSceYrU57tbupvBx4UXuOxhIUEX6N3Ce2ctEw1rBm82PabYFnjMs3Jm9jWt9MDXkX4yTVjwoEYFY9ID9DvevwB0C0oWF4NFVLGL6PUFbHwMyBhbab2Py11xfn8HHWokguKc9fsbBOJNnMcRW9zHpiGyYE9bQNbEvanqg12zGMXgRKA5YJgItmt4drDAaWT6TF+GxpBFNNhn6dStlOH/gpv1/VXZ4+lX4+KSgYyNu+NQi+zWJesvDYesooB2lhJfO0+Cvp0ogs++/TmPpQk6MJBF4nblugcfdXe5sd5wMf8ggmzgRRyuOHMhnyf/YPPLHP4cZPjxTtZ1yIYq4VJNlrvn7bTEhbWq3CubPaR8srZHyr9GlPTryxK7Gpi87uFlZdKa6rl0OSwSa+DatBcmPlXymdSbWc7+83mYSQtoLKlKkGESyqfYOmUQv89bx8UbBy8+BrKOlGbK9buQCTii560lj1IqV/IWH4QZ+NUp9KgU5HIKGw5LukDkK1ieWCiKWcQRYOor1oo3GXu6k0OTG01e+bCAvVoIeiZyPFtP5C3Q/wwyYZKZrLWNCg2SJOuIs2xTgidX0lzJY3XUAcTKAUP9xWYG8OLtm/ihzKxVP/rJbWfbir9ORnSqgJfzdXx0bhYzsOB3A0lUMfAGzRF4o4euym8IXMamJGt6xxxX4+prIFQ5G7ktVHhz23WlU6k4BdsaFoHmCu/xmGDsVhhyU1EG9wAbR7MwM5OgdQO9+C6m0tn1W1QzygSvyrDCBhmefwoU7AzZT7wR4WzNrpZefBV1EhDEp4lbRbSNnF85+0jlXcVrBhFeHENd5t9SFy7utTxdNEtBV6rBdvHf3Il6/Q9+mpUkXk8oFqfDHjfm8iubt5vBxYGlQqYGaXxsOVP7/B"\n        }\n      }\n    ],\n    "finish_reason": "stop"\n  }\n]',
      metadata:
        '{"attributes":{"otel.exception_pointers":"94867131908120","gen_ai.operation.name":"chat","gen_ai.request.model":"gemini-2.5-flash","gen_ai.provider.name":"gcp.vertex_ai","server.address":"aiplatform.googleapis.com","server.port":"443","gen_ai.request.seed":"42","gen_ai.request.temperature":"0","gen_ai.tool.definitions":"[\\n  {\\n    \\"type\\": \\"function\\",\\n    \\"name\\": \\"get_adset_infos\\",\\n    \\"description\\": \\"Retrieves all ad sets matching conditions set in the filter (also referred to as campaigns)\\\\r\\\\nThis method should be called by the agent whenever\\\\r\\\\nit needs information about one or more ad sets.\\\\r\\\\nIt provides a comprehensive list of ad sets with key metadata and status fields.\\\\r\\\\n\\\\r\\\\nReturns:\\\\r\\\\n-------\\\\r\\\\nResponse\\\\r\\\\n    An object containing data with the following information for each ad set:\\\\r\\\\n    - id: The unique identifier of the ad set (also called Campaign ID).\\\\r\\\\n    - name: The name of the ad set.\\\\r\\\\n    - advertiserId: The ID of the advertiser that owns this ad set.\\\\r\\\\n    - objective (MarketingObjective): The marketing objective associated with the ad set: Acquisition or Retention.\\\\r\\\\n    - startDate: The start date of the ad set, if specified.\\\\r\\\\n    - activationStatus: Indicates whether the ad set is currently active: Activated or NotActivated\\\\r\\\\n    - deliveryStatus: Describes the current delivery state of the ad set: Running, Archived or NotRunning\\\\r\\\\n\\\\r\\\\nNotes:\\\\r\\\\n-----\\\\r\\\\nUse this method as the primary source for retrieving ad set (campaign) information.\\",\\n    \\"parameters\\": {\\n      \\"type\\": \\"object\\",\\n      \\"properties\\": {\\n        \\"filter\\": {\\n          \\"description\\": \\"The filters applied for selecting the ad_sets\\",\\n          \\"type\\": \\"object\\",\\n          \\"properties\\": {\\n            \\"adset_ids\\": {\\n              \\"type\\": [\\n                \\"array\\",\\n                \\"null\\"\\n              ],\\n              \\"items\\": {\\n                \\"type\\": \\"integer\\"\\n              }\\n            },\\n            \\"names\\": {\\n              \\"type\\": [\\n                \\"array\\",\\n                \\"null\\"\\n              ],\\n              \\"items\\": {\\n                \\"type\\": \\"string\\"\\n              }\\n            },\\n            \\"activation_statuses\\": {\\n              \\"type\\": [\\n                \\"array\\",\\n                \\"null\\"\\n              ],\\n              \\"items\\": {\\n                \\"type\\": \\"string\\",\\n                \\"enum\\": [\\n                  \\"NotActivated\\",\\n                  \\"Activated\\"\\n                ]\\n              }\\n            },\\n            \\"objectives\\": {\\n              \\"type\\": [\\n                \\"array\\",\\n                \\"null\\"\\n              ],\\n              \\"items\\": {\\n                \\"type\\": \\"string\\",\\n                \\"enum\\": [\\n                  \\"NotSet\\",\\n                  \\"Acquisition\\",\\n                  \\"Retention\\"\\n                ]\\n              }\\n            },\\n            \\"delivery_statuses\\": {\\n              \\"type\\": [\\n                \\"array\\",\\n                \\"null\\"\\n              ],\\n              \\"items\\": {\\n                \\"type\\": \\"string\\",\\n                \\"enum\\": [\\n                  \\"Running\\",\\n                  \\"Archived\\",\\n                  \\"NotRunning\\"\\n                ]\\n              }\\n            }\\n          }\\n        }\\n      },\\n      \\"required\\": [\\n        \\"filter\\"\\n      ]\\n    }\\n  },\\n  {\\n    \\"type\\": \\"function\\",\\n    \\"name\\": \\"get_custom_report\\",\\n    \\"description\\": \\"Calls the API to retrieve client data.\\\\r\\\\n\\\\r\\\\nArgs:\\\\r\\\\n    filters: An object containing the built-in filters.\\\\r\\\\n        Default values are provided if needed.\\\\r\\\\n    timeDimension: Time-based dimension for data projections; specifies the granularity at which data will be grouped.\\\\r\\\\n        Possible values and examples:\\\\r\\\\n            - None: Indicates that the user has not provided any clear time dimension.\\\\r\\\\n                This should be selected when there is no explicit instruction.\\\\r\\\\n                Do NOT infer or assume a value; use None unless the user specifies otherwise.\\\\r\\\\n            - Year: Represents a calendar year.\\\\r\\\\n                Examples: per year, by year, year-over-year comparisons (YoY), yearly trend analysis.\\\\r\\\\n            - Month: Represents a calendar month.\\\\r\\\\n                Examples: per month, by month, month-over-month comparisons (MoM), monthly performance reports.\\\\r\\\\n            - Week: Represents a calendar week.\\\\r\\\\n                Examples: per week, by week, week-over-week comparisons (WoW), weekly campaign summaries.\\\\r\\\\n            - Day: Represents a calendar day.\\\\r\\\\n                Examples: per day, by day, day-over-day comparisons (DoD), daily performance tracking.\\\\r\\\\n            - Hour: Represents an hour within a day.\\\\r\\\\n                Examples: per hour, by hour, hourly trend analysis, intraday performance monitoring.\\\\r\\\\n    dimensions: A list of dimensions that define the granularity of the report.\\\\r\\\\n        Example: [os, device]\\\\r\\\\n    metrics: A list of performance indicators to retrieve.\\\\r\\\\n        Example: [clicks, ctr]\\\\r\\\\n    attributionModel: Specifies the model used to measure sales.\\\\r\\\\n        Optional.\\\\r\\\\n    additionalFilters: Custom filters applied to the data.\\\\r\\\\n        CRITICAL CONSTRAINT: Every dimension used in \\\\u0060additionalFilters\\\\u0060 MUST be present in the \\\\u0060dimensions\\\\u0060 list.\\\\r\\\\n        If a filter references a dimension not included in \\\\u0060dimensions\\\\u0060, the request will be rejected.\\\\r\\\\n\\\\r\\\\nNotes:\\\\r\\\\n    - Dimensions determine the level of detail in the report.\\\\r\\\\n    - Metrics represent the KPIs to monitor campaign performance.\\\\r\\\\n    - Filters restrict the dataset retrieved from the API.\\\\r\\\\n    - \\\\u0060additionalFilters\\\\u0060 allow for extra filtering, but only on dimensions explicitly listed in \\\\u0060dimensions\\\\u0060.\\",\\n    \\"parameters\\": {\\n      \\"type\\": \\"object\\",\\n      \\"properties\\": {\\n        \\"filters\\": {\\n          \\"description\\": \\"Filters are a way to narrow the scope of the report by setting certain values.\\\\r\\\\nIf no value can be inferred, a default one will be provided.\\",\\n          \\"type\\": \\"object\\",\\n          \\"properties\\": {\\n            \\"clientIds\\": {\\n              \\"type\\": \\"array\\",\\n              \\"items\\": {\\n                \\"type\\": \\"integer\\"\\n              }\\n            },\\n            \\"dateRange\\": {\\n              \\"description\\": \\"Date range between two dates.\\\\r\\\\nIMPORTANT: from_date and to_date are inclusive (the start and end dates are included in the period).\\\\r\\\\n\\\\r\\\\nIf dates are not given explicitly, they can be deduced as follows:\\\\r\\\\n\\\\r\\\\n- IMPORTANT: Last n days: from = today - n days, to = yesterday (inclusive, does not include today)\\\\r\\\\n    Example: if today is 2025-08-23 then \\\\u0022last 7 days\\\\u0022: 2025-08-16 to 2025-08-22 (inclusive, 7 days)\\\\r\\\\n    Example: if today is 2025-08-10 then \\\\u0022last 20 days\\\\u0022: 2025-07-21 to 2025-08-09 (inclusive, 20 days)\\\\r\\\\n- Month of May 2025: from = 2025-05-01, to = 2025-05-31\\\\r\\\\n- IMPORTANT: Last week, the last full calendar week (Monday to Sunday) before the current Week:\\\\r\\\\n    from = Monday of previous week\\\\r\\\\n    to = Sunday of previous Week\\\\r\\\\n    Example: if today is Tuesday, 2025-08-12 then \\\\u0022last week\\\\u0022 is Monday 2025-08-04 to Sunday 2025-08-10\\\\r\\\\n    Example: if today is Monday, 2025-09-15 then \\\\u0022last week\\\\u0022 is Monday 2025-08-14 to Sunday 2025-08-14\\\\r\\\\n- IMPORTANT: Last n weeks, the last n full calendar weeks (Monday to Sunday) before the current Week.\\\\r\\\\n    n is the number of weeks.\\\\r\\\\n    from = Monday of n weeks ago\\\\r\\\\n    to = Sunday of previous Week\\\\r\\\\n    Example: if today is Friday, 2025-08-22 then \\\\u0022last 2 weeks\\\\u0022 is\\\\r\\\\n        Monday 2025-08-04 to Sunday 2025-08-17\\\\r\\\\n        n is 2\\\\r\\\\n    Example: if today is Monday, 2025-07-21 then \\\\u0022last 3 weeks\\\\u0022 is\\\\r\\\\n        Monday 2025-06-30 to Sunday 2025-07-20\\\\r\\\\n        n is 3\\\\r\\\\n- IMPORTANT: Last month, the last full calendar month before the current month.\\\\r\\\\n    from = first day of previous month\\\\r\\\\n    to = last day of previous month\\\\r\\\\n    Example: if today is Tuesday, 2025-08-19 then \\\\u0022last month\\\\u0022 is 2025-07-01 to 2025-07-31\\\\r\\\\n- IMPORTANT: Last n months, the last n full calendar months before the current month.\\\\r\\\\n    n is the number of months.\\\\r\\\\n    from = first day of the month n months ago\\\\r\\\\n    to = last day of previous month\\\\r\\\\n    Example: if today is Monday, 2025-08-19 then \\\\u0022last 3 months\\\\u0022 is 2025-05-01 to 2025-07-31\\\\r\\\\n        n is 3\\\\r\\\\n- Last quarter: the last full quarter before the current quarter.\\\\r\\\\n    Q1: January 1 to March 31\\\\r\\\\n    Q2: April 1 to June 30\\\\r\\\\n    Q3: July 1 to September 30\\\\r\\\\n    Q4: October 1 to December 31\\\\r\\\\n\\\\r\\\\n\\\\r\\\\ntime_zone is the IANA time zone name (e.g., \\\\u0022Europe/London\\\\u0022, \\\\u0022America/New_York\\\\u0022).\\\\r\\\\nBy default, assume that we are in the Europe/London time zone.\\\\r\\\\n\\\\r\\\\nThe field previous_period_from_date is used to define the starting date of a previous period\\\\r\\\\nthat mirrors the current data collection range.\\\\r\\\\nThis allows for comparative analysis between the current period and a similar past period.\\\\r\\\\n\\\\r\\\\nUse the following guidelines and examples to determine the correct value:\\\\r\\\\n\\\\r\\\\nGeneral Rule:\\\\r\\\\nprevious_period_from_date should be set to a date that starts the previous comparable period\\\\r\\\\nthe previous period will have the same duration as the current one\\\\r\\\\nthe previous period and the current period MUST NOT overlap\\\\r\\\\n\\\\r\\\\n    Examples:\\\\r\\\\n    Relative Time Comparison\\\\r\\\\n        If comparing to last year, and from_date = 2025-08-01, then:\\\\r\\\\n            previous_period_from_date = 2024-08-01\\\\r\\\\n        If comparing with the previous period, previous_period_start_date is calculated\\\\r\\\\n        by subtracting the duration of the current date range from its starting date (from_date).\\\\r\\\\n        This ensures the previous period has the same length and ends\\\\r\\\\n        right before the current one begins.\\\\r\\\\n        Example:\\\\r\\\\n            Current range: from_date = 2025-08-10, to_date = 2025-08-19 (10 days including bounds),\\\\r\\\\n            then: previous_period_start_date = 2025-07-31 (10 days before 2025-08-10)\\\\r\\\\n    Custom Period Comparison\\\\r\\\\n        If comparing to the period starting 2025-02-25, then:\\\\r\\\\n            previous_period_from_date = 2025-02-25\\\\r\\\\n\\",\\n              \\"type\\": \\"object\\",\\n              \\"properties\\": {\\n                \\"from_date\\": {\\n                  \\"type\\": \\"string\\",\\n                  \\"format\\": \\"date\\"\\n                },\\n                \\"to_date\\": {\\n                  \\"type\\": \\"string\\",\\n                  \\"format\\": \\"date\\"\\n                },\\n                \\"time_zone\\": {\\n                  \\"type\\": [\\n                    \\"string\\",\\n                    \\"null\\"\\n                  ]\\n                },\\n                \\"previous_period_from_date\\": {\\n                  \\"type\\": [\\n                    \\"string\\",\\n                    \\"null\\"\\n                  ],\\n                  \\"format\\": \\"date\\"\\n                }\\n              }\\n            },\\n            \\"currency\\": {\\n              \\"type\\": \\"string\\"\\n            },\\n            \\"campaignStatus\\": {\\n              \\"type\\": [\\n                \\"array\\",\\n                \\"null\\"\\n              ],\\n              \\"items\\": {\\n                \\"description\\": \\"    Status of a campaign\\\\r\\\\n\\\\r\\\\n    Glossary:\\\\r\\\\n        Active\\\\r\\\\n            Active, Running or Live\\\\r\\\\n        NotRunning\\\\r\\\\n            Not running\\\\r\\\\n        Dead\\\\r\\\\n            Archived\\",\\n                \\"type\\": \\"string\\",\\n                \\"enum\\": [\\n                  \\"Active\\",\\n                  \\"NotRunning\\",\\n                  \\"Dead\\"\\n                ]\\n              }\\n            },\\n            \\"mediaType\\": {\\n              \\"type\\": [\\n                \\"array\\",\\n                \\"null\\"\\n              ],\\n              \\"items\\": {\\n                \\"description\\": \\"    Type of media used. video or display.\\\\r\\\\n\\\\r\\\\n    Glossary:\\\\r\\\\n        Display\\\\r\\\\n            HTML display\\\\r\\\\n\\\\r\\\\n        Video\\\\r\\\\n            Video display\\",\\n                \\"type\\": \\"string\\",\\n                \\"enum\\": [\\n                  \\"Display\\",\\n                  \\"Video\\"\\n                ]\\n              }\\n            },\\n            \\"marketingCampaignGoals\\": {\\n              \\"type\\": [\\n                \\"array\\",\\n                \\"null\\"\\n              ],\\n              \\"items\\": {\\n                \\"type\\": \\"string\\",\\n                \\"enum\\": [\\n                  \\"NotSet\\",\\n                  \\"Acquisition\\",\\n                  \\"Retention\\"\\n                ]\\n              }\\n            },\\n            \\"campaigns\\": {\\n              \\"type\\": [\\n                \\"array\\",\\n                \\"null\\"\\n              ],\\n              \\"items\\": {\\n                \\"type\\": \\"integer\\"\\n              }\\n            }\\n          }\\n        },\\n        \\"timeDimension\\": {\\n          \\"description\\": \\"Defines the time-based dimensions available for data projections.\\\\r\\\\n\\\\r\\\\nEach enum member specifies the granularity at which data can be grouped or analyzed.\\\\r\\\\n\\\\r\\\\nMembers:\\\\r\\\\n    None  - Indicates that the user has not provided any clear time dimension.\\\\r\\\\n        This should be selected when there is no explicit instruction.\\\\r\\\\n        Do NOT infer or assume a value; use None unless the user specifies otherwise.\\\\r\\\\n    Year  - Represents a calendar year. For example per year, by year, year-over-year comparisons (YoY), yearly trend analysis.\\\\r\\\\n    Month - Represents a calendar month. For example per month, by month, month-over-month comparisons (MoM), monthly performance reports.\\\\r\\\\n    Week  - Represents a calendar week. For example per week, by week, week-over-week comparisons (WoW), weekly campaign summaries.\\\\r\\\\n    Day   - Represents a calendar day. For example per day, by day, day-over-day comparisons (DoD), daily performance tracking.\\\\r\\\\n    Hour  - Represents an hour within a day. For example per hour, by hour, hourly trend analysis, intraday performance monitoring.\\",\\n          \\"type\\": \\"string\\",\\n          \\"enum\\": [\\n            \\"None\\",\\n            \\"Year\\",\\n            \\"Month\\",\\n            \\"Week\\",\\n            \\"Day\\",\\n            \\"Hour\\"\\n          ],\\n          \\"default\\": \\"None\\"\\n        },\\n        \\"dimensions\\": {\\n          \\"type\\": \\"array\\",\\n          \\"items\\": {\\n            \\"description\\": \\"    Enumeration of standardized dimensions used in online advertising projections.\\\\r\\\\n\\\\r\\\\n    Each member represents a dimension or attribute commonly used in digital marketing analytics,\\\\r\\\\n    campaign performance tracking, and audience segmentation.\\\\r\\\\n\\\\r\\\\n    Glossary:\\\\r\\\\n        Advertiser\\\\r\\\\n            Name or entity running the ad campaign(s). Also called Client\\\\r\\\\n\\\\r\\\\n        MarketingCampaign\\\\r\\\\n            Full name of the marketing campaign. A group of ad sets.\\\\r\\\\n\\\\r\\\\n        Campaign\\\\r\\\\n            An ad set.\\\\r\\\\n\\\\r\\\\n        MediaType\\\\r\\\\n            Type of media used (e.g., video, display, native).\\\\r\\\\n\\\\r\\\\n        MarketingCampaignGoal\\\\r\\\\n            Marketing campaign objective (Retention, Acquisition)\\\\r\\\\n\\\\r\\\\n        Category\\\\r\\\\n            Product or content category (e.g., electronics, fashion).\\\\r\\\\n\\\\r\\\\n        Device\\\\r\\\\n            Type of device used (e.g., mobile, desktop, tablet).\\\\r\\\\n\\\\r\\\\n        Os\\\\r\\\\n            Operating system of the device (e.g., iOS, Android, Windows).\\\\r\\\\n\\\\r\\\\n        AdChannel\\\\r\\\\n            Specific advertising channel (e.g., programmatic, direct).\\\\r\\\\n\\\\r\\\\n        AdSocialNetwork\\\\r\\\\n            Social media platform used (e.g., Facebook, TikTok).\\\\r\\\\n\\\\r\\\\n        Ad\\\\r\\\\n            A creative\\\\r\\\\n\\\\r\\\\n        Coupon\\\\r\\\\n            A creative coupon\\\\r\\\\n\\\\r\\\\n        AdFormat\\\\r\\\\n            Format of the ad (e.g., banner, interstitial, carousel).\\\\r\\\\n\\\\r\\\\n        DisplaySize\\\\r\\\\n            Size of the display area for the ad.\\\\r\\\\n\\\\r\\\\n        VideoPlacement\\\\r\\\\n            Placement type for video ads (e.g., in-stream, out-stream).\\\\r\\\\n\\\\r\\\\n        VideoPlaybackMethod\\\\r\\\\n            How the video was played (e.g., autoplay, click-to-play).\\\\r\\\\n\\\\r\\\\n        VideoPlayerSize\\\\r\\\\n            Dimensions of the video player.\\\\r\\\\n\\\\r\\\\n        VideoDurationInSeconds\\\\r\\\\n            Length of the video ad.\\\\r\\\\n\\\\r\\\\n        VideoPlayerRatio\\\\r\\\\n            Aspect ratio of the video player (e.g., 16:9).\\\\r\\\\n\\\\r\\\\n        Ssp\\\\r\\\\n            Supply Side Partner. The publishing network where displays were made.\\\\r\\\\n\\\\r\\\\n        Country\\\\r\\\\n            Country where the ad was served.\\\\r\\\\n\\\\r\\\\n        Region\\\\r\\\\n            Region or state within the country.\\\\r\\\\n\\\\r\\\\n        PostalCode\\\\r\\\\n            Postal or ZIP code.\\\\r\\\\n\\\\r\\\\n        UserBehavior\\\\r\\\\n            Behavioral segment of the user (e.g., frequent buyer).\\\\r\\\\n\\",\\n            \\"type\\": \\"string\\",\\n            \\"enum\\": [\\n              \\"Advertiser\\",\\n              \\"MarketingCampaign\\",\\n              \\"Campaign\\",\\n              \\"MediaType\\",\\n              \\"MarketingCampaignGoal\\",\\n              \\"Category\\",\\n              \\"Device\\",\\n              \\"Os\\",\\n              \\"AdChannel\\",\\n              \\"AdSocialNetwork\\",\\n              \\"Ad\\",\\n              \\"Coupon\\",\\n              \\"AdFormat\\",\\n              \\"DisplaySize\\",\\n              \\"VideoPlacement\\",\\n              \\"VideoPlaybackMethod\\",\\n              \\"VideoPlayerSize\\",\\n              \\"VideoDurationInSeconds\\",\\n              \\"VideoPlayerRatio\\",\\n              \\"Ssp\\",\\n              \\"Country\\",\\n              \\"Region\\",\\n              \\"PostalCode\\",\\n              \\"UserBehavior\\"\\n            ]\\n          },\\n          \\"default\\": null\\n        },\\n        \\"metrics\\": {\\n          \\"type\\": \\"array\\",\\n          \\"items\\": {\\n            \\"description\\": \\"    Metrics represents the quantity that we wish to measure\\\\r\\\\n\\\\r\\\\n    Glossary:\\\\r\\\\n        Audience\\\\r\\\\n            Users or devices that were seen online and were eligible to be served an ad. When\\\\r\\\\n            several devices can be related to one user, it counts for 1, otherwise it reflects the\\\\r\\\\n            number of devices\\\\r\\\\n\\\\r\\\\n        Clicks\\\\r\\\\n            The number of clicks driven by the ads\\\\r\\\\n\\\\r\\\\n        Cost\\\\r\\\\n            The overall cost of your ads or video ads\\\\r\\\\n\\\\r\\\\n        CostPerResult\\\\r\\\\n            What your ad set has cost per configured result unit for your selected period.\\\\r\\\\n\\\\r\\\\n        Cpc\\\\r\\\\n            Cost Per Click - the amount of money spent for the ads to receive one click\\\\r\\\\n\\\\r\\\\n        Cpm\\\\r\\\\n            Cost Per Mille - the amount of money spent per thousand displays, available for CPM\\\\r\\\\n            based ad sets only\\\\r\\\\n\\\\r\\\\n        Ctr\\\\r\\\\n            Click-Through Rate - literally, the rate or frequency at which users click through to a\\\\r\\\\n            landing page from an ad\\\\r\\\\n\\\\r\\\\n        Displays\\\\r\\\\n            The number of times your ads have been shown on a screen\\\\r\\\\n\\\\r\\\\n        Ecpm\\\\r\\\\n            Effective Cost Per Mille - the amount of money spent per thousand displays\\\\r\\\\n\\\\r\\\\n        ExposedUsers\\\\r\\\\n            The number of users who have been served an ad\\\\r\\\\n\\\\r\\\\n        Frequency\\\\r\\\\n            The average number of displays each exposed user has seen.\\\\r\\\\n\\\\r\\\\n        InvalidClicks\\\\r\\\\n            Clicks that don\\\\u0027t meet our quality standards and won\\\\u0027t be billed to you.\\\\r\\\\n\\\\r\\\\n        InvalidDisplays\\\\r\\\\n            Displays that don\\\\u0027t meet our quality standards and won\\\\u0027t be billed to you.\\\\r\\\\n\\\\r\\\\n        Reach\\\\r\\\\n            Share of online eligible users or devices who have been served an ad\\\\r\\\\n\\\\r\\\\n        Result\\\\r\\\\n            What your ad set has achieved based on your configuration for your selected period.\\\\r\\\\n\\\\r\\\\n        UntrackableDisplays\\\\r\\\\n\\\\r\\\\n        NonViewableDisplays\\\\r\\\\n\\\\r\\\\n        Viewability\\\\r\\\\n            The percentage of displayed ads or videos ads that were considered viewable\\\\r\\\\n\\\\r\\\\n        ViewableDisplays\\\\r\\\\n            The number of times at least 50% of the ad appeared for at least 1 second for ads and 2\\\\r\\\\n            seconds for videos ads, once started\\\\r\\\\n\\\\r\\\\n        Visits\\\\r\\\\n            The number of users that were active on your site or app in the hour following clicking\\\\r\\\\n            on your ad\\\\r\\\\n\\\\r\\\\n        Winrate\\\\r\\\\n            Number of displays divided by the total number of display opportunities\\\\r\\\\n\\\\r\\\\n        BounceRate\\\\r\\\\n            Proportion of website visitors leaving after seeing only one page\\\\r\\\\n\\\\r\\\\n        Cpv\\\\r\\\\n            Cost Per Visit - the amount of money spent to get one visit on your website\\\\r\\\\n\\\\r\\\\n        AppInstall\\\\r\\\\n            The number of installations of application\\\\r\\\\n\\\\r\\\\n        Cpi\\\\r\\\\n            Cost Per Install - the amount of money that needs to be spent to get one app installed\\\\r\\\\n\\\\r\\\\n        Cpqv\\\\r\\\\n            Cost Per Qualified Visit - the amount of money spent to get one qualified visit on your\\\\r\\\\n            website\\\\r\\\\n\\\\r\\\\n        InstallRate\\\\r\\\\n            Install Rate - the percentage of completed app installs compared to the clicks that\\\\r\\\\n            occurred\\\\r\\\\n\\\\r\\\\n        QualifiedVisits\\\\r\\\\n            The number of users on the target website for which at least two events or one sale\\\\r\\\\n            event occurred within the hour following the click\\\\r\\\\n\\\\r\\\\n        Assists\\\\r\\\\n            The number of sales one of your campaigns or ad sets contributed to (with clicks or\\\\r\\\\n            displays) on your site or app.\\\\r\\\\n\\\\r\\\\n        AvgCart\\\\r\\\\n            Average revenue generated by a sale\\\\r\\\\n\\\\r\\\\n        Cos\\\\r\\\\n            Cost Of Sales - the ratio between the cost generated by the ad set(s) vs. the revenue\\\\r\\\\n            generated by the sales, figured as a percentage\\\\r\\\\n\\\\r\\\\n        Cpov\\\\r\\\\n            Cost Per Store Visit - the amount of money spent to get one visit on your physical store\\\\r\\\\n\\\\r\\\\n        Cov\\\\r\\\\n            Cost Of advertiser Value - the ratio between the advertiser value generated by the sales\\\\r\\\\n            vs. the cost generated by the ad set(s), figured as a percentage\\\\r\\\\n\\\\r\\\\n        Cpo\\\\r\\\\n            Cost Per Order - the amount of money that needs to be spent to get one order or\\\\r\\\\n            transaction\\\\r\\\\n\\\\r\\\\n        Cvr\\\\r\\\\n            ConVersion Rate - the percentage of completed purchases compared to the clicks that\\\\r\\\\n            occurred\\\\r\\\\n\\\\r\\\\n        AssistsSalesRatio\\\\r\\\\n            The ratio between your assisted sales and sales made on your site or app.\\\\r\\\\n\\\\r\\\\n        OmnichannelRevenue\\\\r\\\\n            The revenue generated by online and in-store sales.\\\\r\\\\n\\\\r\\\\n        OmnichannelRoas\\\\r\\\\n            Omnichannel Return on Ad Spend. The ratio between revenue generated online and in-store,\\\\r\\\\n            and the cost.\\\\r\\\\n\\\\r\\\\n        OmnichannelSales\\\\r\\\\n            The number of online and in store transactions or conversions resulting from Criteo ads.\\\\r\\\\n\\\\r\\\\n        Revenue\\\\r\\\\n            The amount of money generated by the online sales\\\\r\\\\n\\\\r\\\\n        Roas\\\\r\\\\n            Return On Ad Spend - the ratio between the revenue generated and the cost\\\\r\\\\n\\\\r\\\\n        Sales\\\\r\\\\n            The number of completed e-commerce transactions or purchases\\\\r\\\\n\\\\r\\\\n        OfflineRevenue\\\\r\\\\n            The amount of revenue generated by in-store sales.\\\\r\\\\n\\\\r\\\\n        OfflineRoas\\\\r\\\\n            Store Return on Ad Spend. The ratio between the revenue generated in-store and the cost.\\\\r\\\\n\\\\r\\\\n        OfflineSales\\\\r\\\\n            The number of completed in-store transactions or purchases.\\\\r\\\\n\\\\r\\\\n        OfflineVisits\\\\r\\\\n            The number of visits to one of the physical stores\\\\r\\\\n\\\\r\\\\n        Currency\\\\r\\\\n\\\\r\\\\n        VideoAvoc\\\\r\\\\n            The number of times one of your videos was viewable and audible when it reached\\\\r\\\\n            completion\\\\r\\\\n\\\\r\\\\n        VideoCompletionRate\\\\r\\\\n            The percentage of started videos that played for their entire duration\\\\r\\\\n\\\\r\\\\n        VideoCpcv\\\\r\\\\n            The average cost of a video played for its entire duration\\\\r\\\\n\\\\r\\\\n        VideoCpv\\\\r\\\\n            The average cost of a video that started playing\\\\r\\\\n\\\\r\\\\n        VideoComplete\\\\r\\\\n            The number of times one of your videos played for its entire duration\\\\r\\\\n\\\\r\\\\n        VideoFirstQuartile\\\\r\\\\n            The number of times one of your videos played to 25% of its duration\\\\r\\\\n\\\\r\\\\n        VideoMidpoint\\\\r\\\\n            The number of times one of your videos played to 50% of its duration\\\\r\\\\n\\\\r\\\\n        VideoThirdQuartile\\\\r\\\\n            The number of times one of your videos played to 75% of its duration\\\\r\\\\n\\\\r\\\\n        VideoAverageViewRate\\\\r\\\\n            The average played percentage of a started video\\\\r\\\\n\\\\r\\\\n        VideoStartRate\\\\r\\\\n            The percentage of displayed videos that started playing\\\\r\\\\n\\\\r\\\\n        VideoStart\\\\r\\\\n            The number of times one of your ads started playing\\",\\n            \\"type\\": \\"string\\",\\n            \\"enum\\": [\\n              \\"Audience\\",\\n              \\"Clicks\\",\\n              \\"Cost\\",\\n              \\"CostPerResult\\",\\n              \\"Cpc\\",\\n              \\"Cpm\\",\\n              \\"Ctr\\",\\n              \\"Displays\\",\\n              \\"Ecpm\\",\\n              \\"ExposedUsers\\",\\n              \\"Frequency\\",\\n              \\"InvalidClicks\\",\\n              \\"InvalidDisplays\\",\\n              \\"Reach\\",\\n              \\"Result\\",\\n              \\"UntrackableDisplays\\",\\n              \\"NonViewableDisplays\\",\\n              \\"Viewability\\",\\n              \\"ViewableDisplays\\",\\n              \\"Visits\\",\\n              \\"Winrate\\",\\n              \\"BounceRate\\",\\n              \\"Cpv\\",\\n              \\"AppInstall\\",\\n              \\"Cpi\\",\\n              \\"Cpqv\\",\\n              \\"InstallRate\\",\\n              \\"QualifiedVisits\\",\\n              \\"Assists\\",\\n              \\"AvgCart\\",\\n              \\"Cos\\",\\n              \\"Cpov\\",\\n              \\"Cov\\",\\n              \\"Cpo\\",\\n              \\"Cvr\\",\\n              \\"AssistsSalesRatio\\",\\n              \\"OmnichannelRevenue\\",\\n              \\"OmnichannelRoas\\",\\n              \\"OmnichannelSales\\",\\n              \\"Revenue\\",\\n              \\"Roas\\",\\n              \\"Sales\\",\\n              \\"OfflineRevenue\\",\\n              \\"OfflineRoas\\",\\n              \\"OfflineSales\\",\\n              \\"OfflineVisits\\",\\n              \\"Currency\\",\\n              \\"VideoAvoc\\",\\n              \\"VideoCompletionRate\\",\\n              \\"VideoCpcv\\",\\n              \\"VideoCpv\\",\\n              \\"VideoComplete\\",\\n              \\"VideoFirstQuartile\\",\\n              \\"VideoMidpoint\\",\\n              \\"VideoThirdQuartile\\",\\n              \\"VideoAverageViewRate\\",\\n              \\"VideoStartRate\\",\\n              \\"VideoStart\\"\\n            ]\\n          },\\n          \\"default\\": null\\n        },\\n        \\"attributionModel\\": {\\n          \\"description\\": \\"    Attribution models define how sales are credited to advertising campaigns.\\\\r\\\\n\\\\r\\\\n    Available models:\\\\r\\\\n\\\\r\\\\n        Pv1d: 1-Day Post View\\\\r\\\\n        \\\\u2014 Sale is attributed when a user views an ad and purchases within 24 hours.\\\\r\\\\n\\\\r\\\\n        Pc1d: 1-Day Post Click\\\\r\\\\n        \\\\u2014 Sale is attributed when a user clicks an ad and purchases within 24 hours.\\\\r\\\\n\\\\r\\\\n        Pc7d: 7-Day Post Click\\\\r\\\\n        \\\\u2014 Sale is attributed when a user clicks an ad and purchases within 7 days.\\\\r\\\\n\\\\r\\\\n        Pv7d: 7-Day Post View\\\\r\\\\n        \\\\u2014 Sale is attributed when a user views an ad and purchases within 7 days.\\\\r\\\\n\\\\r\\\\n        Pv14d: 14-Day Post View\\\\r\\\\n        \\\\u2014 Sale is attributed when a user views an ad and purchases within 14 days.\\\\r\\\\n\\\\r\\\\n        Pv30d: 30-Day Post View\\\\r\\\\n        \\\\u2014 Sale is attributed when a user views an ad and purchases within 30 days.\\\\r\\\\n\\\\r\\\\n        Pc30d: 30-Day Post Click\\\\r\\\\n        \\\\u2014 Sale is attributed when a user clicks an ad and purchases within 30 days.\\\\r\\\\n\\\\r\\\\n        Pc30dPv1d: 30-Day Post Click \\\\u002B 1-Day Post View\\\\r\\\\n        \\\\u2014 Sale is attributed if a user clicks and purchases within 30 days, or views and purchases within 24 hours.\\\\r\\\\n\\\\r\\\\n        Pc7dPv1d: 7-Day Post Click \\\\u002B 1-Day Post View\\\\r\\\\n        \\\\u2014 Sale is attributed if a user clicks and purchases within 7 days, or views and purchases within 24 hours.\\\\r\\\\n\\\\r\\\\n        Lc30d: Last Click\\\\r\\\\n        \\\\u2014 Full credit is given to the last click before a conversion.\\\\r\\\\n\\\\r\\\\n        CAttr: Client Attribution\\\\r\\\\n        \\\\u2014 Attribution is determined by the advertiser using Criteo\\\\u0027s deduplication parameter.\\",\\n          \\"type\\": \\"string\\",\\n          \\"enum\\": [\\n            \\"Pv1d\\",\\n            \\"Pc1d\\",\\n            \\"Pc7d\\",\\n            \\"Pv7d\\",\\n            \\"Pv14d\\",\\n            \\"Pv30d\\",\\n            \\"Pc30d\\",\\n            \\"Pc30dPv1d\\",\\n            \\"Lc30d\\",\\n            \\"CAttr\\",\\n            \\"Pc7dPv1d\\"\\n          ],\\n          \\"default\\": \\"Pc30d\\"\\n        },\\n        \\"additionalFilters\\": {\\n          \\"type\\": \\"array\\",\\n          \\"items\\": {\\n            \\"description\\": \\"Represents a filter for a specific dimension and its associated value.\\\\r\\\\nUsed to narrow down data based on a selected dimension and a target value.\\",\\n            \\"type\\": \\"object\\",\\n            \\"properties\\": {\\n              \\"dimension\\": {\\n                \\"description\\": \\"    Enumeration of standardized dimensions used in online advertising projections.\\\\r\\\\n\\\\r\\\\n    Each member represents a dimension or attribute commonly used in digital marketing analytics,\\\\r\\\\n    campaign performance tracking, and audience segmentation.\\\\r\\\\n\\\\r\\\\n    Glossary:\\\\r\\\\n        Advertiser\\\\r\\\\n            Name or entity running the ad campaign(s). Also called Client\\\\r\\\\n\\\\r\\\\n        MarketingCampaign\\\\r\\\\n            Full name of the marketing campaign. A group of ad sets.\\\\r\\\\n\\\\r\\\\n        Campaign\\\\r\\\\n            An ad set.\\\\r\\\\n\\\\r\\\\n        MediaType\\\\r\\\\n            Type of media used (e.g., video, display, native).\\\\r\\\\n\\\\r\\\\n        MarketingCampaignGoal\\\\r\\\\n            Marketing campaign objective (Retention, Acquisition)\\\\r\\\\n\\\\r\\\\n        Category\\\\r\\\\n            Product or content category (e.g., electronics, fashion).\\\\r\\\\n\\\\r\\\\n        Device\\\\r\\\\n            Type of device used (e.g., mobile, desktop, tablet).\\\\r\\\\n\\\\r\\\\n        Os\\\\r\\\\n            Operating system of the device (e.g., iOS, Android, Windows).\\\\r\\\\n\\\\r\\\\n        AdChannel\\\\r\\\\n            Specific advertising channel (e.g., programmatic, direct).\\\\r\\\\n\\\\r\\\\n        AdSocialNetwork\\\\r\\\\n            Social media platform used (e.g., Facebook, TikTok).\\\\r\\\\n\\\\r\\\\n        Ad\\\\r\\\\n            A creative\\\\r\\\\n\\\\r\\\\n        Coupon\\\\r\\\\n            A creative coupon\\\\r\\\\n\\\\r\\\\n        AdFormat\\\\r\\\\n            Format of the ad (e.g., banner, interstitial, carousel).\\\\r\\\\n\\\\r\\\\n        DisplaySize\\\\r\\\\n            Size of the display area for the ad.\\\\r\\\\n\\\\r\\\\n        VideoPlacement\\\\r\\\\n            Placement type for video ads (e.g., in-stream, out-stream).\\\\r\\\\n\\\\r\\\\n        VideoPlaybackMethod\\\\r\\\\n            How the video was played (e.g., autoplay, click-to-play).\\\\r\\\\n\\\\r\\\\n        VideoPlayerSize\\\\r\\\\n            Dimensions of the video player.\\\\r\\\\n\\\\r\\\\n        VideoDurationInSeconds\\\\r\\\\n            Length of the video ad.\\\\r\\\\n\\\\r\\\\n        VideoPlayerRatio\\\\r\\\\n            Aspect ratio of the video player (e.g., 16:9).\\\\r\\\\n\\\\r\\\\n        Ssp\\\\r\\\\n            Supply Side Partner. The publishing network where displays were made.\\\\r\\\\n\\\\r\\\\n        Country\\\\r\\\\n            Country where the ad was served.\\\\r\\\\n\\\\r\\\\n        Region\\\\r\\\\n            Region or state within the country.\\\\r\\\\n\\\\r\\\\n        PostalCode\\\\r\\\\n            Postal or ZIP code.\\\\r\\\\n\\\\r\\\\n        UserBehavior\\\\r\\\\n            Behavioral segment of the user (e.g., frequent buyer).\\\\r\\\\n\\",\\n                \\"type\\": \\"string\\",\\n                \\"enum\\": [\\n                  \\"Advertiser\\",\\n                  \\"MarketingCampaign\\",\\n                  \\"Campaign\\",\\n                  \\"MediaType\\",\\n                  \\"MarketingCampaignGoal\\",\\n                  \\"Category\\",\\n                  \\"Device\\",\\n                  \\"Os\\",\\n                  \\"AdChannel\\",\\n                  \\"AdSocialNetwork\\",\\n                  \\"Ad\\",\\n                  \\"Coupon\\",\\n                  \\"AdFormat\\",\\n                  \\"DisplaySize\\",\\n                  \\"VideoPlacement\\",\\n                  \\"VideoPlaybackMethod\\",\\n                  \\"VideoPlayerSize\\",\\n                  \\"VideoDurationInSeconds\\",\\n                  \\"VideoPlayerRatio\\",\\n                  \\"Ssp\\",\\n                  \\"Country\\",\\n                  \\"Region\\",\\n                  \\"PostalCode\\",\\n                  \\"UserBehavior\\"\\n                ]\\n              },\\n              \\"value\\": {\\n                \\"type\\": \\"string\\"\\n              }\\n            },\\n            \\"required\\": [\\n              \\"dimension\\",\\n              \\"value\\"\\n            ]\\n          },\\n          \\"default\\": null\\n        }\\n      },\\n      \\"required\\": [\\n        \\"filters\\"\\n      ]\\n    }\\n  },\\n  {\\n    \\"type\\": \\"function\\",\\n    \\"name\\": \\"final_result\\",\\n    \\"description\\": \\"The final response which ends this conversation. ALWAYS use this tool to return your answer.\\",\\n    \\"parameters\\": {\\n      \\"type\\": \\"object\\",\\n      \\"properties\\": {\\n        \\"input\\": {\\n          \\"description\\": \\"Represents the response generated by an agent after processing a user request.\\\\r\\\\nAny tables and graphs will be generated using data from the internal conversation state.\\\\r\\\\n\\\\r\\\\nThere is no need to explicitly pass the tabular data from any tool as contents of the\\\\r\\\\n\\\\u0060comment\\\\u0060 property. Thus, never generate a markdown table as part of the \\\\u0060comment\\\\u0060 field.\\\\r\\\\n\\\\r\\\\nFields:\\\\r\\\\n    comment:\\\\r\\\\n        A textual response generated by the agent, adhering to the instructions provided in the conversation\\\\r\\\\n\\\\r\\\\n    response_status:\\\\r\\\\n        A classification of the response outcome, indicating how the agent handled the request.\\\\r\\\\n    follow_up_questions:\\\\r\\\\n        A short list of 2\\\\u20133 suggestions for further exploration of the data.\\",\\n          \\"type\\": \\"object\\",\\n          \\"properties\\": {\\n            \\"comment\\": {\\n              \\"description\\": \\"A structured explanation accompanying the agent\\\\u0027s response.\\\\r\\\\n\\\\r\\\\nIf the agent successfully answered the question:\\\\r\\\\n- Provides a **summary** of the result.\\\\r\\\\n- Offers a **brief explanation** of key concepts or logic used.\\\\r\\\\n\\\\r\\\\nIf the agent failed to answer:\\\\r\\\\n- Describes the **problem encountered** (e.g., missing data, ambiguous query).\\\\r\\\\n- Explains the **reason for failure** to help the user understand what went wrong.\\\\r\\\\n\\\\r\\\\nNote:\\\\r\\\\nThis field should **never include the full requested data**.\\\\r\\\\nThat will be provided separately.\\\\r\\\\n\\\\r\\\\nExample:\\\\r\\\\nQuestion: What was the total spend for each campaign in May 2025?\\\\r\\\\n\\\\r\\\\nSummary: The total spend for all campaigns in May 2025 was 1,240,391.25.\\\\r\\\\n\\\\r\\\\nExplanation: \\\\u0027Spend\\\\u0027 or \\\\u0027Cost\\\\u0027 refers to the total amount of money invested\\\\r\\\\nin an advertising campaign during a specified period.\\\\r\\\\nIt\\\\u0027s a direct measure of your advertising expenditure.\\",\\n              \\"type\\": \\"string\\"\\n            },\\n            \\"response_status\\": {\\n              \\"description\\": \\"    Enumerates the possible outcomes of an agent\\\\u0027s response.\\\\r\\\\n\\\\r\\\\n    Glossary:\\\\r\\\\n        Success\\\\r\\\\n            The agent successfully processed the request and returned a valid response.\\\\r\\\\n\\\\r\\\\n        OutOfScope\\\\r\\\\n            The request falls outside the agent\\\\u0027s capabilities or domain of knowledge.\\\\r\\\\n\\\\r\\\\n        NeedsFeedback\\\\r\\\\n            The agent requires additional information or clarification from the user to proceed.\\\\r\\\\n\\\\r\\\\n        NoDataFound\\\\r\\\\n            The tool call did not return any data.\\\\r\\\\n\\\\r\\\\n        Forbidden\\\\r\\\\n            The user is not authorized to access the requested information or perform the requested action.\\\\r\\\\n\\\\r\\\\n        InvalidDates\\\\r\\\\n            From and to Dates must not overlap or be in the future\\\\r\\\\n\\\\r\\\\n        Unknown\\\\r\\\\n            The response could not be classified into any known category, possibly due to unexpected behavior.\\",\\n              \\"type\\": \\"string\\",\\n              \\"enum\\": [\\n                \\"Success\\",\\n                \\"OutOfScope\\",\\n                \\"NeedsFeedback\\",\\n                \\"NoDataFound\\",\\n                \\"Forbidden\\",\\n                \\"InvalidDates\\",\\n                \\"Unknown\\"\\n              ]\\n            },\\n            \\"follow_up_questions\\": {\\n              \\"description\\": \\"Include 2\\\\u20133 suggestions for further exploration of the data.\\\\r\\\\n\\\\r\\\\nSuggestions must be directly relevant to the user\\\\u2019s last query and any provided data context.\\\\r\\\\nEach suggestion must be concise (\\\\u2264 8 words).\\\\r\\\\nDo not use vague or broad terms like \\\\u201Cshow more data\\\\u201D or \\\\u201Cexplore further.\\\\u201D\\\\r\\\\nDo not include multiple options in one suggestion (e.g., \\\\u201Cchange date or campaign\\\\u201D is not allowed).\\\\r\\\\nSuggestions must focus on changing a single parameter that can be used to query data:\\\\r\\\\nDate range (e.g., last 7 days, Q1 2025)\\\\r\\\\nTime aggregation (e.g., daily, weekly, monthly)\\\\r\\\\nMetrics (e.g., CTR, ROAS, CPC)\\\\r\\\\nCampaigns or AdGroups (specific names or IDs)\\\\r\\\\nAttribution model (e.g., 7-day click, 30-day view)\\\\r\\\\nBreakdowns (e.g., by country, device, region)\\\\r\\\\nBe explicit about the parameter and value:\\\\r\\\\nDO PROPOSE: \\\\u201CChange date range to last month\\\\u201D\\\\r\\\\nDO NOT PROPOSE: \\\\u201CUse a different date range\\\\u201D\\\\r\\\\nDo not include optimization advice, strategy, or interpretation (e.g., \\\\u201CHow to improve performance\\\\u201D is forbidden).\\\\r\\\\nSuggestions must be actionable queries, not opinions or summaries.\\\\r\\\\nAvoid repeating the same dimension unless the value changes meaningfully.\\\\r\\\\n\\\\r\\\\n## Allowed follow-up Questions Examples\\\\r\\\\nChange date range to last month.\\\\r\\\\nAggregate data by campaign.\\\\r\\\\nCompare CTR across campaigns.\\\\r\\\\nBreak down by country.\\\\r\\\\nUse 7-day click attribution model.\\\\r\\\\n\\\\r\\\\n## Not Allowed follow-up Questions Examples\\\\r\\\\nShow more insights.\\\\r\\\\nExplore other opportunities.\\\\r\\\\nWhat should I change?\\\\r\\\\nAny suggestions for optimization?\\\\r\\\\nGeneral advice or interpretation.\\",\\n              \\"type\\": \\"array\\",\\n              \\"items\\": {\\n                \\"type\\": \\"string\\"\\n              }\\n            }\\n          },\\n          \\"required\\": [\\n            \\"comment\\",\\n            \\"response_status\\",\\n            \\"follow_up_questions\\"\\n          ]\\n        }\\n      },\\n      \\"required\\": [\\n        \\"input\\"\\n      ]\\n    }\\n  }\\n]","clientId":"22291","date":"03/09/2026","gen_ai.system_instructions":"[\\n  {\\n    \\"type\\": \\"text\\",\\n    \\"content\\": \\"You are an expert on statistical analysis for the adtech company Criteo.\\\\nYour goal is to provide marketing statistics from Criteo users\' ongoing ad campaigns, along with their full context.\\\\n\\\\n# Information\\\\n\\\\n- today is 2026-03-09\\\\n- The default sales attribution model is 30 day post-click unless otherwise specified by the user.\\\\n- The default time zone is Europe/London unless otherwise specified by the user.\\\\n- The default currency is EUR unless otherwise specified by the user.\\\\n\\\\n# Conversation instructions\\\\n\\\\nNever make up data that the user asks for. You must use the provided tools to retrieve data.\\\\n\\\\nAlways respond in a clear, professional, and conversational manner. Confirm your understanding of user intent, especially for complex requests.\\\\n\\\\nIf you do not understand a user request do both, say `I’m not quite sure what you mean. To provide you with data-driven insights from your campaigns, please let me know which campaign or metric you\'d like me to report on.` and also use response_status `OutOfScope`.\\\\n\\\\nIf a user requests any form of data visualization (e.g., `show me a line chart`, `display this data in a graph`, `create a plot`, ...), respond with: `I can provide you with the requested data and its full context, but I have no latitude on its graphical representation.`\\\\nDo not attempt to create charts, graphs, or any other visualizations under any circumstances.\\\\n\\\\nIf the user provides partial information use the default values as much as possible to call the tool. Ask clarifying questions only if strictly necessary. If you ask clarifying questions, use response_status `NeedsFeedback` but only if you haven\'t already used `OutOfScope` or `NoDataFound`.\\\\n\\\\n## Glossary\\\\n\\\\nHere are some common terms that you might encounter.\\\\n\\\\n- QBR - Quarterly Business Review. A strategic review with the client every quarter.\\\\n- WBR - Weekly Business Review. Operational checkpoints to review weekly performance.\\\\n- MBR - Monthly Business Review. Middle-ground between WBR and QBR.\\\\n- EOW - End of week\\\\n- EOM - End of Month\\\\n- HBR - Half-Yearly Business Review\\\\n- ABR - Annual Business Review\\\\n- QOP / Quarterly Operating Plan Review - Review of operational KPIs every quarter\\\\n- OKRs - Objectives and Key Results\\\\n- BPS / Basis Points - Used to discuss changes in percentage points (100 bps = 1%)\\\\n- YOY - Year-over-year\\\\n- WOW - Week-over-week\\\\n- MOM - Month-over-month\\\\n- Spend Pacing - Whether the campaign is on track to spend budget\\\\n- Underpacing / Overpacing - Spending slower/faster than the plan\\\\n- Budget Fluidity - Willingness of client to move budgets between channels\\\\n\\\\nUnless otherwise specified, when a user is asking about a business review (QBR, WBR, MBR, HBR, ABR) assume that sales-related metrics are important to the user: cost, sales, ROAS; and that the user wants this information by ad set.\\\\n\\\\n## Tool Response\\\\n\\\\nIf a tool responds with a response_status `Retry`. Follow the instructions in `message` and RETRY without asking.\\\\nIf a tool responds with a response_status `DuplicateToolCall`. ALWAYS Move to the next step of your execution plan. You already received the data from the tool.\\\\n\\\\n## Agent Response Guidelines\\\\n\\\\nALWAYS use the \'final_result\' tool to communicate your final answer to the user.\\\\nProvide as concise an answer as possible. Follow these guidelines:\\\\n\\\\n### If the agent successfully answered the question:\\\\n- Include a **summary** of the result.\\\\n- Expose the **parameters** (date range, time zone, attribution model, currency) used to call get_custom_report if it was called.\\\\n\\\\n### If the agent failed to answer:\\\\n- Describe the **problem encountered** (e.g., missing data, ambiguous query).\\\\n- Explain the **reason for failure** to help the user understand what went wrong.\\\\n\\\\n### Important:\\\\n- **Never include the full requested data** in the comment.\\\\n- The data will be provided to the user separately.\\\\n- Never call get_custom_report twice with different date ranges. Use previous_period_from_date instead\\\\n- Explain adtech terms as needed, and adapt detail level to the user’s query, responses and expertise.\\\\n\\\\n## Tool Response Examples\\\\n\\\\n**Question**: What was the total spend for each campaign in May 2025?\\\\n\\\\n**Response**:\\\\n\\\\n> ### Summary\\\\n> The total spend for all campaigns in May 2025 was 1,240,391.25.\\\\n>\\\\n> ### Parameters\\\\n> - Data was computed from 2025-05-01 to 2025-05-31 with time zone Europe/London.\\\\n> - Attribution model chosen is 30-Day Post Click\\\\n> - currency: EUR\\\\n\\\\n**Question:** list my adsets optimized for conversion\\\\n\\\\n**Response:**\\\\n\\\\n> ### Summary\\\\n> You have actually 6 adsets optimized for conversion. 2 of them are currently active.\\\\n\\\\n# DATA PRIVACY AND LEGAL REQUIREMENTS\\\\n\\\\n- Conduct: Enforce Criteo Advertising, Supply Partner, and Privacy Guidelines. Promote ethical, compliant, effective advertising.\\\\n- If you reject based on those criteria set final_result.response_status to Forbidden\\\\n\\\\nEnforcement\\\\n1) Prohibited - Reject:\\\\n\\\\nHarassment/hate/discrimination; adult/sexual services/suggestive; deceptive/misleading/fraud/predatory; illegal drugs/paraphernalia; firearms/weapons/explosives/fireworks; shocking/violent/obscene/disturbing; counterfeit/piracy/IP violations; affairs/escorting/prostitution/mail-order brides; malware/spyware/forced downloads/harmful code; targeting children under the age of consent.\\\\nResponse: \\\\\\"I can\'t fulfil this request because it involves prohibited advertising content under Criteo\'s guidelines.\\\\\\"\\\\n\\\\n2) Restricted - approval required\\\\n\\\\nOnly in authorized regions with explicit approval: online pharmacies/healthcare/prescription drugs/sexual enhancers/weight loss; alcohol/tobacco/vaping/e-cigs; gambling/lotteries/sports betting/fantasy sports; financial services/insurance/investments; psychics/astrology/occult.\\\\nResponse: \\\\\\"This request falls into a restricted category and can only be fulfilled with prior approval from Criteo and in permitted countries.\\\\\\"\\\\n\\\\n3) Privacy - reject if non-compliant\\\\n\\\\nComply with GDPR, CCPA, LGPD, and applicable laws. Reject: targeting/reporting on protected traits; any PII misuse; children\'s data or targeting under age of consent; data use without valid, informed, freely given, unambiguous consent (no pre-ticked boxes, continued browsing, or ambiguous consent); individual-level reporting (aggregates only).\\\\nResponse: \\\\\\"I can\'t fulfil this request because it doesn\'t comply with privacy and data protection requirements. Please adjust your request to respect user consent and data protection laws.\\\\\\"\\\\n\\\\n- Never speculate or provide unsupported data. Only reference Criteo-approved sources for documentation or support.\\\\n- If handling sensitive data, follow Criteo data privacy guidelines at all times.\\\\n- Refuse to create audiences, give insights, or give recommendations for any request including the following content:\\\\n    - Harmful: harassment, hate speech, shocking, violent, or offensive content.\\\\n    - Sexual or deceptive: adult or pornographic content, infidelity/prostitution, misleading or fraudulent claims.\\\\n    - Illegal or dangerous: drugs (including marijuana), weapons, explosives or fireworks, malware or hacking, dishonest or predatory products.\\\\n    - IP violations: counterfeits, piracy, unauthorized use of likeness.\\\\n    - Protected traits: race, ethnicity, religion or belief, gender, age, sexual orientation or interest, health data, personal identifying information, political opinions, trade union membership, biometric or genetic data, criminal history, financial status.\\\\n    - Children: no targeting under the legal consent age or children\'s sites. Only broad, legally compliant age ranges may be used.\\\\n- Never use proxies or inferred traits for any protected characteristic.\\\\n\\"\\n  }\\n]","gen_ai.response.finish_reasons":"[\\"stop\\"]","gen_ai.response.id":"U7yuaeTyDuKSitQPhLG9kAg","gen_ai.response.model":"gemini-2.5-flash","gen_ai.usage.input_tokens":"2546","gen_ai.usage.output_tokens":"47","host.ip":"10.65.201.20","host.name":"kube-worker0277.kubes10.da1.preprod.crto.in","deployment.environment.name":"preprod","criteo.service.pool":"default","criteo.dc":"da1","service.version":"105537","service.instance.id":"10NDX"},"resourceAttributes":{"deployment.environment.name":"preprod","service.name":"agentic-clientinsights","service.version":"105537","service.instance.id":"10NDX"},"scope":{"name":"Experimental.Microsoft.Extensions.AI","version":"","attributes":{}}}',
    },
    expected: {
      messages: [
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: "What are my month over month performance insights the past quarter, by cost, displays, clicks, CTR, sales, CVR? Please split by campaign taxonomy",
            },
          ],
          source: "input",
        },
        {
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              toolCallId: "get_custom_report",
              toolName: "get_custom_report",
              input: {
                dimensions: ["Campaign"],
                filters: {
                  dateRange: {
                    from_date: "2025-10-01",
                    to_date: "2025-12-31",
                  },
                },
                timeDimension: "Month",
                metrics: ["Cost", "Displays", "Clicks", "Ctr", "Sales", "Cvr"],
              },
              toolType: "tool_call",
            },
            {
              type: "custom",
              kind: "Microsoft.Extensions.AI.TextReasoningContent",
              value: {
                type: "Microsoft.Extensions.AI.TextReasoningContent",
                content: {
                  text: "",
                  protectedData:
                    "CooKAY89a1+CDPFO/TMZiXeenaPLkZSQA1LTxbQ7KmbinWe/uwbMou6HLwBeN20ZvZ+7QHhxpopqxYuZugBc3x3GariQWXjIh9esj8BB+ufQmBPUKMGRmM3tSqw0KqQ/TlEqq81dTM6leDfHUfiAfSa45iC4IUVWHtrD9ZXtN6O6HxdxN+/zf5tU3rS1zIKAsDev2nqR2tAYqG9FVtnC4Y//05fVMFq9BQjxlsfYhFn+pMIAnH9/GjM5iIzbg3eqH6EDqIuRHIT+Bg/8+bXd9PPgHKXZlcu/9aaQsOHbh9+8eSOfZgzzZ1wRHYAcj9i5fdnlK3UfKYTBoaXdPoqOc7mVteUKELYSY4xyh0Dzbp/27qTBPG1pgFuoxJV9NDi7zJiMby0HfRRVcL/kpI7z5Vxg3rSCMvlNFQHxVvglsDCoiQAph9373SSUKUvh2LgfclHi/nxcZOhKNpds/SFXj3cjZUi5NpFT/O2qhBat27ztbMpoL2j/aYrQ5HDxE+yJOLgUyeO3LoS+xw1eTsUcGTNb73T2g3RexvR+CuP5JqpFYX9oxU7A/98+DP7UaXSeV1cxHCGWShSvwTMDixO75AMhNspXiYa1ZiFOBmyWhOU4Mdqimh4uNXRmx3SVm8/XIkidZq0ffqXqRyPkN1TI9/Q6Uuy19QMbQZxLHdLYd9cXQCoNvYEYr1X76pHA3UVRnz2hors/vTmAvZqdGYI/42gWKNy5kntAVssG0UOTkrt7cMgW2pZNFTe3aMVvZL5cTuI+ssfxrtl7YqpopDexX1b0szixtkt0O69r1kl8W0ubJ2/YdcJ5NjC2AMaFSceYrU57tbupvBx4UXuOxhIUEX6N3Ce2ctEw1rBm82PabYFnjMs3Jm9jWt9MDXkX4yTVjwoEYFY9ID9DvevwB0C0oWF4NFVLGL6PUFbHwMyBhbab2Py11xfn8HHWokguKc9fsbBOJNnMcRW9zHpiGyYE9bQNbEvanqg12zGMXgRKA5YJgItmt4drDAaWT6TF+GxpBFNNhn6dStlOH/gpv1/VXZ4+lX4+KSgYyNu+NQi+zWJesvDYesooB2lhJfO0+Cvp0ogs++/TmPpQk6MJBF4nblugcfdXe5sd5wMf8ggmzgRRyuOHMhnyf/YPPLHP4cZPjxTtZ1yIYq4VJNlrvn7bTEhbWq3CubPaR8srZHyr9GlPTryxK7Gpi87uFlZdKa6rl0OSwSa+DatBcmPlXymdSbWc7+83mYSQtoLKlKkGESyqfYOmUQv89bx8UbBy8+BrKOlGbK9buQCTii560lj1IqV/IWH4QZ+NUp9KgU5HIKGw5LukDkK1ieWCiKWcQRYOor1oo3GXu6k0OTG01e+bCAvVoIeiZyPFtP5C3Q/wwyYZKZrLWNCg2SJOuIs2xTgidX0lzJY3XUAcTKAUP9xWYG8OLtm/ihzKxVP/rJbWfbir9ORnSqgJfzdXx0bhYzsOB3A0lUMfAGzRF4o4euym8IXMamJGt6xxxX4+prIFQ5G7ktVHhz23WlU6k4BdsaFoHmCu/xmGDsVhhyU1EG9wAbR7MwM5OgdQO9+C6m0tn1W1QzygSvyrDCBhmefwoU7AzZT7wR4WzNrpZefBV1EhDEp4lbRbSNnF85+0jlXcVrBhFeHENd5t9SFy7utTxdNEtBV6rBdvHf3Il6/Q9+mpUkXk8oFqfDHjfm8iubt5vBxYGlQqYGaXxsOVP7/B",
                },
              },
            },
          ],
          finishReason: {
            type: "stop",
            raw: "stop",
          },
          source: "output",
        },
      ],
      toolDefinitions: [
        {
          name: "get_adset_infos",
          description:
            "Retrieves all ad sets matching conditions set in the filter (also referred to as campaigns)\r\nThis method should be called by the agent whenever\r\nit needs information about one or more ad sets.\r\nIt provides a comprehensive list of ad sets with key metadata and status fields.\r\n\r\nReturns:\r\n-------\r\nResponse\r\n    An object containing data with the following information for each ad set:\r\n    - id: The unique identifier of the ad set (also called Campaign ID).\r\n    - name: The name of the ad set.\r\n    - advertiserId: The ID of the advertiser that owns this ad set.\r\n    - objective (MarketingObjective): The marketing objective associated with the ad set: Acquisition or Retention.\r\n    - startDate: The start date of the ad set, if specified.\r\n    - activationStatus: Indicates whether the ad set is currently active: Activated or NotActivated\r\n    - deliveryStatus: Describes the current delivery state of the ad set: Running, Archived or NotRunning\r\n\r\nNotes:\r\n-----\r\nUse this method as the primary source for retrieving ad set (campaign) information.",
          inputSchema: {
            type: "object",
            properties: {
              filter: {
                description: "The filters applied for selecting the ad_sets",
                type: "object",
                properties: {
                  adset_ids: {
                    type: ["array", "null"],
                    items: {
                      type: "integer",
                    },
                  },
                  names: {
                    type: ["array", "null"],
                    items: {
                      type: "string",
                    },
                  },
                  activation_statuses: {
                    type: ["array", "null"],
                    items: {
                      type: "string",
                      enum: ["NotActivated", "Activated"],
                    },
                  },
                  objectives: {
                    type: ["array", "null"],
                    items: {
                      type: "string",
                      enum: ["NotSet", "Acquisition", "Retention"],
                    },
                  },
                  delivery_statuses: {
                    type: ["array", "null"],
                    items: {
                      type: "string",
                      enum: ["Running", "Archived", "NotRunning"],
                    },
                  },
                },
              },
            },
            required: ["filter"],
          },
          type: "function",
        },
        {
          name: "get_custom_report",
          description:
            "Calls the API to retrieve client data.\r\n\r\nArgs:\r\n    filters: An object containing the built-in filters.\r\n        Default values are provided if needed.\r\n    timeDimension: Time-based dimension for data projections; specifies the granularity at which data will be grouped.\r\n        Possible values and examples:\r\n            - None: Indicates that the user has not provided any clear time dimension.\r\n                This should be selected when there is no explicit instruction.\r\n                Do NOT infer or assume a value; use None unless the user specifies otherwise.\r\n            - Year: Represents a calendar year.\r\n                Examples: per year, by year, year-over-year comparisons (YoY), yearly trend analysis.\r\n            - Month: Represents a calendar month.\r\n                Examples: per month, by month, month-over-month comparisons (MoM), monthly performance reports.\r\n            - Week: Represents a calendar week.\r\n                Examples: per week, by week, week-over-week comparisons (WoW), weekly campaign summaries.\r\n            - Day: Represents a calendar day.\r\n                Examples: per day, by day, day-over-day comparisons (DoD), daily performance tracking.\r\n            - Hour: Represents an hour within a day.\r\n                Examples: per hour, by hour, hourly trend analysis, intraday performance monitoring.\r\n    dimensions: A list of dimensions that define the granularity of the report.\r\n        Example: [os, device]\r\n    metrics: A list of performance indicators to retrieve.\r\n        Example: [clicks, ctr]\r\n    attributionModel: Specifies the model used to measure sales.\r\n        Optional.\r\n    additionalFilters: Custom filters applied to the data.\r\n        CRITICAL CONSTRAINT: Every dimension used in `additionalFilters` MUST be present in the `dimensions` list.\r\n        If a filter references a dimension not included in `dimensions`, the request will be rejected.\r\n\r\nNotes:\r\n    - Dimensions determine the level of detail in the report.\r\n    - Metrics represent the KPIs to monitor campaign performance.\r\n    - Filters restrict the dataset retrieved from the API.\r\n    - `additionalFilters` allow for extra filtering, but only on dimensions explicitly listed in `dimensions`.",
          inputSchema: {
            type: "object",
            properties: {
              filters: {
                description:
                  "Filters are a way to narrow the scope of the report by setting certain values.\r\nIf no value can be inferred, a default one will be provided.",
                type: "object",
                properties: {
                  clientIds: {
                    type: "array",
                    items: {
                      type: "integer",
                    },
                  },
                  dateRange: {
                    description:
                      'Date range between two dates.\r\nIMPORTANT: from_date and to_date are inclusive (the start and end dates are included in the period).\r\n\r\nIf dates are not given explicitly, they can be deduced as follows:\r\n\r\n- IMPORTANT: Last n days: from = today - n days, to = yesterday (inclusive, does not include today)\r\n    Example: if today is 2025-08-23 then "last 7 days": 2025-08-16 to 2025-08-22 (inclusive, 7 days)\r\n    Example: if today is 2025-08-10 then "last 20 days": 2025-07-21 to 2025-08-09 (inclusive, 20 days)\r\n- Month of May 2025: from = 2025-05-01, to = 2025-05-31\r\n- IMPORTANT: Last week, the last full calendar week (Monday to Sunday) before the current Week:\r\n    from = Monday of previous week\r\n    to = Sunday of previous Week\r\n    Example: if today is Tuesday, 2025-08-12 then "last week" is Monday 2025-08-04 to Sunday 2025-08-10\r\n    Example: if today is Monday, 2025-09-15 then "last week" is Monday 2025-08-14 to Sunday 2025-08-14\r\n- IMPORTANT: Last n weeks, the last n full calendar weeks (Monday to Sunday) before the current Week.\r\n    n is the number of weeks.\r\n    from = Monday of n weeks ago\r\n    to = Sunday of previous Week\r\n    Example: if today is Friday, 2025-08-22 then "last 2 weeks" is\r\n        Monday 2025-08-04 to Sunday 2025-08-17\r\n        n is 2\r\n    Example: if today is Monday, 2025-07-21 then "last 3 weeks" is\r\n        Monday 2025-06-30 to Sunday 2025-07-20\r\n        n is 3\r\n- IMPORTANT: Last month, the last full calendar month before the current month.\r\n    from = first day of previous month\r\n    to = last day of previous month\r\n    Example: if today is Tuesday, 2025-08-19 then "last month" is 2025-07-01 to 2025-07-31\r\n- IMPORTANT: Last n months, the last n full calendar months before the current month.\r\n    n is the number of months.\r\n    from = first day of the month n months ago\r\n    to = last day of previous month\r\n    Example: if today is Monday, 2025-08-19 then "last 3 months" is 2025-05-01 to 2025-07-31\r\n        n is 3\r\n- Last quarter: the last full quarter before the current quarter.\r\n    Q1: January 1 to March 31\r\n    Q2: April 1 to June 30\r\n    Q3: July 1 to September 30\r\n    Q4: October 1 to December 31\r\n\r\n\r\ntime_zone is the IANA time zone name (e.g., "Europe/London", "America/New_York").\r\nBy default, assume that we are in the Europe/London time zone.\r\n\r\nThe field previous_period_from_date is used to define the starting date of a previous period\r\nthat mirrors the current data collection range.\r\nThis allows for comparative analysis between the current period and a similar past period.\r\n\r\nUse the following guidelines and examples to determine the correct value:\r\n\r\nGeneral Rule:\r\nprevious_period_from_date should be set to a date that starts the previous comparable period\r\nthe previous period will have the same duration as the current one\r\nthe previous period and the current period MUST NOT overlap\r\n\r\n    Examples:\r\n    Relative Time Comparison\r\n        If comparing to last year, and from_date = 2025-08-01, then:\r\n            previous_period_from_date = 2024-08-01\r\n        If comparing with the previous period, previous_period_start_date is calculated\r\n        by subtracting the duration of the current date range from its starting date (from_date).\r\n        This ensures the previous period has the same length and ends\r\n        right before the current one begins.\r\n        Example:\r\n            Current range: from_date = 2025-08-10, to_date = 2025-08-19 (10 days including bounds),\r\n            then: previous_period_start_date = 2025-07-31 (10 days before 2025-08-10)\r\n    Custom Period Comparison\r\n        If comparing to the period starting 2025-02-25, then:\r\n            previous_period_from_date = 2025-02-25\r\n',
                    type: "object",
                    properties: {
                      from_date: {
                        type: "string",
                        format: "date",
                      },
                      to_date: {
                        type: "string",
                        format: "date",
                      },
                      time_zone: {
                        type: ["string", "null"],
                      },
                      previous_period_from_date: {
                        type: ["string", "null"],
                        format: "date",
                      },
                    },
                  },
                  currency: {
                    type: "string",
                  },
                  campaignStatus: {
                    type: ["array", "null"],
                    items: {
                      description:
                        "    Status of a campaign\r\n\r\n    Glossary:\r\n        Active\r\n            Active, Running or Live\r\n        NotRunning\r\n            Not running\r\n        Dead\r\n            Archived",
                      type: "string",
                      enum: ["Active", "NotRunning", "Dead"],
                    },
                  },
                  mediaType: {
                    type: ["array", "null"],
                    items: {
                      description:
                        "    Type of media used. video or display.\r\n\r\n    Glossary:\r\n        Display\r\n            HTML display\r\n\r\n        Video\r\n            Video display",
                      type: "string",
                      enum: ["Display", "Video"],
                    },
                  },
                  marketingCampaignGoals: {
                    type: ["array", "null"],
                    items: {
                      type: "string",
                      enum: ["NotSet", "Acquisition", "Retention"],
                    },
                  },
                  campaigns: {
                    type: ["array", "null"],
                    items: {
                      type: "integer",
                    },
                  },
                },
              },
              timeDimension: {
                description:
                  "Defines the time-based dimensions available for data projections.\r\n\r\nEach enum member specifies the granularity at which data can be grouped or analyzed.\r\n\r\nMembers:\r\n    None  - Indicates that the user has not provided any clear time dimension.\r\n        This should be selected when there is no explicit instruction.\r\n        Do NOT infer or assume a value; use None unless the user specifies otherwise.\r\n    Year  - Represents a calendar year. For example per year, by year, year-over-year comparisons (YoY), yearly trend analysis.\r\n    Month - Represents a calendar month. For example per month, by month, month-over-month comparisons (MoM), monthly performance reports.\r\n    Week  - Represents a calendar week. For example per week, by week, week-over-week comparisons (WoW), weekly campaign summaries.\r\n    Day   - Represents a calendar day. For example per day, by day, day-over-day comparisons (DoD), daily performance tracking.\r\n    Hour  - Represents an hour within a day. For example per hour, by hour, hourly trend analysis, intraday performance monitoring.",
                type: "string",
                enum: ["None", "Year", "Month", "Week", "Day", "Hour"],
                default: "None",
              },
              dimensions: {
                type: "array",
                items: {
                  description:
                    "    Enumeration of standardized dimensions used in online advertising projections.\r\n\r\n    Each member represents a dimension or attribute commonly used in digital marketing analytics,\r\n    campaign performance tracking, and audience segmentation.\r\n\r\n    Glossary:\r\n        Advertiser\r\n            Name or entity running the ad campaign(s). Also called Client\r\n\r\n        MarketingCampaign\r\n            Full name of the marketing campaign. A group of ad sets.\r\n\r\n        Campaign\r\n            An ad set.\r\n\r\n        MediaType\r\n            Type of media used (e.g., video, display, native).\r\n\r\n        MarketingCampaignGoal\r\n            Marketing campaign objective (Retention, Acquisition)\r\n\r\n        Category\r\n            Product or content category (e.g., electronics, fashion).\r\n\r\n        Device\r\n            Type of device used (e.g., mobile, desktop, tablet).\r\n\r\n        Os\r\n            Operating system of the device (e.g., iOS, Android, Windows).\r\n\r\n        AdChannel\r\n            Specific advertising channel (e.g., programmatic, direct).\r\n\r\n        AdSocialNetwork\r\n            Social media platform used (e.g., Facebook, TikTok).\r\n\r\n        Ad\r\n            A creative\r\n\r\n        Coupon\r\n            A creative coupon\r\n\r\n        AdFormat\r\n            Format of the ad (e.g., banner, interstitial, carousel).\r\n\r\n        DisplaySize\r\n            Size of the display area for the ad.\r\n\r\n        VideoPlacement\r\n            Placement type for video ads (e.g., in-stream, out-stream).\r\n\r\n        VideoPlaybackMethod\r\n            How the video was played (e.g., autoplay, click-to-play).\r\n\r\n        VideoPlayerSize\r\n            Dimensions of the video player.\r\n\r\n        VideoDurationInSeconds\r\n            Length of the video ad.\r\n\r\n        VideoPlayerRatio\r\n            Aspect ratio of the video player (e.g., 16:9).\r\n\r\n        Ssp\r\n            Supply Side Partner. The publishing network where displays were made.\r\n\r\n        Country\r\n            Country where the ad was served.\r\n\r\n        Region\r\n            Region or state within the country.\r\n\r\n        PostalCode\r\n            Postal or ZIP code.\r\n\r\n        UserBehavior\r\n            Behavioral segment of the user (e.g., frequent buyer).\r\n",
                  type: "string",
                  enum: [
                    "Advertiser",
                    "MarketingCampaign",
                    "Campaign",
                    "MediaType",
                    "MarketingCampaignGoal",
                    "Category",
                    "Device",
                    "Os",
                    "AdChannel",
                    "AdSocialNetwork",
                    "Ad",
                    "Coupon",
                    "AdFormat",
                    "DisplaySize",
                    "VideoPlacement",
                    "VideoPlaybackMethod",
                    "VideoPlayerSize",
                    "VideoDurationInSeconds",
                    "VideoPlayerRatio",
                    "Ssp",
                    "Country",
                    "Region",
                    "PostalCode",
                    "UserBehavior",
                  ],
                },
                default: null,
              },
              metrics: {
                type: "array",
                items: {
                  description:
                    "    Metrics represents the quantity that we wish to measure\r\n\r\n    Glossary:\r\n        Audience\r\n            Users or devices that were seen online and were eligible to be served an ad. When\r\n            several devices can be related to one user, it counts for 1, otherwise it reflects the\r\n            number of devices\r\n\r\n        Clicks\r\n            The number of clicks driven by the ads\r\n\r\n        Cost\r\n            The overall cost of your ads or video ads\r\n\r\n        CostPerResult\r\n            What your ad set has cost per configured result unit for your selected period.\r\n\r\n        Cpc\r\n            Cost Per Click - the amount of money spent for the ads to receive one click\r\n\r\n        Cpm\r\n            Cost Per Mille - the amount of money spent per thousand displays, available for CPM\r\n            based ad sets only\r\n\r\n        Ctr\r\n            Click-Through Rate - literally, the rate or frequency at which users click through to a\r\n            landing page from an ad\r\n\r\n        Displays\r\n            The number of times your ads have been shown on a screen\r\n\r\n        Ecpm\r\n            Effective Cost Per Mille - the amount of money spent per thousand displays\r\n\r\n        ExposedUsers\r\n            The number of users who have been served an ad\r\n\r\n        Frequency\r\n            The average number of displays each exposed user has seen.\r\n\r\n        InvalidClicks\r\n            Clicks that don't meet our quality standards and won't be billed to you.\r\n\r\n        InvalidDisplays\r\n            Displays that don't meet our quality standards and won't be billed to you.\r\n\r\n        Reach\r\n            Share of online eligible users or devices who have been served an ad\r\n\r\n        Result\r\n            What your ad set has achieved based on your configuration for your selected period.\r\n\r\n        UntrackableDisplays\r\n\r\n        NonViewableDisplays\r\n\r\n        Viewability\r\n            The percentage of displayed ads or videos ads that were considered viewable\r\n\r\n        ViewableDisplays\r\n            The number of times at least 50% of the ad appeared for at least 1 second for ads and 2\r\n            seconds for videos ads, once started\r\n\r\n        Visits\r\n            The number of users that were active on your site or app in the hour following clicking\r\n            on your ad\r\n\r\n        Winrate\r\n            Number of displays divided by the total number of display opportunities\r\n\r\n        BounceRate\r\n            Proportion of website visitors leaving after seeing only one page\r\n\r\n        Cpv\r\n            Cost Per Visit - the amount of money spent to get one visit on your website\r\n\r\n        AppInstall\r\n            The number of installations of application\r\n\r\n        Cpi\r\n            Cost Per Install - the amount of money that needs to be spent to get one app installed\r\n\r\n        Cpqv\r\n            Cost Per Qualified Visit - the amount of money spent to get one qualified visit on your\r\n            website\r\n\r\n        InstallRate\r\n            Install Rate - the percentage of completed app installs compared to the clicks that\r\n            occurred\r\n\r\n        QualifiedVisits\r\n            The number of users on the target website for which at least two events or one sale\r\n            event occurred within the hour following the click\r\n\r\n        Assists\r\n            The number of sales one of your campaigns or ad sets contributed to (with clicks or\r\n            displays) on your site or app.\r\n\r\n        AvgCart\r\n            Average revenue generated by a sale\r\n\r\n        Cos\r\n            Cost Of Sales - the ratio between the cost generated by the ad set(s) vs. the revenue\r\n            generated by the sales, figured as a percentage\r\n\r\n        Cpov\r\n            Cost Per Store Visit - the amount of money spent to get one visit on your physical store\r\n\r\n        Cov\r\n            Cost Of advertiser Value - the ratio between the advertiser value generated by the sales\r\n            vs. the cost generated by the ad set(s), figured as a percentage\r\n\r\n        Cpo\r\n            Cost Per Order - the amount of money that needs to be spent to get one order or\r\n            transaction\r\n\r\n        Cvr\r\n            ConVersion Rate - the percentage of completed purchases compared to the clicks that\r\n            occurred\r\n\r\n        AssistsSalesRatio\r\n            The ratio between your assisted sales and sales made on your site or app.\r\n\r\n        OmnichannelRevenue\r\n            The revenue generated by online and in-store sales.\r\n\r\n        OmnichannelRoas\r\n            Omnichannel Return on Ad Spend. The ratio between revenue generated online and in-store,\r\n            and the cost.\r\n\r\n        OmnichannelSales\r\n            The number of online and in store transactions or conversions resulting from Criteo ads.\r\n\r\n        Revenue\r\n            The amount of money generated by the online sales\r\n\r\n        Roas\r\n            Return On Ad Spend - the ratio between the revenue generated and the cost\r\n\r\n        Sales\r\n            The number of completed e-commerce transactions or purchases\r\n\r\n        OfflineRevenue\r\n            The amount of revenue generated by in-store sales.\r\n\r\n        OfflineRoas\r\n            Store Return on Ad Spend. The ratio between the revenue generated in-store and the cost.\r\n\r\n        OfflineSales\r\n            The number of completed in-store transactions or purchases.\r\n\r\n        OfflineVisits\r\n            The number of visits to one of the physical stores\r\n\r\n        Currency\r\n\r\n        VideoAvoc\r\n            The number of times one of your videos was viewable and audible when it reached\r\n            completion\r\n\r\n        VideoCompletionRate\r\n            The percentage of started videos that played for their entire duration\r\n\r\n        VideoCpcv\r\n            The average cost of a video played for its entire duration\r\n\r\n        VideoCpv\r\n            The average cost of a video that started playing\r\n\r\n        VideoComplete\r\n            The number of times one of your videos played for its entire duration\r\n\r\n        VideoFirstQuartile\r\n            The number of times one of your videos played to 25% of its duration\r\n\r\n        VideoMidpoint\r\n            The number of times one of your videos played to 50% of its duration\r\n\r\n        VideoThirdQuartile\r\n            The number of times one of your videos played to 75% of its duration\r\n\r\n        VideoAverageViewRate\r\n            The average played percentage of a started video\r\n\r\n        VideoStartRate\r\n            The percentage of displayed videos that started playing\r\n\r\n        VideoStart\r\n            The number of times one of your ads started playing",
                  type: "string",
                  enum: [
                    "Audience",
                    "Clicks",
                    "Cost",
                    "CostPerResult",
                    "Cpc",
                    "Cpm",
                    "Ctr",
                    "Displays",
                    "Ecpm",
                    "ExposedUsers",
                    "Frequency",
                    "InvalidClicks",
                    "InvalidDisplays",
                    "Reach",
                    "Result",
                    "UntrackableDisplays",
                    "NonViewableDisplays",
                    "Viewability",
                    "ViewableDisplays",
                    "Visits",
                    "Winrate",
                    "BounceRate",
                    "Cpv",
                    "AppInstall",
                    "Cpi",
                    "Cpqv",
                    "InstallRate",
                    "QualifiedVisits",
                    "Assists",
                    "AvgCart",
                    "Cos",
                    "Cpov",
                    "Cov",
                    "Cpo",
                    "Cvr",
                    "AssistsSalesRatio",
                    "OmnichannelRevenue",
                    "OmnichannelRoas",
                    "OmnichannelSales",
                    "Revenue",
                    "Roas",
                    "Sales",
                    "OfflineRevenue",
                    "OfflineRoas",
                    "OfflineSales",
                    "OfflineVisits",
                    "Currency",
                    "VideoAvoc",
                    "VideoCompletionRate",
                    "VideoCpcv",
                    "VideoCpv",
                    "VideoComplete",
                    "VideoFirstQuartile",
                    "VideoMidpoint",
                    "VideoThirdQuartile",
                    "VideoAverageViewRate",
                    "VideoStartRate",
                    "VideoStart",
                  ],
                },
                default: null,
              },
              attributionModel: {
                description:
                  "    Attribution models define how sales are credited to advertising campaigns.\r\n\r\n    Available models:\r\n\r\n        Pv1d: 1-Day Post View\r\n        — Sale is attributed when a user views an ad and purchases within 24 hours.\r\n\r\n        Pc1d: 1-Day Post Click\r\n        — Sale is attributed when a user clicks an ad and purchases within 24 hours.\r\n\r\n        Pc7d: 7-Day Post Click\r\n        — Sale is attributed when a user clicks an ad and purchases within 7 days.\r\n\r\n        Pv7d: 7-Day Post View\r\n        — Sale is attributed when a user views an ad and purchases within 7 days.\r\n\r\n        Pv14d: 14-Day Post View\r\n        — Sale is attributed when a user views an ad and purchases within 14 days.\r\n\r\n        Pv30d: 30-Day Post View\r\n        — Sale is attributed when a user views an ad and purchases within 30 days.\r\n\r\n        Pc30d: 30-Day Post Click\r\n        — Sale is attributed when a user clicks an ad and purchases within 30 days.\r\n\r\n        Pc30dPv1d: 30-Day Post Click + 1-Day Post View\r\n        — Sale is attributed if a user clicks and purchases within 30 days, or views and purchases within 24 hours.\r\n\r\n        Pc7dPv1d: 7-Day Post Click + 1-Day Post View\r\n        — Sale is attributed if a user clicks and purchases within 7 days, or views and purchases within 24 hours.\r\n\r\n        Lc30d: Last Click\r\n        — Full credit is given to the last click before a conversion.\r\n\r\n        CAttr: Client Attribution\r\n        — Attribution is determined by the advertiser using Criteo's deduplication parameter.",
                type: "string",
                enum: [
                  "Pv1d",
                  "Pc1d",
                  "Pc7d",
                  "Pv7d",
                  "Pv14d",
                  "Pv30d",
                  "Pc30d",
                  "Pc30dPv1d",
                  "Lc30d",
                  "CAttr",
                  "Pc7dPv1d",
                ],
                default: "Pc30d",
              },
              additionalFilters: {
                type: "array",
                items: {
                  description:
                    "Represents a filter for a specific dimension and its associated value.\r\nUsed to narrow down data based on a selected dimension and a target value.",
                  type: "object",
                  properties: {
                    dimension: {
                      description:
                        "    Enumeration of standardized dimensions used in online advertising projections.\r\n\r\n    Each member represents a dimension or attribute commonly used in digital marketing analytics,\r\n    campaign performance tracking, and audience segmentation.\r\n\r\n    Glossary:\r\n        Advertiser\r\n            Name or entity running the ad campaign(s). Also called Client\r\n\r\n        MarketingCampaign\r\n            Full name of the marketing campaign. A group of ad sets.\r\n\r\n        Campaign\r\n            An ad set.\r\n\r\n        MediaType\r\n            Type of media used (e.g., video, display, native).\r\n\r\n        MarketingCampaignGoal\r\n            Marketing campaign objective (Retention, Acquisition)\r\n\r\n        Category\r\n            Product or content category (e.g., electronics, fashion).\r\n\r\n        Device\r\n            Type of device used (e.g., mobile, desktop, tablet).\r\n\r\n        Os\r\n            Operating system of the device (e.g., iOS, Android, Windows).\r\n\r\n        AdChannel\r\n            Specific advertising channel (e.g., programmatic, direct).\r\n\r\n        AdSocialNetwork\r\n            Social media platform used (e.g., Facebook, TikTok).\r\n\r\n        Ad\r\n            A creative\r\n\r\n        Coupon\r\n            A creative coupon\r\n\r\n        AdFormat\r\n            Format of the ad (e.g., banner, interstitial, carousel).\r\n\r\n        DisplaySize\r\n            Size of the display area for the ad.\r\n\r\n        VideoPlacement\r\n            Placement type for video ads (e.g., in-stream, out-stream).\r\n\r\n        VideoPlaybackMethod\r\n            How the video was played (e.g., autoplay, click-to-play).\r\n\r\n        VideoPlayerSize\r\n            Dimensions of the video player.\r\n\r\n        VideoDurationInSeconds\r\n            Length of the video ad.\r\n\r\n        VideoPlayerRatio\r\n            Aspect ratio of the video player (e.g., 16:9).\r\n\r\n        Ssp\r\n            Supply Side Partner. The publishing network where displays were made.\r\n\r\n        Country\r\n            Country where the ad was served.\r\n\r\n        Region\r\n            Region or state within the country.\r\n\r\n        PostalCode\r\n            Postal or ZIP code.\r\n\r\n        UserBehavior\r\n            Behavioral segment of the user (e.g., frequent buyer).\r\n",
                      type: "string",
                      enum: [
                        "Advertiser",
                        "MarketingCampaign",
                        "Campaign",
                        "MediaType",
                        "MarketingCampaignGoal",
                        "Category",
                        "Device",
                        "Os",
                        "AdChannel",
                        "AdSocialNetwork",
                        "Ad",
                        "Coupon",
                        "AdFormat",
                        "DisplaySize",
                        "VideoPlacement",
                        "VideoPlaybackMethod",
                        "VideoPlayerSize",
                        "VideoDurationInSeconds",
                        "VideoPlayerRatio",
                        "Ssp",
                        "Country",
                        "Region",
                        "PostalCode",
                        "UserBehavior",
                      ],
                    },
                    value: {
                      type: "string",
                    },
                  },
                  required: ["dimension", "value"],
                },
                default: null,
              },
            },
            required: ["filters"],
          },
          type: "function",
        },
        {
          name: "final_result",
          description:
            "The final response which ends this conversation. ALWAYS use this tool to return your answer.",
          inputSchema: {
            type: "object",
            properties: {
              input: {
                description:
                  "Represents the response generated by an agent after processing a user request.\r\nAny tables and graphs will be generated using data from the internal conversation state.\r\n\r\nThere is no need to explicitly pass the tabular data from any tool as contents of the\r\n`comment` property. Thus, never generate a markdown table as part of the `comment` field.\r\n\r\nFields:\r\n    comment:\r\n        A textual response generated by the agent, adhering to the instructions provided in the conversation\r\n\r\n    response_status:\r\n        A classification of the response outcome, indicating how the agent handled the request.\r\n    follow_up_questions:\r\n        A short list of 2–3 suggestions for further exploration of the data.",
                type: "object",
                properties: {
                  comment: {
                    description:
                      "A structured explanation accompanying the agent's response.\r\n\r\nIf the agent successfully answered the question:\r\n- Provides a **summary** of the result.\r\n- Offers a **brief explanation** of key concepts or logic used.\r\n\r\nIf the agent failed to answer:\r\n- Describes the **problem encountered** (e.g., missing data, ambiguous query).\r\n- Explains the **reason for failure** to help the user understand what went wrong.\r\n\r\nNote:\r\nThis field should **never include the full requested data**.\r\nThat will be provided separately.\r\n\r\nExample:\r\nQuestion: What was the total spend for each campaign in May 2025?\r\n\r\nSummary: The total spend for all campaigns in May 2025 was 1,240,391.25.\r\n\r\nExplanation: 'Spend' or 'Cost' refers to the total amount of money invested\r\nin an advertising campaign during a specified period.\r\nIt's a direct measure of your advertising expenditure.",
                    type: "string",
                  },
                  response_status: {
                    description:
                      "    Enumerates the possible outcomes of an agent's response.\r\n\r\n    Glossary:\r\n        Success\r\n            The agent successfully processed the request and returned a valid response.\r\n\r\n        OutOfScope\r\n            The request falls outside the agent's capabilities or domain of knowledge.\r\n\r\n        NeedsFeedback\r\n            The agent requires additional information or clarification from the user to proceed.\r\n\r\n        NoDataFound\r\n            The tool call did not return any data.\r\n\r\n        Forbidden\r\n            The user is not authorized to access the requested information or perform the requested action.\r\n\r\n        InvalidDates\r\n            From and to Dates must not overlap or be in the future\r\n\r\n        Unknown\r\n            The response could not be classified into any known category, possibly due to unexpected behavior.",
                    type: "string",
                    enum: [
                      "Success",
                      "OutOfScope",
                      "NeedsFeedback",
                      "NoDataFound",
                      "Forbidden",
                      "InvalidDates",
                      "Unknown",
                    ],
                  },
                  follow_up_questions: {
                    description:
                      "Include 2–3 suggestions for further exploration of the data.\r\n\r\nSuggestions must be directly relevant to the user’s last query and any provided data context.\r\nEach suggestion must be concise (≤ 8 words).\r\nDo not use vague or broad terms like “show more data” or “explore further.”\r\nDo not include multiple options in one suggestion (e.g., “change date or campaign” is not allowed).\r\nSuggestions must focus on changing a single parameter that can be used to query data:\r\nDate range (e.g., last 7 days, Q1 2025)\r\nTime aggregation (e.g., daily, weekly, monthly)\r\nMetrics (e.g., CTR, ROAS, CPC)\r\nCampaigns or AdGroups (specific names or IDs)\r\nAttribution model (e.g., 7-day click, 30-day view)\r\nBreakdowns (e.g., by country, device, region)\r\nBe explicit about the parameter and value:\r\nDO PROPOSE: “Change date range to last month”\r\nDO NOT PROPOSE: “Use a different date range”\r\nDo not include optimization advice, strategy, or interpretation (e.g., “How to improve performance” is forbidden).\r\nSuggestions must be actionable queries, not opinions or summaries.\r\nAvoid repeating the same dimension unless the value changes meaningfully.\r\n\r\n## Allowed follow-up Questions Examples\r\nChange date range to last month.\r\nAggregate data by campaign.\r\nCompare CTR across campaigns.\r\nBreak down by country.\r\nUse 7-day click attribution model.\r\n\r\n## Not Allowed follow-up Questions Examples\r\nShow more insights.\r\nExplore other opportunities.\r\nWhat should I change?\r\nAny suggestions for optimization?\r\nGeneral advice or interpretation.",
                    type: "array",
                    items: {
                      type: "string",
                    },
                  },
                },
                required: ["comment", "response_status", "follow_up_questions"],
              },
            },
            required: ["input"],
          },
          type: "function",
        },
      ],
    },
  },
  // Source: worker/src/__tests__/chatml/framework-traces/microsoft-agent-2025-12-17.trace.json; observation 2406e8343fd49c0e
  {
    name: "verbatim microsoft-agent-2025-12-17.trace.json / 2406e8343fd49c0e",
    spanIO: {
      input:
        '[{"role": "user", "parts": [{"type": "text", "content": "What\'s the weather in Tokyo?"}]}]',
      output:
        '[{"role": "assistant", "parts": [{"type": "tool_call", "id": "call_CwaJHuXTm9dmHFQPlVbqyzJ0", "name": "get_weather", "arguments": "{\\"location\\":\\"Tokyo, Japan\\"}"}]}]',
      metadata:
        '{"attributes":{"gen_ai.operation.name":"chat","gen_ai.request.choice.count":"1","gen_ai.provider.name":"openai","gen_ai.request.model":"gpt-5-mini","server.address":"Unknown","gen_ai.tool.definitions":"[{\\"type\\": \\"function\\", \\"function\\": {\\"name\\": \\"get_weather\\", \\"description\\": \\"Get the weather for a given location.\\", \\"parameters\\": {\\"properties\\": {\\"location\\": {\\"description\\": \\"The location to get the weather for.\\", \\"title\\": \\"Location\\", \\"type\\": \\"string\\"}}, \\"required\\": [\\"location\\"], \\"title\\": \\"get_weather_input\\", \\"type\\": \\"object\\"}}}]","gen_ai.response.id":"resp_0e32bda5b6259ecd00694279e271348194a818447145cd1763","gen_ai.response.model":"gpt-5-mini-2025-08-07","gen_ai.usage.input_tokens":"77","gen_ai.usage.output_tokens":"86","gen_ai.client.operation.duration":"3.2887914249999994"},"resourceAttributes":{"telemetry.sdk.language":"python","telemetry.sdk.name":"opentelemetry","telemetry.sdk.version":"1.39.1","service.name":"unknown_service"},"scope":{"name":"agent_framework","version":"1.0.0b251216","attributes":{}}}',
    },
    expected: {
      messages: [
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: "What's the weather in Tokyo?",
            },
          ],
          source: "input",
        },
        {
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              toolCallId: "call_CwaJHuXTm9dmHFQPlVbqyzJ0",
              toolName: "get_weather",
              input: {
                location: "Tokyo, Japan",
              },
              toolType: "tool_call",
            },
          ],
          source: "output",
        },
      ],
      toolDefinitions: [
        {
          name: "get_weather",
          description: "Get the weather for a given location.",
          inputSchema: {
            properties: {
              location: {
                description: "The location to get the weather for.",
                title: "Location",
                type: "string",
              },
            },
            required: ["location"],
            title: "get_weather_input",
            type: "object",
          },
          type: "function",
        },
      ],
    },
  },
];
