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
