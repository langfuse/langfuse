import type { NormalizedIOFixture } from "../fixture-types";

// Docs-derived Responses requests (not captured traces).
// https://developers.openai.com/api/docs/guides/text
export const documentedResponsesFixtures: NormalizedIOFixture[] = [
  ...[
    "Explain retries.",
    [{ role: "user", content: "Explain retries." }],
  ].flatMap((input) =>
    [false, true].map((serialized): NormalizedIOFixture => {
      const request = { model: "gpt-4.1", instructions: "Be concise.", input };
      return {
        name: `Responses ${typeof input === "string" ? "string" : "array"} input with instructions (${serialized ? "JSON" : "object"})`,
        spanIO: {
          input: serialized ? JSON.stringify(request) : request,
          output: undefined,
          metadata: undefined,
        },
        expected: {
          additionalInput: { model: "gpt-4.1" },
          messages: [
            {
              source: "input",
              role: "system",
              parts: [{ type: "text", text: "Be concise." }],
            },
            {
              source: "input",
              role: "user",
              parts: [{ type: "text", text: "Explain retries." }],
            },
          ],
          toolDefinitions: [],
        },
      };
    }),
  ),
  {
    name: "does not claim application data with an input field as Responses",
    spanIO: {
      input: { input: "invoice", total: 42 },
      output: undefined,
      metadata: undefined,
    },
    expected: {
      messages: [
        {
          source: "input",
          role: "user",
          parts: [{ type: "data", value: { input: "invoice", total: 42 } }],
        },
      ],
      toolDefinitions: [],
    },
  },
];

// Anonymized customer payload; prose, names, IDs, and preview content replaced.
export const customerFixtures: NormalizedIOFixture[] = [
  {
    name: "anonymized customer Responses tool history",
    spanIO: {
      input: {
        input: [
          {
            type: "message",
            role: "system",
            content: [
              {
                type: "input_text",
                text: "Sample text",
              },
            ],
          },
          {
            name: "sample_tool_21",
            type: "function_call",
            call_id: "sample_id_1",
            arguments: "{}",
          },
          {
            type: "function_call_output",
            output:
              '{"parts":{"org":{"country":"Sample country","is_multi_entity":true,"name":"Sample name","plan_label":"Sample plan_label","plan_tier_internal":"Sample plan_tier_internal","size_bucket":"Sample size_bucket"},"products":{"enabled_entitlements_at_session_start_internal":["Sample enabled_entitlements_at_session_start_internal","Sample enabled_entitlements_at_session_start_internal","Sample enabled_entitlements_at_session_start_internal","Sample enabled_entitlements_at_session_start_internal","Sample enabled_entitlements_at_session_start_internal","Sample enabled_entitlements_at_session_start_internal","Sample enabled_entitlements_at_session_start_internal","Sample enabled_entitlements_at_session_start_internal","Sample enabled_entitlements_at_session_start_internal"]},"session":{"session_started_at":"Sample session_started_at"},"setup":{"erp_provider_internal":"Sample erp_provider_internal","erp_provider_label":"Sample erp_provider_label"},"user":{"department":"Sample department","first_name":"Sample first_name","is_manager":true,"role_internal":"Sample role_internal","role_label":"Sample role_label"}},"unavailable":[]}',
            call_id: "sample_id_1",
          },
          {
            name: "sample_tool_22",
            type: "function_call",
            call_id: "sample_id_2",
            arguments: "{}",
          },
          {
            type: "function_call_output",
            output:
              '{"instructions":"Sample instructions","skills":[{"name":"Sample name","description":"Sample description"}]}',
            call_id: "sample_id_2",
          },
          {
            name: "sample_tool_19",
            type: "function_call",
            call_id: "sample_id_3",
            arguments: '{"query":"Sample query"}',
          },
          {
            type: "function_call_output",
            output: "Sample tool result",
            call_id: "sample_id_3",
          },
          {
            role: "user",
            type: "message",
            content: [
              {
                text: "Sample text",
                type: "input_text",
              },
            ],
          },
          {
            id: "sample_id_4",
            type: "reasoning",
            content: [],
            summary: [
              {
                text: "Sample text",
                type: "summary_text",
              },
            ],
            encrypted_content: "sample-encrypted-content",
          },
          {
            id: "sample_id_5",
            name: "sample_tool_17",
            type: "function_call",
            status: "Sample status",
            call_id: "sample_id_6",
            arguments:
              '{"query":"Sample query","query_variants":["Sample query_variants","Sample query_variants","Sample query_variants","Sample query_variants"],"top_k":5}',
          },
          {
            type: "function_call_output",
            output:
              '{"output_path":"Sample output_path","output_bytes":41556,"output_summary":{"format":"json","shape":{"snippets":[{"snippet":"Sample snippet","title":"Sample title","url":"Sample url","links":[{"label":"Sample label","url":"Sample url"},"Sample links"],"similarity_score":"Sample similarity_score"},"Sample snippets"],"query":"Sample query"},"summary_truncated":true},"output_head":"Sample output_head","truncated":true,"hint":"Sample hint"}',
            call_id: "sample_id_6",
          },
        ],
        tools: [
          {
            type: "function",
            name: "sample_tool_1",
            description: "Sample description",
            parameters: {
              properties: {
                sandbox_id: {
                  anyOf: [
                    {
                      format: "uuid",
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  default: null,
                  description: "Sample description",
                  title: "Sample title",
                },
                command: {
                  minLength: 1,
                  title: "Sample title",
                  type: "string",
                },
                timeout_seconds: {
                  default: 300,
                  exclusiveMinimum: 0,
                  maximum: 1800,
                  title: "Sample title",
                  type: "integer",
                },
                description: {
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  default: null,
                  description: "Sample description",
                  title: "Sample title",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
              required: ["command"],
              title: "Sample title",
              type: "object",
            },
            strict: false,
          },
          {
            type: "function",
            name: "sample_tool_2",
            description: "Sample description",
            parameters: {
              properties: {
                sandbox_id: {
                  anyOf: [
                    {
                      format: "uuid",
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  default: null,
                  description: "Sample description",
                  title: "Sample title",
                },
                filesystem_id: {
                  anyOf: [
                    {
                      format: "uuid",
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  default: null,
                  description: "Sample description",
                  title: "Sample title",
                },
                source_path: {
                  description: "Sample description",
                  minLength: 1,
                  title: "Sample title",
                  type: "string",
                },
                dest_path: {
                  description: "Sample description",
                  minLength: 1,
                  title: "Sample title",
                  type: "string",
                },
                content_type: {
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  default: null,
                  description: "Sample description",
                  title: "Sample title",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
              required: ["source_path", "dest_path"],
              title: "Sample title",
              type: "object",
            },
            strict: false,
          },
          {
            type: "function",
            name: "sample_tool_3",
            description: "Sample description",
            parameters: {
              $defs: {
                AskQuestionItem: {
                  properties: {
                    text: {
                      description: "Sample description",
                      title: "Sample title",
                      type: "string",
                    },
                    description: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      default: null,
                      description: "Sample description",
                      title: "Sample title",
                    },
                    type: {
                      default: "sample-value",
                      description: "Sample description",
                      enum: [
                        "sample-value",
                        "sample-value",
                        "sample-value",
                        "sample-value",
                        "sample-value",
                      ],
                      title: "Sample title",
                      type: "string",
                    },
                    options: {
                      anyOf: [
                        {
                          items: {
                            anyOf: [
                              {
                                type: "string",
                              },
                              {
                                $ref: "#/$defs/AskQuestionOption",
                              },
                            ],
                          },
                          type: "array",
                        },
                        {
                          type: "null",
                        },
                      ],
                      default: null,
                      description: "Sample description",
                      maxItems: 6,
                      title: "Sample title",
                    },
                    allow_freeform: {
                      default: false,
                      description: "Sample description",
                      title: "Sample title",
                      type: "boolean",
                    },
                    freeform_placeholder: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      default: null,
                      description: "Sample description",
                      title: "Sample title",
                    },
                    placeholder: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      default: null,
                      description: "Sample description",
                      title: "Sample title",
                    },
                    multiline: {
                      default: false,
                      description: "Sample description",
                      title: "Sample title",
                      type: "boolean",
                    },
                    max_length: {
                      anyOf: [
                        {
                          exclusiveMinimum: 0,
                          type: "integer",
                        },
                        {
                          type: "null",
                        },
                      ],
                      default: null,
                      description: "Sample description",
                      title: "Sample title",
                    },
                    accept: {
                      anyOf: [
                        {
                          items: {
                            type: "string",
                          },
                          minItems: 1,
                          type: "array",
                        },
                        {
                          type: "null",
                        },
                      ],
                      default: null,
                      description: "Sample description",
                      title: "Sample title",
                    },
                    multiple: {
                      default: false,
                      description: "Sample description",
                      title: "Sample title",
                      type: "boolean",
                    },
                  },
                  required: ["text"],
                  title: "Sample title",
                  type: "object",
                },
                AskQuestionOption: {
                  properties: {
                    id: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      default: null,
                      description: "Sample description",
                      title: "Sample title",
                    },
                    label: {
                      description: "Sample description",
                      title: "Sample title",
                      type: "string",
                    },
                    description: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      default: null,
                      description: "Sample description",
                      title: "Sample title",
                    },
                  },
                  required: ["label"],
                  title: "Sample title",
                  type: "object",
                },
              },
              properties: {
                questions: {
                  items: {
                    $ref: "#/$defs/AskQuestionItem",
                  },
                  minItems: 1,
                  title: "Sample title",
                  type: "array",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
              required: ["questions"],
              title: "Sample title",
              type: "object",
            },
            strict: false,
          },
          {
            type: "function",
            name: "sample_tool_4",
            description: "Sample description",
            parameters: {
              $defs: {
                PageRange: {
                  additionalProperties: false,
                  description: "Sample description",
                  properties: {
                    start: {
                      minimum: 1,
                      title: "Sample title",
                      type: "integer",
                    },
                    end: {
                      anyOf: [
                        {
                          minimum: 1,
                          type: "integer",
                        },
                        {
                          type: "null",
                        },
                      ],
                      default: null,
                      title: "Sample title",
                    },
                  },
                  required: ["start"],
                  title: "Sample title",
                  type: "object",
                },
              },
              properties: {
                question: {
                  minLength: 1,
                  title: "Sample title",
                  type: "string",
                },
                path: {
                  description: "Sample description",
                  minLength: 1,
                  title: "Sample title",
                  type: "string",
                },
                pages: {
                  anyOf: [
                    {
                      items: {
                        $ref: "#/$defs/PageRange",
                      },
                      minItems: 1,
                      type: "array",
                    },
                    {
                      type: "null",
                    },
                  ],
                  default: null,
                  description: "Sample description",
                  title: "Sample title",
                },
                output_schema: {
                  anyOf: [
                    {
                      additionalProperties: true,
                      type: "object",
                    },
                    {
                      type: "null",
                    },
                  ],
                  default: null,
                  description: "Sample description",
                  title: "Sample title",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
              required: ["question", "path"],
              title: "Sample title",
              type: "object",
            },
            strict: false,
          },
          {
            type: "function",
            name: "sample_tool_5",
            description: "Sample description",
            parameters: {
              $defs: {
                WebSearchProvider: {
                  enum: ["sample-value", "sample-value", "sample-value"],
                  type: "string",
                },
              },
              properties: {
                objective: {
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  default: null,
                  description: "Sample description",
                  title: "Sample title",
                },
                search_queries: {
                  items: {
                    maxLength: 256,
                    minLength: 1,
                    type: "string",
                  },
                  maxItems: 5,
                  minItems: 1,
                  title: "Sample title",
                  type: "array",
                },
                provider: {
                  anyOf: [
                    {
                      $ref: "#/$defs/WebSearchProvider",
                    },
                    {
                      type: "null",
                    },
                  ],
                  default: "sample-value",
                  description: "Sample description",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
              required: ["search_queries"],
              title: "Sample title",
              type: "object",
            },
            strict: false,
            annotations: {
              readOnlyHint: true,
            },
          },
          {
            type: "function",
            name: "sample_tool_6",
            description: "Sample description",
            parameters: {
              additionalProperties: false,
              properties: {
                session_id: {
                  format: "uuid",
                  title: "Sample title",
                  type: "string",
                },
                message: {
                  minLength: 1,
                  title: "Sample title",
                  type: "string",
                },
                wait_for_idle: {
                  default: false,
                  title: "Sample title",
                  type: "boolean",
                },
                timeout_seconds: {
                  anyOf: [
                    {
                      exclusiveMinimum: 0,
                      maximum: 3600,
                      type: "integer",
                    },
                    {
                      type: "null",
                    },
                  ],
                  default: null,
                  title: "Sample title",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
              required: ["session_id", "message"],
              title: "Sample title",
              type: "object",
            },
            strict: false,
          },
          {
            type: "function",
            name: "sample_tool_7",
            description: "Sample description",
            parameters: {
              additionalProperties: false,
              properties: {
                session_id: {
                  format: "uuid",
                  title: "Sample title",
                  type: "string",
                },
                before: {
                  anyOf: [
                    {
                      exclusiveMinimum: 0,
                      type: "integer",
                    },
                    {
                      type: "null",
                    },
                  ],
                  default: null,
                  title: "Sample title",
                },
                limit: {
                  default: 20,
                  exclusiveMinimum: 0,
                  maximum: 100,
                  title: "Sample title",
                  type: "integer",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
              required: ["session_id"],
              title: "Sample title",
              type: "object",
            },
            strict: false,
            annotations: {
              readOnlyHint: true,
            },
          },
          {
            type: "function",
            name: "sample_tool_8",
            description: "Sample description",
            parameters: {
              additionalProperties: false,
              properties: {
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
              title: "Sample title",
              type: "object",
            },
            strict: false,
            annotations: {
              readOnlyHint: true,
            },
          },
          {
            type: "function",
            name: "sample_tool_9",
            description: "Sample description",
            parameters: {
              properties: {
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
              title: "Sample title",
              type: "object",
            },
            strict: false,
          },
          {
            type: "function",
            name: "sample_tool_10",
            description: "Sample description",
            parameters: {
              type: "object",
              properties: {
                initial_message: {
                  type: "string",
                },
                name: {
                  type: "string",
                  description: "Sample description",
                },
                sandboxes: {
                  type: "array",
                  description: "Sample description",
                  items: {
                    type: "object",
                    properties: {
                      sandbox_id: {
                        type: "string",
                        format: "uuid",
                      },
                      access: {
                        type: "string",
                        enum: ["sample-value", "sample-value", "sample-value"],
                      },
                    },
                    required: ["sandbox_id", "access"],
                    additionalProperties: false,
                  },
                },
                auto_reply_on_idle: {
                  type: "boolean",
                  description: "Sample description",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
              required: [],
            },
            strict: false,
          },
          {
            type: "function",
            name: "sample_tool_11",
            description: "Sample description",
            parameters: {
              properties: {
                query: {
                  default: "sample-value",
                  title: "Sample title",
                  type: "string",
                  description: "Sample description",
                },
                client_id: {
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  default: null,
                  title: "Sample title",
                },
                top_k: {
                  minimum: 1,
                  title: "Sample title",
                  type: "integer",
                  default: 5,
                  description: "Sample description",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
              title: "Sample title",
              type: "object",
            },
            strict: false,
          },
          {
            type: "function",
            name: "sample_tool_12",
            description: "Sample description",
            parameters: {
              type: "object",
              properties: {
                client_id: {
                  type: "string",
                  description: "Sample description",
                },
                tool_name: {
                  type: "string",
                  description: "Sample description",
                },
                arguments: {
                  type: "object",
                  description: "Sample description",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
              required: ["client_id", "tool_name", "arguments"],
              additionalProperties: false,
            },
            strict: false,
          },
          {
            type: "function",
            name: "sample_tool_13",
            description: "Sample description",
            parameters: {
              properties: {
                call_ids: {
                  description: "Sample description",
                  items: {
                    type: "string",
                  },
                  minItems: 1,
                  title: "Sample title",
                  type: "array",
                },
                reason: {
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  default: null,
                  description: "Sample description",
                  title: "Sample title",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
              required: ["call_ids"],
              title: "Sample title",
              type: "object",
            },
            strict: false,
          },
          {
            type: "function",
            name: "sample_tool_14",
            description: "Sample description",
            parameters: {
              properties: {
                call_ids: {
                  description: "Sample description",
                  items: {
                    type: "string",
                  },
                  minItems: 1,
                  title: "Sample title",
                  type: "array",
                },
                reason: {
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  default: null,
                  description: "Sample description",
                  title: "Sample title",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
              required: ["call_ids"],
              title: "Sample title",
              type: "object",
            },
            strict: false,
          },
          {
            type: "function",
            name: "sample_tool_15",
            description: "Sample description",
            parameters: {
              type: "object",
              title: "sample_tool_15",
              required: ["description"],
              properties: {
                top_k: {
                  type: "integer",
                  title: "Sample title",
                  default: 5,
                  description: "Sample description",
                },
                entity_id: {
                  anyOf: [
                    {
                      type: "string",
                      format: "uuid",
                    },
                    {
                      type: "null",
                    },
                  ],
                  title: "Sample title",
                  default: null,
                  description: "Sample description",
                },
                description: {
                  type: "string",
                  title: "Sample title",
                  pattern: "\\S",
                  description: "Sample description",
                },
                entity_type: {
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  title: "Sample title",
                  default: null,
                  description: "Sample description",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
              dependentRequired: {
                entity_id: ["Sample entity_id"],
                entity_type: ["Sample entity_type"],
              },
            },
            strict: false,
            annotations: {
              title: "sample_tool_15",
              readOnlyHint: true,
              idempotentHint: true,
              destructiveHint: false,
            },
          },
          {
            type: "function",
            name: "sample_tool_16",
            description: "Sample description",
            parameters: {
              type: "object",
              title: "sample_tool_16",
              required: ["name"],
              properties: {
                name: {
                  type: "string",
                  title: "Sample title",
                  description: "Sample description",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
            },
            strict: false,
            annotations: {
              title: "sample_tool_16",
              readOnlyHint: true,
              idempotentHint: true,
              destructiveHint: false,
            },
          },
          {
            type: "function",
            name: "sample_tool_17",
            description: "Sample description",
            parameters: {
              type: "object",
              $defs: {
                HelpCenterQuery: {
                  type: "string",
                  pattern: "\\S",
                },
                HelpCenterQueryVariantList: {
                  type: "array",
                  items: {
                    $ref: "#/$defs/HelpCenterQuery",
                  },
                  maxItems: 4,
                  minItems: 1,
                },
              },
              title: "sample_tool_17",
              required: ["query"],
              properties: {
                query: {
                  type: "string",
                  title: "Sample title",
                  description: "Sample description",
                },
                top_k: {
                  type: "integer",
                  title: "Sample title",
                  default: 5,
                  description: "Sample description",
                },
                query_variants: {
                  anyOf: [
                    {
                      $ref: "#/$defs/HelpCenterQuery",
                    },
                    {
                      $ref: "#/$defs/HelpCenterQueryVariantList",
                    },
                    {
                      type: "null",
                    },
                  ],
                  title: "Sample title",
                  default: null,
                  description: "Sample description",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
            },
            strict: false,
            annotations: {
              title: "sample_tool_17",
              readOnlyHint: true,
              openWorldHint: true,
              idempotentHint: false,
              destructiveHint: false,
            },
          },
          {
            type: "function",
            name: "sample_tool_18",
            description: "Sample description",
            parameters: {
              type: "object",
              $defs: {
                ProductFeedbackArea: {
                  enum: [
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                  ],
                  type: "string",
                  title: "Sample title",
                  description: "Sample description",
                },
                ProductFeedbackType: {
                  enum: [
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                  ],
                  type: "string",
                  title: "Sample title",
                },
                ProductFeedbackImpact: {
                  enum: [
                    "sample-value",
                    "sample-value",
                    "sample-value",
                    "sample-value",
                  ],
                  type: "string",
                  title: "Sample title",
                },
              },
              title: "sample_tool_18",
              required: ["summary", "feedback_type", "product_area"],
              properties: {
                impact: {
                  anyOf: [
                    {
                      $ref: "#/$defs/ProductFeedbackImpact",
                    },
                    {
                      type: "null",
                    },
                  ],
                  default: null,
                  description: "Sample description",
                },
                summary: {
                  type: "string",
                  title: "Sample title",
                  maxLength: 500,
                  minLength: 1,
                  description: "Sample description",
                },
                product_area: {
                  $ref: "#/$defs/ProductFeedbackArea",
                  description: "Sample description",
                },
                feedback_type: {
                  $ref: "#/$defs/ProductFeedbackType",
                  description: "Sample description",
                },
                desired_outcome: {
                  anyOf: [
                    {
                      type: "string",
                      maxLength: 1000,
                      minLength: 1,
                    },
                    {
                      type: "null",
                    },
                  ],
                  title: "Sample title",
                  default: null,
                  description: "Sample description",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
            },
            strict: false,
            annotations: {
              title: "sample_tool_18",
              readOnlyHint: false,
              idempotentHint: false,
              destructiveHint: true,
            },
          },
          {
            type: "function",
            name: "sample_tool_19",
            description: "Sample description",
            parameters: {
              properties: {
                query: {
                  minLength: 1,
                  title: "Sample title",
                  type: "string",
                  description: "Sample description",
                },
                top_k: {
                  minimum: 1,
                  title: "Sample title",
                  type: "integer",
                  default: 5,
                  description: "Sample description",
                },
                refresh: {
                  default: false,
                  description: "Sample description",
                  title: "Sample title",
                  type: "boolean",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
              required: ["query"],
              title: "Sample title",
              type: "object",
            },
            strict: false,
          },
          {
            type: "function",
            name: "sample_tool_20",
            description: "Sample description",
            parameters: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Sample description",
                },
                input: {
                  type: "object",
                  description: "Sample description",
                },
                l_input_from_bash: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_path: {
                  type: "string",
                  description: "Sample description",
                },
                l_output_to_file: {
                  type: "boolean",
                  description: "Sample description",
                },
              },
              required: ["name"],
              additionalProperties: false,
            },
            strict: false,
          },
        ],
      },
      output: [
        {
          id: "sample_id_7",
          summary: [
            {
              text: "Sample text",
              type: "summary_text",
            },
          ],
          type: "reasoning",
          content: [],
          encrypted_content: "sample-encrypted-content",
          status: null,
        },
        {
          id: "sample_id_8",
          content: [
            {
              annotations: [],
              text: "Sample text",
              type: "output_text",
              logprobs: [],
            },
          ],
          role: "assistant",
          status: "Sample status",
          type: "message",
          phase: null,
        },
      ],
      metadata: undefined,
    },
    expected: {
      messages: [
        {
          source: "input",
          role: "system",
          parts: [
            {
              type: "text",
              text: "Sample text",
            },
          ],
        },
        {
          source: "input",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              toolCallId: "sample_id_1",
              toolName: "sample_tool_21",
              input: {},
              toolType: "function_call",
            },
          ],
        },
        {
          source: "input",
          role: "tool",
          parts: [
            {
              type: "tool-result",
              toolCallId: "sample_id_1",
              output: {
                parts: {
                  org: {
                    country: "Sample country",
                    is_multi_entity: true,
                    name: "Sample name",
                    plan_label: "Sample plan_label",
                    plan_tier_internal: "Sample plan_tier_internal",
                    size_bucket: "Sample size_bucket",
                  },
                  products: {
                    enabled_entitlements_at_session_start_internal: [
                      "Sample enabled_entitlements_at_session_start_internal",
                      "Sample enabled_entitlements_at_session_start_internal",
                      "Sample enabled_entitlements_at_session_start_internal",
                      "Sample enabled_entitlements_at_session_start_internal",
                      "Sample enabled_entitlements_at_session_start_internal",
                      "Sample enabled_entitlements_at_session_start_internal",
                      "Sample enabled_entitlements_at_session_start_internal",
                      "Sample enabled_entitlements_at_session_start_internal",
                      "Sample enabled_entitlements_at_session_start_internal",
                    ],
                  },
                  session: {
                    session_started_at: "Sample session_started_at",
                  },
                  setup: {
                    erp_provider_internal: "Sample erp_provider_internal",
                    erp_provider_label: "Sample erp_provider_label",
                  },
                  user: {
                    department: "Sample department",
                    first_name: "Sample first_name",
                    is_manager: true,
                    role_internal: "Sample role_internal",
                    role_label: "Sample role_label",
                  },
                },
                unavailable: [],
              },
            },
          ],
        },
        {
          source: "input",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              toolCallId: "sample_id_2",
              toolName: "sample_tool_22",
              input: {},
              toolType: "function_call",
            },
          ],
        },
        {
          source: "input",
          role: "tool",
          parts: [
            {
              type: "tool-result",
              toolCallId: "sample_id_2",
              output: {
                instructions: "Sample instructions",
                skills: [
                  {
                    name: "Sample name",
                    description: "Sample description",
                  },
                ],
              },
            },
          ],
        },
        {
          source: "input",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              toolCallId: "sample_id_3",
              toolName: "sample_tool_19",
              input: {
                query: "Sample query",
              },
              toolType: "function_call",
            },
          ],
        },
        {
          source: "input",
          role: "tool",
          parts: [
            {
              type: "tool-result",
              toolCallId: "sample_id_3",
              output: "Sample tool result",
            },
          ],
        },
        {
          source: "input",
          role: "user",
          parts: [
            {
              type: "text",
              text: "Sample text",
            },
          ],
        },
        {
          source: "input",
          role: "assistant",
          parts: [
            {
              type: "reasoning",
              content: {
                kind: "text",
                text: "Sample text",
              },
            },
            {
              type: "reasoning",
              content: {
                kind: "encrypted",
                data: "sample-encrypted-content",
              },
            },
          ],
          id: "sample_id_4",
        },
        {
          source: "input",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              toolCallId: "sample_id_6",
              toolName: "sample_tool_17",
              input: {
                query: "Sample query",
                query_variants: [
                  "Sample query_variants",
                  "Sample query_variants",
                  "Sample query_variants",
                  "Sample query_variants",
                ],
                top_k: 5,
              },
              toolType: "function_call",
              providerMetadata: {
                status: "Sample status",
              },
            },
          ],
        },
        {
          source: "input",
          role: "tool",
          parts: [
            {
              type: "tool-result",
              toolCallId: "sample_id_6",
              output: {
                output_path: "Sample output_path",
                output_bytes: 41556,
                output_summary: {
                  format: "json",
                  shape: {
                    snippets: [
                      {
                        snippet: "Sample snippet",
                        title: "Sample title",
                        url: "Sample url",
                        links: [
                          {
                            label: "Sample label",
                            url: "Sample url",
                          },
                          "Sample links",
                        ],
                        similarity_score: "Sample similarity_score",
                      },
                      "Sample snippets",
                    ],
                    query: "Sample query",
                  },
                  summary_truncated: true,
                },
                output_head: "Sample output_head",
                truncated: true,
                hint: "Sample hint",
              },
            },
          ],
        },
        {
          source: "output",
          id: "sample_id_7",
          role: "assistant",
          parts: [
            {
              type: "reasoning",
              content: {
                kind: "text",
                text: "Sample text",
              },
            },
            {
              type: "reasoning",
              content: {
                kind: "encrypted",
                data: "sample-encrypted-content",
              },
            },
          ],
        },
        {
          source: "output",
          role: "assistant",
          id: "sample_id_8",
          parts: [
            {
              type: "text",
              text: "Sample text",
              providerMetadata: {
                logprobs: [],
              },
            },
          ],
        },
      ],
      toolDefinitions: [
        {
          type: "function",
          name: "sample_tool_1",
          description: "Sample description",
          inputSchema: {
            properties: {
              sandbox_id: {
                anyOf: [
                  {
                    format: "uuid",
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                default: null,
                description: "Sample description",
                title: "Sample title",
              },
              command: {
                minLength: 1,
                title: "Sample title",
                type: "string",
              },
              timeout_seconds: {
                default: 300,
                exclusiveMinimum: 0,
                maximum: 1800,
                title: "Sample title",
                type: "integer",
              },
              description: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                default: null,
                description: "Sample description",
                title: "Sample title",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
            required: ["command"],
            title: "Sample title",
            type: "object",
          },
          providerMetadata: {
            strict: false,
          },
        },
        {
          type: "function",
          name: "sample_tool_2",
          description: "Sample description",
          inputSchema: {
            properties: {
              sandbox_id: {
                anyOf: [
                  {
                    format: "uuid",
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                default: null,
                description: "Sample description",
                title: "Sample title",
              },
              filesystem_id: {
                anyOf: [
                  {
                    format: "uuid",
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                default: null,
                description: "Sample description",
                title: "Sample title",
              },
              source_path: {
                description: "Sample description",
                minLength: 1,
                title: "Sample title",
                type: "string",
              },
              dest_path: {
                description: "Sample description",
                minLength: 1,
                title: "Sample title",
                type: "string",
              },
              content_type: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                default: null,
                description: "Sample description",
                title: "Sample title",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
            required: ["source_path", "dest_path"],
            title: "Sample title",
            type: "object",
          },
          providerMetadata: {
            strict: false,
          },
        },
        {
          type: "function",
          name: "sample_tool_3",
          description: "Sample description",
          inputSchema: {
            $defs: {
              AskQuestionItem: {
                properties: {
                  text: {
                    description: "Sample description",
                    title: "Sample title",
                    type: "string",
                  },
                  description: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    default: null,
                    description: "Sample description",
                    title: "Sample title",
                  },
                  type: {
                    default: "sample-value",
                    description: "Sample description",
                    enum: [
                      "sample-value",
                      "sample-value",
                      "sample-value",
                      "sample-value",
                      "sample-value",
                    ],
                    title: "Sample title",
                    type: "string",
                  },
                  options: {
                    anyOf: [
                      {
                        items: {
                          anyOf: [
                            {
                              type: "string",
                            },
                            {
                              $ref: "#/$defs/AskQuestionOption",
                            },
                          ],
                        },
                        type: "array",
                      },
                      {
                        type: "null",
                      },
                    ],
                    default: null,
                    description: "Sample description",
                    maxItems: 6,
                    title: "Sample title",
                  },
                  allow_freeform: {
                    default: false,
                    description: "Sample description",
                    title: "Sample title",
                    type: "boolean",
                  },
                  freeform_placeholder: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    default: null,
                    description: "Sample description",
                    title: "Sample title",
                  },
                  placeholder: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    default: null,
                    description: "Sample description",
                    title: "Sample title",
                  },
                  multiline: {
                    default: false,
                    description: "Sample description",
                    title: "Sample title",
                    type: "boolean",
                  },
                  max_length: {
                    anyOf: [
                      {
                        exclusiveMinimum: 0,
                        type: "integer",
                      },
                      {
                        type: "null",
                      },
                    ],
                    default: null,
                    description: "Sample description",
                    title: "Sample title",
                  },
                  accept: {
                    anyOf: [
                      {
                        items: {
                          type: "string",
                        },
                        minItems: 1,
                        type: "array",
                      },
                      {
                        type: "null",
                      },
                    ],
                    default: null,
                    description: "Sample description",
                    title: "Sample title",
                  },
                  multiple: {
                    default: false,
                    description: "Sample description",
                    title: "Sample title",
                    type: "boolean",
                  },
                },
                required: ["text"],
                title: "Sample title",
                type: "object",
              },
              AskQuestionOption: {
                properties: {
                  id: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    default: null,
                    description: "Sample description",
                    title: "Sample title",
                  },
                  label: {
                    description: "Sample description",
                    title: "Sample title",
                    type: "string",
                  },
                  description: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    default: null,
                    description: "Sample description",
                    title: "Sample title",
                  },
                },
                required: ["label"],
                title: "Sample title",
                type: "object",
              },
            },
            properties: {
              questions: {
                items: {
                  $ref: "#/$defs/AskQuestionItem",
                },
                minItems: 1,
                title: "Sample title",
                type: "array",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
            required: ["questions"],
            title: "Sample title",
            type: "object",
          },
          providerMetadata: {
            strict: false,
          },
        },
        {
          type: "function",
          name: "sample_tool_4",
          description: "Sample description",
          inputSchema: {
            $defs: {
              PageRange: {
                additionalProperties: false,
                description: "Sample description",
                properties: {
                  start: {
                    minimum: 1,
                    title: "Sample title",
                    type: "integer",
                  },
                  end: {
                    anyOf: [
                      {
                        minimum: 1,
                        type: "integer",
                      },
                      {
                        type: "null",
                      },
                    ],
                    default: null,
                    title: "Sample title",
                  },
                },
                required: ["start"],
                title: "Sample title",
                type: "object",
              },
            },
            properties: {
              question: {
                minLength: 1,
                title: "Sample title",
                type: "string",
              },
              path: {
                description: "Sample description",
                minLength: 1,
                title: "Sample title",
                type: "string",
              },
              pages: {
                anyOf: [
                  {
                    items: {
                      $ref: "#/$defs/PageRange",
                    },
                    minItems: 1,
                    type: "array",
                  },
                  {
                    type: "null",
                  },
                ],
                default: null,
                description: "Sample description",
                title: "Sample title",
              },
              output_schema: {
                anyOf: [
                  {
                    additionalProperties: true,
                    type: "object",
                  },
                  {
                    type: "null",
                  },
                ],
                default: null,
                description: "Sample description",
                title: "Sample title",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
            required: ["question", "path"],
            title: "Sample title",
            type: "object",
          },
          providerMetadata: {
            strict: false,
          },
        },
        {
          type: "function",
          name: "sample_tool_5",
          description: "Sample description",
          inputSchema: {
            $defs: {
              WebSearchProvider: {
                enum: ["sample-value", "sample-value", "sample-value"],
                type: "string",
              },
            },
            properties: {
              objective: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                default: null,
                description: "Sample description",
                title: "Sample title",
              },
              search_queries: {
                items: {
                  maxLength: 256,
                  minLength: 1,
                  type: "string",
                },
                maxItems: 5,
                minItems: 1,
                title: "Sample title",
                type: "array",
              },
              provider: {
                anyOf: [
                  {
                    $ref: "#/$defs/WebSearchProvider",
                  },
                  {
                    type: "null",
                  },
                ],
                default: "sample-value",
                description: "Sample description",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
            required: ["search_queries"],
            title: "Sample title",
            type: "object",
          },
          providerMetadata: {
            strict: false,
            annotations: {
              readOnlyHint: true,
            },
          },
        },
        {
          type: "function",
          name: "sample_tool_6",
          description: "Sample description",
          inputSchema: {
            additionalProperties: false,
            properties: {
              session_id: {
                format: "uuid",
                title: "Sample title",
                type: "string",
              },
              message: {
                minLength: 1,
                title: "Sample title",
                type: "string",
              },
              wait_for_idle: {
                default: false,
                title: "Sample title",
                type: "boolean",
              },
              timeout_seconds: {
                anyOf: [
                  {
                    exclusiveMinimum: 0,
                    maximum: 3600,
                    type: "integer",
                  },
                  {
                    type: "null",
                  },
                ],
                default: null,
                title: "Sample title",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
            required: ["session_id", "message"],
            title: "Sample title",
            type: "object",
          },
          providerMetadata: {
            strict: false,
          },
        },
        {
          type: "function",
          name: "sample_tool_7",
          description: "Sample description",
          inputSchema: {
            additionalProperties: false,
            properties: {
              session_id: {
                format: "uuid",
                title: "Sample title",
                type: "string",
              },
              before: {
                anyOf: [
                  {
                    exclusiveMinimum: 0,
                    type: "integer",
                  },
                  {
                    type: "null",
                  },
                ],
                default: null,
                title: "Sample title",
              },
              limit: {
                default: 20,
                exclusiveMinimum: 0,
                maximum: 100,
                title: "Sample title",
                type: "integer",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
            required: ["session_id"],
            title: "Sample title",
            type: "object",
          },
          providerMetadata: {
            strict: false,
            annotations: {
              readOnlyHint: true,
            },
          },
        },
        {
          type: "function",
          name: "sample_tool_8",
          description: "Sample description",
          inputSchema: {
            additionalProperties: false,
            properties: {
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
            title: "Sample title",
            type: "object",
          },
          providerMetadata: {
            strict: false,
            annotations: {
              readOnlyHint: true,
            },
          },
        },
        {
          type: "function",
          name: "sample_tool_9",
          description: "Sample description",
          inputSchema: {
            properties: {
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
            title: "Sample title",
            type: "object",
          },
          providerMetadata: {
            strict: false,
          },
        },
        {
          type: "function",
          name: "sample_tool_10",
          description: "Sample description",
          inputSchema: {
            type: "object",
            properties: {
              initial_message: {
                type: "string",
              },
              name: {
                type: "string",
                description: "Sample description",
              },
              sandboxes: {
                type: "array",
                description: "Sample description",
                items: {
                  type: "object",
                  properties: {
                    sandbox_id: {
                      type: "string",
                      format: "uuid",
                    },
                    access: {
                      type: "string",
                      enum: ["sample-value", "sample-value", "sample-value"],
                    },
                  },
                  required: ["sandbox_id", "access"],
                  additionalProperties: false,
                },
              },
              auto_reply_on_idle: {
                type: "boolean",
                description: "Sample description",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
            required: [],
          },
          providerMetadata: {
            strict: false,
          },
        },
        {
          type: "function",
          name: "sample_tool_11",
          description: "Sample description",
          inputSchema: {
            properties: {
              query: {
                default: "sample-value",
                title: "Sample title",
                type: "string",
                description: "Sample description",
              },
              client_id: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                default: null,
                title: "Sample title",
              },
              top_k: {
                minimum: 1,
                title: "Sample title",
                type: "integer",
                default: 5,
                description: "Sample description",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
            title: "Sample title",
            type: "object",
          },
          providerMetadata: {
            strict: false,
          },
        },
        {
          type: "function",
          name: "sample_tool_12",
          description: "Sample description",
          inputSchema: {
            type: "object",
            properties: {
              client_id: {
                type: "string",
                description: "Sample description",
              },
              tool_name: {
                type: "string",
                description: "Sample description",
              },
              arguments: {
                type: "object",
                description: "Sample description",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
            required: ["client_id", "tool_name", "arguments"],
            additionalProperties: false,
          },
          providerMetadata: {
            strict: false,
          },
        },
        {
          type: "function",
          name: "sample_tool_13",
          description: "Sample description",
          inputSchema: {
            properties: {
              call_ids: {
                description: "Sample description",
                items: {
                  type: "string",
                },
                minItems: 1,
                title: "Sample title",
                type: "array",
              },
              reason: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                default: null,
                description: "Sample description",
                title: "Sample title",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
            required: ["call_ids"],
            title: "Sample title",
            type: "object",
          },
          providerMetadata: {
            strict: false,
          },
        },
        {
          type: "function",
          name: "sample_tool_14",
          description: "Sample description",
          inputSchema: {
            properties: {
              call_ids: {
                description: "Sample description",
                items: {
                  type: "string",
                },
                minItems: 1,
                title: "Sample title",
                type: "array",
              },
              reason: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                default: null,
                description: "Sample description",
                title: "Sample title",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
            required: ["call_ids"],
            title: "Sample title",
            type: "object",
          },
          providerMetadata: {
            strict: false,
          },
        },
        {
          type: "function",
          name: "sample_tool_15",
          description: "Sample description",
          inputSchema: {
            type: "object",
            title: "sample_tool_15",
            required: ["description"],
            properties: {
              top_k: {
                type: "integer",
                title: "Sample title",
                default: 5,
                description: "Sample description",
              },
              entity_id: {
                anyOf: [
                  {
                    type: "string",
                    format: "uuid",
                  },
                  {
                    type: "null",
                  },
                ],
                title: "Sample title",
                default: null,
                description: "Sample description",
              },
              description: {
                type: "string",
                title: "Sample title",
                pattern: "\\S",
                description: "Sample description",
              },
              entity_type: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                title: "Sample title",
                default: null,
                description: "Sample description",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
            dependentRequired: {
              entity_id: ["Sample entity_id"],
              entity_type: ["Sample entity_type"],
            },
          },
          providerMetadata: {
            strict: false,
            annotations: {
              title: "sample_tool_15",
              readOnlyHint: true,
              idempotentHint: true,
              destructiveHint: false,
            },
          },
        },
        {
          type: "function",
          name: "sample_tool_16",
          description: "Sample description",
          inputSchema: {
            type: "object",
            title: "sample_tool_16",
            required: ["name"],
            properties: {
              name: {
                type: "string",
                title: "Sample title",
                description: "Sample description",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
          },
          providerMetadata: {
            strict: false,
            annotations: {
              title: "sample_tool_16",
              readOnlyHint: true,
              idempotentHint: true,
              destructiveHint: false,
            },
          },
        },
        {
          type: "function",
          name: "sample_tool_17",
          description: "Sample description",
          inputSchema: {
            type: "object",
            $defs: {
              HelpCenterQuery: {
                type: "string",
                pattern: "\\S",
              },
              HelpCenterQueryVariantList: {
                type: "array",
                items: {
                  $ref: "#/$defs/HelpCenterQuery",
                },
                maxItems: 4,
                minItems: 1,
              },
            },
            title: "sample_tool_17",
            required: ["query"],
            properties: {
              query: {
                type: "string",
                title: "Sample title",
                description: "Sample description",
              },
              top_k: {
                type: "integer",
                title: "Sample title",
                default: 5,
                description: "Sample description",
              },
              query_variants: {
                anyOf: [
                  {
                    $ref: "#/$defs/HelpCenterQuery",
                  },
                  {
                    $ref: "#/$defs/HelpCenterQueryVariantList",
                  },
                  {
                    type: "null",
                  },
                ],
                title: "Sample title",
                default: null,
                description: "Sample description",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
          },
          providerMetadata: {
            strict: false,
            annotations: {
              title: "sample_tool_17",
              readOnlyHint: true,
              openWorldHint: true,
              idempotentHint: false,
              destructiveHint: false,
            },
          },
        },
        {
          type: "function",
          name: "sample_tool_18",
          description: "Sample description",
          inputSchema: {
            type: "object",
            $defs: {
              ProductFeedbackArea: {
                enum: [
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                ],
                type: "string",
                title: "Sample title",
                description: "Sample description",
              },
              ProductFeedbackType: {
                enum: [
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                ],
                type: "string",
                title: "Sample title",
              },
              ProductFeedbackImpact: {
                enum: [
                  "sample-value",
                  "sample-value",
                  "sample-value",
                  "sample-value",
                ],
                type: "string",
                title: "Sample title",
              },
            },
            title: "sample_tool_18",
            required: ["summary", "feedback_type", "product_area"],
            properties: {
              impact: {
                anyOf: [
                  {
                    $ref: "#/$defs/ProductFeedbackImpact",
                  },
                  {
                    type: "null",
                  },
                ],
                default: null,
                description: "Sample description",
              },
              summary: {
                type: "string",
                title: "Sample title",
                maxLength: 500,
                minLength: 1,
                description: "Sample description",
              },
              product_area: {
                $ref: "#/$defs/ProductFeedbackArea",
                description: "Sample description",
              },
              feedback_type: {
                $ref: "#/$defs/ProductFeedbackType",
                description: "Sample description",
              },
              desired_outcome: {
                anyOf: [
                  {
                    type: "string",
                    maxLength: 1000,
                    minLength: 1,
                  },
                  {
                    type: "null",
                  },
                ],
                title: "Sample title",
                default: null,
                description: "Sample description",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
          },
          providerMetadata: {
            strict: false,
            annotations: {
              title: "sample_tool_18",
              readOnlyHint: false,
              idempotentHint: false,
              destructiveHint: true,
            },
          },
        },
        {
          type: "function",
          name: "sample_tool_19",
          description: "Sample description",
          inputSchema: {
            properties: {
              query: {
                minLength: 1,
                title: "Sample title",
                type: "string",
                description: "Sample description",
              },
              top_k: {
                minimum: 1,
                title: "Sample title",
                type: "integer",
                default: 5,
                description: "Sample description",
              },
              refresh: {
                default: false,
                description: "Sample description",
                title: "Sample title",
                type: "boolean",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
            required: ["query"],
            title: "Sample title",
            type: "object",
          },
          providerMetadata: {
            strict: false,
          },
        },
        {
          type: "function",
          name: "sample_tool_20",
          description: "Sample description",
          inputSchema: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Sample description",
              },
              input: {
                type: "object",
                description: "Sample description",
              },
              l_input_from_bash: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_path: {
                type: "string",
                description: "Sample description",
              },
              l_output_to_file: {
                type: "boolean",
                description: "Sample description",
              },
            },
            required: ["name"],
            additionalProperties: false,
          },
          providerMetadata: {
            strict: false,
          },
        },
      ],
    },
  },
];

const toolCallId = "call_weather_001";
const customToolCallId = "call_custom_002";

/** Synthetic OpenAI chat-completion case adapted from the playground suite. */
export const openAiChatCompletionToolSequenceFixture = {
  name: "normalizes an OpenAI chat-completion tool sequence",
  spanIO: {
    input: {
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get the weather for a city",
            parameters: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"],
            },
          },
        },
        {
          type: "custom",
          custom: {
            name: "run_python",
            description: "Runs a python snippet",
            format: { type: "text" },
          },
        },
      ],
      messages: [
        // `name` differentiates same-role participants — carried as the
        // message's senderName (unlike the function-role `name` below,
        // which is a tool name).
        {
          role: "user",
          name: "alice",
          content: "What is the weather in Zurich?",
        },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: toolCallId,
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"city":"Zurich"}',
              },
            },
            {
              id: customToolCallId,
              type: "custom",
              custom: { name: "run_python", input: "print(21 * 2)" },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: toolCallId,
          content: '{"condition":"sunny","temperature":24}',
        },
        // Deprecated legacy function-calling protocol: the result message
        // carries the function name instead of a tool_call_id.
        { role: "function", name: "run_python", content: "42" },
      ],
    },
    output: {
      role: "assistant",
      content: "It is sunny and 24 degrees in Zurich.",
    },
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "user",
        senderName: "alice",
        parts: [{ type: "text", text: "What is the weather in Zurich?" }],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId,
            toolName: "get_weather",
            input: { city: "Zurich" },
            toolType: "function",
          },
          {
            type: "tool-call",
            toolCallId: customToolCallId,
            toolName: "run_python",
            input: "print(21 * 2)",
            toolType: "custom",
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId,
            output: { condition: "sunny", temperature: 24 },
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
            toolName: "run_python",
            output: 42,
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          { type: "text", text: "It is sunny and 24 degrees in Zurich." },
        ],
        source: "output",
      },
    ],
    toolDefinitions: [
      {
        name: "get_weather",
        description: "Get the weather for a city",
        inputSchema: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
        type: "function",
      },
      {
        name: "run_python",
        description: "Runs a python snippet",
        inputSchema: { type: "text" },
        type: "custom",
      },
    ],
  },
} satisfies NormalizedIOFixture;

const callId1 = "call_r1";
const callId2 = "call_r2";

const toolInput1 = { query: "refund policy annual plans" };
const toolInput2 = { query: "annual plan terms 30 day window" };

// Prior turn, replayed as input history: a reasoning item and two parallel
// function calls followed by their outputs. Responses API items carry no
// explicit role — function_call/function_call_output are recognized by
// shape, and standalone reasoning items are model output (assistant) even
// on the input side.
const inputItems = [
  {
    role: "user",
    content:
      "What's our refund policy for annual plans purchased more than 30 days ago?",
  },
  {
    type: "reasoning",
    id: "rs_001",
    summary: [
      {
        type: "summary_text",
        text: "I should check both the refund policy doc and the annual-plan terms doc, since the answer may differ for annual vs monthly plans.",
      },
    ],
  },
  {
    type: "function_call",
    id: "fc_001",
    call_id: callId1,
    name: "search_docs",
    arguments: JSON.stringify(toolInput1),
    status: "completed",
  },
  {
    type: "function_call",
    id: "fc_002",
    call_id: callId2,
    name: "search_docs",
    arguments: JSON.stringify(toolInput2),
    status: "completed",
  },
  {
    type: "function_call_output",
    call_id: callId1,
    output: "[Reduced refund policy doc excerpt]",
  },
  {
    type: "function_call_output",
    call_id: callId2,
    output: "[Reduced annual plan terms excerpt]",
  },
];

// New turn: reasoning followed by a direct answer — the prior parallel
// lookups already covered what was needed, so no new tool call this turn.
const outputItems = [
  {
    type: "reasoning",
    id: "rs_002",
    status: "completed",
    summary: [
      {
        type: "summary_text",
        text: "Both documents indicate refunds aren't available after 30 days for annual plans, so no further lookup is needed.",
      },
    ],
  },
  {
    type: "message",
    id: "msg_001",
    role: "assistant",
    status: "completed",
    content: [
      {
        type: "output_text",
        text: "Refunds for annual plans are only available within the first 30 days of purchase, so a refund isn't possible after that window.",
      },
    ],
  },
];

/**
 * Hand-built from OpenAI's documented Responses API item shapes (not a real
 * capture — the real prod example in this batch was wrapped in LangChain's
 * serialization envelope, which tests LangChain's format rather than the
 * raw Responses API one). Mirrors the same reasoning + parallel-tool-call
 * complexity as anthropicMessagesRichContent for the OpenAI side.
 */
export const openAiResponsesReasoningWithParallelCallsFixture = {
  name: "normalizes OpenAI Responses reasoning with parallel function calls",
  spanIO: {
    input: JSON.stringify(inputItems),
    output: JSON.stringify(outputItems),
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "user",
        parts: [
          {
            type: "text",
            text: "What's our refund policy for annual plans purchased more than 30 days ago?",
          },
        ],
        source: "input",
      },
      {
        id: "rs_001",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            content: {
              kind: "text",
              text: "I should check both the refund policy doc and the annual-plan terms doc, since the answer may differ for annual vs monthly plans.",
            },
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: callId1,
            toolName: "search_docs",
            input: toolInput1,
            toolType: "function_call",
            providerMetadata: { status: "completed" },
          },
          {
            type: "tool-call",
            toolCallId: callId2,
            toolName: "search_docs",
            input: toolInput2,
            toolType: "function_call",
            providerMetadata: { status: "completed" },
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: callId1,
            output: "[Reduced refund policy doc excerpt]",
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: callId2,
            output: "[Reduced annual plan terms excerpt]",
          },
        ],
        source: "input",
      },
      {
        id: "rs_002",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            content: {
              kind: "text",
              text: "Both documents indicate refunds aren't available after 30 days for annual plans, so no further lookup is needed.",
            },
          },
        ],
        source: "output",
      },
      {
        id: "msg_001",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Refunds for annual plans are only available within the first 30 days of purchase, so a refund isn't possible after that window.",
          },
        ],
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

const responsesToolCallId = "call_weather_002";

/** Synthetic OpenAI Responses case adapted from the playground suite. */
export const openAiResponsesFunctionCallFixture = {
  name: "normalizes OpenAI Responses function calls and outputs",
  spanIO: {
    input: [
      { role: "user", content: "What is the weather in Basel?" },
      {
        type: "function_call",
        id: "fc_weather_002",
        call_id: responsesToolCallId,
        name: "get_weather",
        arguments: { city: "Basel" },
        status: "completed",
      },
      {
        type: "function_call_output",
        call_id: responsesToolCallId,
        output: "The weather in Basel is cloudy.",
      },
    ],
    output: undefined,
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "user",
        parts: [{ type: "text", text: "What is the weather in Basel?" }],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: responsesToolCallId,
            toolName: "get_weather",
            input: { city: "Basel" },
            toolType: "function_call",
            providerMetadata: { status: "completed" },
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: responsesToolCallId,
            output: "The weather in Basel is cloudy.",
          },
        ],
        source: "input",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

/**
 * Synthetic OpenAI chat-completion case for the non-text surfaces: multimodal
 * content parts (image_url / input_audio / file in all three source shapes —
 * https URL, base64 data-URI, and Langfuse media reference token), refusal
 * parts, response-message url_citation annotations, and audio output.
 *
 * Media handling contract exercised here:
 * - `@@@langfuseMedia:type=X|id=Y|source=Z@@@` tokens (the dominant shape in
 *   stored production IO) become `file` parts with `kind: "reference"`,
 *   mediaType from the token, and the token's `source` in providerMetadata.
 * - Unknown media subtypes fall back to modality wildcards (`image/*`,
 *   `audio/*`) when the part kind reveals the modality, and omit mediaType
 *   entirely when it does not (opaque file ids).
 * - Refusals stay findable: they normalize to text parts flagged with
 *   `refusal: true` (typed field) so evals can filter refusal observations.
 */
export const openAiChatMultimodalRichResponseFixture = {
  name: "normalizes OpenAI chat-completion multimodal content and rich response fields",
  spanIO: {
    input: {
      messages: [
        // `developer` is OpenAI's replacement name for `system` — aliases to
        // the canonical system role.
        { role: "developer", content: "You are a helpful assistant." },
        {
          role: "user",
          content: [
            { type: "text", text: "What is in these files?" },
            {
              type: "image_url",
              image_url: { url: "https://example.com/cat.png", detail: "low" },
            },
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,aGVsbG8=" },
            },
            {
              type: "image_url",
              image_url: {
                url: "@@@langfuseMedia:type=image/jpeg|id=media-ref-image-1|source=base64@@@",
              },
            },
            {
              type: "input_audio",
              input_audio: { data: "UklGRg==", format: "wav" },
            },
            {
              type: "input_audio",
              input_audio: {
                data: "@@@langfuseMedia:type=audio/mpeg|id=media-ref-audio-1|source=base64@@@",
              },
            },
            {
              type: "file",
              file: { file_data: "JVBERi0=", filename: "report.pdf" },
            },
            { type: "file", file: { file_id: "file-abc123" } },
            "@@@langfuseMedia:type=application/pdf|id=media-ref-file-1|source=bytes@@@",
            // Text with several embedded media tokens splits into
            // interleaved text and file parts.
            {
              type: "text",
              text: "Compare @@@langfuseMedia:type=image/png|id=media-ref-inline-1|source=base64@@@ with @@@langfuseMedia:type=image/png|id=media-ref-inline-2|source=base64@@@ please.",
            },
          ],
        },
        {
          role: "assistant",
          content: [
            { type: "refusal", refusal: "I cannot describe this image." },
          ],
        },
      ],
    },
    output: {
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "The Eiffel Tower is 330 meters tall.",
            refusal: null,
            annotations: [
              {
                type: "url_citation",
                url_citation: {
                  url: "https://example.com/eiffel",
                  title: "Eiffel Tower",
                  start_index: 0,
                  end_index: 37,
                },
              },
            ],
            audio: {
              id: "audio_001",
              data: "@@@langfuseMedia:type=audio/mpeg|id=media-ref-audio-2|source=base64@@@",
              transcript: "The Eiffel Tower is 330 meters tall.",
              expires_at: 1755672000,
            },
          },
          finish_reason: "stop",
        },
      ],
    },
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "system",
        parts: [{ type: "text", text: "You are a helpful assistant." }],
        source: "input",
      },
      {
        role: "user",
        parts: [
          { type: "text", text: "What is in these files?" },
          {
            type: "file",
            mediaType: "image/*",
            content: { kind: "url", url: "https://example.com/cat.png" },
            providerMetadata: { detail: "low" },
          },
          {
            type: "file",
            // Data-URIs stay urls (they render as urls; decoding is the media
            // pipeline's job), but the prefix still declares the exact type.
            mediaType: "image/png",
            content: { kind: "url", url: "data:image/png;base64,aGVsbG8=" },
          },
          {
            type: "file",
            mediaType: "image/jpeg",
            content: { kind: "reference", id: "media-ref-image-1" },
            providerMetadata: { source: "base64" },
          },
          {
            type: "file",
            mediaType: "audio/wav",
            content: { kind: "base64", data: "UklGRg==" },
          },
          {
            type: "file",
            mediaType: "audio/mpeg",
            content: { kind: "reference", id: "media-ref-audio-1" },
            providerMetadata: { source: "base64" },
          },
          {
            type: "file",
            filename: "report.pdf",
            content: { kind: "base64", data: "JVBERi0=" },
          },
          {
            type: "file",
            content: { kind: "reference", id: "file-abc123" },
          },
          {
            type: "file",
            mediaType: "application/pdf",
            content: { kind: "reference", id: "media-ref-file-1" },
            providerMetadata: { source: "bytes" },
          },
          { type: "text", text: "Compare " },
          {
            type: "file",
            mediaType: "image/png",
            content: { kind: "reference", id: "media-ref-inline-1" },
            providerMetadata: { source: "base64" },
          },
          { type: "text", text: " with " },
          {
            type: "file",
            mediaType: "image/png",
            content: { kind: "reference", id: "media-ref-inline-2" },
            providerMetadata: { source: "base64" },
          },
          { type: "text", text: " please." },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            refusal: true,
            text: "I cannot describe this image.",
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "The Eiffel Tower is 330 meters tall.",
            providerMetadata: {
              citations: [
                {
                  type: "url_citation",
                  url_citation: {
                    url: "https://example.com/eiffel",
                    title: "Eiffel Tower",
                    start_index: 0,
                    end_index: 37,
                  },
                },
              ],
            },
          },
          {
            type: "file",
            mediaType: "audio/mpeg",
            content: { kind: "reference", id: "media-ref-audio-2" },
            providerMetadata: {
              source: "base64",
              id: "audio_001",
              transcript: "The Eiffel Tower is 330 meters tall.",
              expires_at: 1755672000,
            },
          },
        ],
        // The finish reason lives on the choice, not the message.
        finishReason: { type: "stop", raw: "stop" },
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

/**
 * Hand-built from OpenAI's documented Responses API item shapes, covering the
 * non-function surfaces: media inputs (input_image / input_file), a reasoning
 * item with both raw content (reasoning_text) and summary plus
 * encrypted_content, provider-executed built-in tool items (web_search_call,
 * mcp_call), the custom tool-call protocol, and per-part citation
 * annotations with a refusal in the output message.
 *
 * Built-in items carry no name/arguments — the item type is the tool. They
 * normalize to provider-executed tool calls with the raw item type as
 * toolType and the kind-specific payload as input.
 */
export const openAiResponsesBuiltInToolsAndMediaFixture = {
  name: "normalizes OpenAI Responses built-in tools, media inputs, and rich reasoning",
  spanIO: {
    input: JSON.stringify([
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Check the docs and describe the diagram.",
          },
          {
            type: "input_image",
            detail: "auto",
            image_url: "https://example.com/diagram.png",
          },
          {
            type: "input_file",
            file_url: "https://example.com/spec.pdf",
            filename: "spec.pdf",
          },
        ],
      },
    ]),
    output: JSON.stringify([
      {
        type: "reasoning",
        id: "rs_100",
        summary: [{ type: "summary_text", text: "Weighing the sources." }],
        content: [
          { type: "reasoning_text", text: "Detailed chain of thought." },
        ],
        encrypted_content: "enc_abc123",
      },
      {
        type: "web_search_call",
        id: "ws_100",
        status: "completed",
        action: { type: "search", query: "diagram spec" },
      },
      {
        type: "custom_tool_call",
        id: "ctc_100",
        call_id: "call_custom_100",
        name: "render_diagram",
        input: "graph TD; A-->B",
      },
      {
        type: "custom_tool_call_output",
        id: "cto_100",
        call_id: "call_custom_100",
        output: "ok",
      },
      {
        type: "mcp_call",
        id: "mcp_100",
        name: "query_db",
        arguments: '{"sql":"SELECT 1"}',
        server_label: "analytics",
        output: '[{"one":1}]',
      },
      {
        type: "mcp_list_tools",
        id: "mcpl_100",
        server_label: "analytics",
        tools: [
          {
            name: "query_db",
            description: "Run a SQL query",
            input_schema: { type: "object" },
          },
        ],
      },
      {
        type: "message",
        id: "msg_100",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: "The diagram shows a simple flow.",
            annotations: [
              {
                type: "url_citation",
                url_citation: {
                  url: "https://example.com/spec",
                  title: "Spec",
                  start_index: 0,
                  end_index: 32,
                },
              },
            ],
          },
          { type: "refusal", refusal: "I cannot share the internal spec." },
        ],
      },
    ]),
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "user",
        parts: [
          { type: "text", text: "Check the docs and describe the diagram." },
          {
            type: "file",
            mediaType: "image/*",
            content: { kind: "url", url: "https://example.com/diagram.png" },
            providerMetadata: { detail: "auto" },
          },
          {
            type: "file",
            filename: "spec.pdf",
            content: { kind: "url", url: "https://example.com/spec.pdf" },
          },
        ],
        source: "input",
      },
      {
        id: "rs_100",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            content: { kind: "text", text: "Detailed chain of thought." },
          },
          {
            type: "reasoning",
            content: { kind: "text", text: "Weighing the sources." },
          },
          // The replayable encrypted blob is its own stream element.
          {
            type: "reasoning",
            content: { kind: "encrypted", data: "enc_abc123" },
          },
        ],
        source: "output",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: "ws_100",
            toolName: "web_search",
            input: { action: { type: "search", query: "diagram spec" } },
            toolType: "web_search_call",
            providerExecuted: true,
            providerMetadata: { status: "completed" },
          },
          {
            type: "tool-call",
            toolCallId: "call_custom_100",
            toolName: "render_diagram",
            input: "graph TD; A-->B",
            toolType: "custom",
          },
        ],
        source: "output",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: "call_custom_100",
            output: "ok",
          },
        ],
        source: "output",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: "mcp_100",
            toolName: "query_db",
            input: { sql: "SELECT 1" },
            toolType: "mcp_call",
            providerExecuted: true,
            providerMetadata: {
              server_label: "analytics",
              output: '[{"one":1}]',
            },
          },
        ],
        source: "output",
      },
      {
        id: "msg_100",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "The diagram shows a simple flow.",
            providerMetadata: {
              citations: [
                {
                  type: "url_citation",
                  url_citation: {
                    url: "https://example.com/spec",
                    title: "Spec",
                    start_index: 0,
                    end_index: 32,
                  },
                },
              ],
            },
          },
          {
            type: "text",
            refusal: true,
            text: "I cannot share the internal spec.",
          },
        ],
        source: "output",
      },
    ],
    toolDefinitions: [
      {
        // From the mcp_list_tools item — definitions, not conversation
        // content; no message is emitted for the listing itself.
        name: "query_db",
        description: "Run a SQL query",
        inputSchema: { type: "object" },
        type: undefined,
      },
    ],
  },
} satisfies NormalizedIOFixture;

// Verbatim stored observation IO from ChatML integration-example exports.
export const capturedTraceFixtures: NormalizedIOFixture[] = [
  // Anonymized gateway Responses capture: structure and IDs preserved; prompt, conversation,
  // command, reasoning text, and opaque encrypted content replaced with sample values.
  {
    name: "anonymized gateway Responses capture with reasoning and parallel tool calls",
    spanIO: {
      input:
        '{"input":[{"content":"You are a coding assistant helping with a sample Python project. Read files, inspect code, and explain your findings clearly. Use the available read, bash, edit, and write tools as needed. The project is located at /Users/developer/projects/example-python. Follow the project instructions in AGENTS.md and keep changes focused.","role":"developer"},{"content":[{"text":"Hello","type":"input_text"}],"role":"user"},{"content":[{"annotations":[],"text":"Hello! What would you like to work on?","type":"output_text"}],"id":"msg_01989159bdac1f03016aaac3a0c7e087d29860c072b72b9bc5","phase":"final_answer","role":"assistant","status":"completed","type":"message"},{"content":[{"text":"Explain how the retry decorator works.","type":"input_text"}],"role":"user"}],"tools":[{"description":"Read the contents of a file. Supports text files and images (jpg, png, gif, webp, bmp). Images are sent as attachments. For text files, output is truncated to 2000 lines or 50KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.","name":"read","parameters":{"properties":{"limit":{"description":"Maximum number of lines to read","type":"number"},"offset":{"description":"Line number to start reading from (1-indexed)","type":"number"},"path":{"description":"Path to the file to read (relative or absolute)","type":"string"}},"required":["path"],"type":"object"},"type":"function"},{"description":"Execute a bash command in the current working directory. Returns stdout and stderr. Output is truncated to last 2000 lines or 50KB (whichever is hit first). If truncated, full output is saved to a temp file. Optionally provide a timeout in seconds.","name":"bash","parameters":{"properties":{"command":{"description":"Shell command to execute","type":"string"},"timeout":{"description":"Timeout in seconds (optional, no default timeout)","type":"number"}},"required":["command"],"type":"object"},"type":"function"},{"description":"Edit a single file using exact text replacement. Every edits[].oldText must match a unique, non-overlapping region of the original file. If two changes affect the same block or nearby lines, merge them into one edit instead of emitting overlapping edits. Do not include large unchanged regions just to connect distant changes.","name":"edit","parameters":{"properties":{"edits":{"description":"One or more targeted replacements. Each edit is matched against the original file, not incrementally. Do not include overlapping or nested edits. If two changes touch the same block or nearby lines, merge them into one edit instead.","items":{"properties":{"newText":{"description":"Replacement text for this targeted edit.","type":"string"},"oldText":{"description":"Exact text for one targeted replacement. It must be unique in the original file and must not overlap with any other edits[].oldText in the same call.","type":"string"}},"required":["oldText","newText"],"type":"object"},"type":"array"},"path":{"description":"Path to the file to edit (relative or absolute)","type":"string"}},"required":["path","edits"],"type":"object"},"type":"function"},{"description":"Write content to a file. Creates the file if it doesn\'t exist, overwrites if it does. Automatically creates parent directories.","name":"write","parameters":{"properties":{"content":{"description":"Content to write to the file","type":"string"},"path":{"description":"Path to the file to write (relative or absolute)","type":"string"}},"required":["path","content"],"type":"object"},"type":"function"}]}',
      output:
        '[{"content":[],"encrypted_content":"anonymized-encrypted-reasoning","id":"rs_01989159bdac1f03016aaac3e381b887d2ab6730f292a7a587","summary":[{"text":"**Inspecting the implementation**\\n\\nI will search the sample project for the retry decorator and its tests, then explain how it handles failed calls.","type":"summary_text"}],"type":"reasoning"},{"arguments":"{\\"command\\":\\"rg -n \\\\\\"def retry|retry\\\\\\" example_sdk tests/unit | head -80\\",\\"timeout\\":10}","call_id":"call_0mE4wfJ7mEy41Nj9HfXjidem","id":"fc_01989159bdac1f03016aaac3e49de487d29427a84b52330077","name":"bash","status":"completed","type":"function_call"}]',
      metadata: {
        "langfuse.gateway.provider.response_id":
          "resp_01989159bdac1f03016aaac3e2b53887d2bf05419f5a5c9409",
        "langfuse.gateway.provider.request_id":
          "req_3bc6e7143cb747cc80876011ee0ac473",
        "langfuse.gateway.provider.request.prompt_cache_key":
          "01a0ab0a-84b2-7775-866d-e0a8ddf0e3b8",
        "langfuse.gateway.provider.connection_id": "cmu3uqinh0004ad0ld88jrfe9",
        "langfuse.gateway.project_id": "cmtvtpilr0004ad0lxphzbd5i",
        "langfuse.gateway.organization_id": "cmtvmaywg0000ad0ly0x9tono",
        "langfuse.gateway.ingestion_mode": "full",
        "langfuse.gateway.api_format": "openai.responses",
        "langfuse.gateway.api-key.id": "cmu3uqwsb0007ad0lwaua4ezv",
        http_status: 200,
        "scope.version": "0.1.0",
        "scope.name": "langfuse-ai-gateway",
        "resourceAttributes.service.name": "langfuse-ai-gateway",
      },
    },
    expected: {
      messages: [
        {
          role: "system",
          parts: [
            {
              type: "text",
              text: "You are a coding assistant helping with a sample Python project. Read files, inspect code, and explain your findings clearly. Use the available read, bash, edit, and write tools as needed. The project is located at /Users/developer/projects/example-python. Follow the project instructions in AGENTS.md and keep changes focused.",
            },
          ],
          source: "input",
        },
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: "Hello",
            },
          ],
          source: "input",
        },
        {
          id: "msg_01989159bdac1f03016aaac3a0c7e087d29860c072b72b9bc5",
          role: "assistant",
          parts: [
            {
              type: "text",
              text: "Hello! What would you like to work on?",
            },
          ],
          source: "input",
        },
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: "Explain how the retry decorator works.",
            },
          ],
          source: "input",
        },
        {
          id: "rs_01989159bdac1f03016aaac3e381b887d2ab6730f292a7a587",
          role: "assistant",
          parts: [
            {
              type: "reasoning",
              content: {
                kind: "text",
                text: "**Inspecting the implementation**\n\nI will search the sample project for the retry decorator and its tests, then explain how it handles failed calls.",
              },
            },
            {
              type: "reasoning",
              content: {
                kind: "encrypted",
                data: "anonymized-encrypted-reasoning",
              },
            },
          ],
          source: "output",
        },
        {
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              toolCallId: "call_0mE4wfJ7mEy41Nj9HfXjidem",
              toolName: "bash",
              input: {
                command:
                  'rg -n "def retry|retry" example_sdk tests/unit | head -80',
                timeout: 10,
              },
              toolType: "function_call",
              providerMetadata: {
                status: "completed",
              },
            },
          ],
          source: "output",
        },
      ],
      toolDefinitions: [
        {
          name: "read",
          description:
            "Read the contents of a file. Supports text files and images (jpg, png, gif, webp, bmp). Images are sent as attachments. For text files, output is truncated to 2000 lines or 50KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.",
          inputSchema: {
            properties: {
              limit: {
                description: "Maximum number of lines to read",
                type: "number",
              },
              offset: {
                description: "Line number to start reading from (1-indexed)",
                type: "number",
              },
              path: {
                description: "Path to the file to read (relative or absolute)",
                type: "string",
              },
            },
            required: ["path"],
            type: "object",
          },
          type: "function",
        },
        {
          name: "bash",
          description:
            "Execute a bash command in the current working directory. Returns stdout and stderr. Output is truncated to last 2000 lines or 50KB (whichever is hit first). If truncated, full output is saved to a temp file. Optionally provide a timeout in seconds.",
          inputSchema: {
            properties: {
              command: {
                description: "Shell command to execute",
                type: "string",
              },
              timeout: {
                description:
                  "Timeout in seconds (optional, no default timeout)",
                type: "number",
              },
            },
            required: ["command"],
            type: "object",
          },
          type: "function",
        },
        {
          name: "edit",
          description:
            "Edit a single file using exact text replacement. Every edits[].oldText must match a unique, non-overlapping region of the original file. If two changes affect the same block or nearby lines, merge them into one edit instead of emitting overlapping edits. Do not include large unchanged regions just to connect distant changes.",
          inputSchema: {
            properties: {
              edits: {
                description:
                  "One or more targeted replacements. Each edit is matched against the original file, not incrementally. Do not include overlapping or nested edits. If two changes touch the same block or nearby lines, merge them into one edit instead.",
                items: {
                  properties: {
                    newText: {
                      description: "Replacement text for this targeted edit.",
                      type: "string",
                    },
                    oldText: {
                      description:
                        "Exact text for one targeted replacement. It must be unique in the original file and must not overlap with any other edits[].oldText in the same call.",
                      type: "string",
                    },
                  },
                  required: ["oldText", "newText"],
                  type: "object",
                },
                type: "array",
              },
              path: {
                description: "Path to the file to edit (relative or absolute)",
                type: "string",
              },
            },
            required: ["path", "edits"],
            type: "object",
          },
          type: "function",
        },
        {
          name: "write",
          description:
            "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.",
          inputSchema: {
            properties: {
              content: {
                description: "Content to write to the file",
                type: "string",
              },
              path: {
                description: "Path to the file to write (relative or absolute)",
                type: "string",
              },
            },
            required: ["path", "content"],
            type: "object",
          },
          type: "function",
        },
      ],
    },
  },
  // Source: worker/src/__tests__/chatml/framework-traces/openai-agents-2025-09-30.trace.json; observation 90d94774e8e3724d
  {
    name: "verbatim openai-agents-2025-09-30.trace.json / 90d94774e8e3724d",
    spanIO: {
      input:
        '[{"content": "What\'s the weather in Tokyo?", "role": "user"}, {"arguments": "{\\"city\\":\\"Tokyo\\"}", "call_id": "call_Kud0j0DxWSmLzv9W5m6qVqXn", "name": "get_weather", "type": "function_call", "id": "fc_0f00ca5b7e22bb4c0068db9d00d258819d987f4b9b63189e76", "status": "completed"}, {"call_id": "call_Kud0j0DxWSmLzv9W5m6qVqXn", "output": "The weather in Tokyo is sunny.", "type": "function_call_output"}]',
      output:
        '{"id":"resp_0f00ca5b7e22bb4c0068db9d0110d8819da676bd1f2dd03a40","created_at":1759223041.0,"error":null,"incomplete_details":null,"instructions":"You are a helpful agent.","metadata":{},"model":"gpt-4.1-2025-04-14","object":"response","output":[{"id":"msg_0f00ca5b7e22bb4c0068db9d019a78819d9fe1e4d3b6c96b68","content":[{"annotations":[],"text":"The weather in Tokyo is currently sunny. If you need more details like temperature or forecast for the upcoming days, just let me know!","type":"output_text","logprobs":[]}],"role":"assistant","status":"completed","type":"message"}],"parallel_tool_calls":true,"temperature":1.0,"tool_choice":"auto","tools":[{"name":"get_weather","parameters":{"properties":{"city":{"title":"City","type":"string"}},"required":["city"],"title":"get_weather_args","type":"object","additionalProperties":false},"strict":true,"type":"function","description":null}],"top_p":1.0,"background":false,"conversation":null,"max_output_tokens":null,"max_tool_calls":null,"previous_response_id":null,"prompt":null,"prompt_cache_key":null,"reasoning":{"effort":null,"generate_summary":null,"summary":null},"safety_identifier":null,"service_tier":"default","status":"completed","text":{"format":{"type":"text"},"verbosity":"medium"},"top_logprobs":0,"truncation":"disabled","usage":{"input_tokens":85,"input_tokens_details":{"cached_tokens":0},"output_tokens":29,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":114},"user":null,"billing":{"payer":"developer"},"store":true}',
      metadata:
        '{"attributes":{"llm.system":"openai","output.mime_type":"application/json","output.value":"{\\"id\\":\\"resp_0f00ca5b7e22bb4c0068db9d0110d8819da676bd1f2dd03a40\\",\\"created_at\\":1759223041.0,\\"error\\":null,\\"incomplete_details\\":null,\\"instructions\\":\\"You are a helpful agent.\\",\\"metadata\\":{},\\"model\\":\\"gpt-4.1-2025-04-14\\",\\"object\\":\\"response\\",\\"output\\":[{\\"id\\":\\"msg_0f00ca5b7e22bb4c0068db9d019a78819d9fe1e4d3b6c96b68\\",\\"content\\":[{\\"annotations\\":[],\\"text\\":\\"The weather in Tokyo is currently sunny. If you need more details like temperature or forecast for the upcoming days, just let me know!\\",\\"type\\":\\"output_text\\",\\"logprobs\\":[]}],\\"role\\":\\"assistant\\",\\"status\\":\\"completed\\",\\"type\\":\\"message\\"}],\\"parallel_tool_calls\\":true,\\"temperature\\":1.0,\\"tool_choice\\":\\"auto\\",\\"tools\\":[{\\"name\\":\\"get_weather\\",\\"parameters\\":{\\"properties\\":{\\"city\\":{\\"title\\":\\"City\\",\\"type\\":\\"string\\"}},\\"required\\":[\\"city\\"],\\"title\\":\\"get_weather_args\\",\\"type\\":\\"object\\",\\"additionalProperties\\":false},\\"strict\\":true,\\"type\\":\\"function\\",\\"description\\":null}],\\"top_p\\":1.0,\\"background\\":false,\\"conversation\\":null,\\"max_output_tokens\\":null,\\"max_tool_calls\\":null,\\"previous_response_id\\":null,\\"prompt\\":null,\\"prompt_cache_key\\":null,\\"reasoning\\":{\\"effort\\":null,\\"generate_summary\\":null,\\"summary\\":null},\\"safety_identifier\\":null,\\"service_tier\\":\\"default\\",\\"status\\":\\"completed\\",\\"text\\":{\\"format\\":{\\"type\\":\\"text\\"},\\"verbosity\\":\\"medium\\"},\\"top_logprobs\\":0,\\"truncation\\":\\"disabled\\",\\"usage\\":{\\"input_tokens\\":85,\\"input_tokens_details\\":{\\"cached_tokens\\":0},\\"output_tokens\\":29,\\"output_tokens_details\\":{\\"reasoning_tokens\\":0},\\"total_tokens\\":114},\\"user\\":null,\\"billing\\":{\\"payer\\":\\"developer\\"},\\"store\\":true}","llm.tools.0.tool.json_schema":"{\\"type\\": \\"function\\", \\"function\\": {\\"name\\": \\"get_weather\\", \\"description\\": null, \\"parameters\\": {\\"properties\\": {\\"city\\": {\\"title\\": \\"City\\", \\"type\\": \\"string\\"}}, \\"required\\": [\\"city\\"], \\"title\\": \\"get_weather_args\\", \\"type\\": \\"object\\", \\"additionalProperties\\": false}, \\"strict\\": true}}","llm.token_count.completion":"29","llm.token_count.prompt":"85","llm.token_count.total":"114","llm.token_count.prompt_details.cache_read":"0","llm.token_count.completion_details.reasoning":"0","llm.output_messages.0.message.role":"assistant","llm.output_messages.0.message.contents.0.message_content.type":"text","llm.output_messages.0.message.contents.0.message_content.text":"The weather in Tokyo is currently sunny. If you need more details like temperature or forecast for the upcoming days, just let me know!","llm.input_messages.0.message.role":"system","llm.input_messages.0.message.content":"You are a helpful agent.","llm.model_name":"gpt-4.1-2025-04-14","llm.invocation_parameters":"{\\"id\\": \\"resp_0f00ca5b7e22bb4c0068db9d0110d8819da676bd1f2dd03a40\\", \\"created_at\\": 1759223041.0, \\"instructions\\": \\"You are a helpful agent.\\", \\"metadata\\": {}, \\"model\\": \\"gpt-4.1-2025-04-14\\", \\"parallel_tool_calls\\": true, \\"temperature\\": 1.0, \\"tool_choice\\": \\"auto\\", \\"top_p\\": 1.0, \\"background\\": false, \\"reasoning\\": {}, \\"service_tier\\": \\"default\\", \\"text\\": {\\"format\\": {\\"type\\": \\"text\\"}, \\"verbosity\\": \\"medium\\"}, \\"top_logprobs\\": 0, \\"truncation\\": \\"disabled\\", \\"billing\\": {\\"payer\\": \\"developer\\"}, \\"store\\": true}","input.mime_type":"application/json","input.value":"[{\\"content\\": \\"What\'s the weather in Tokyo?\\", \\"role\\": \\"user\\"}, {\\"arguments\\": \\"{\\\\\\"city\\\\\\":\\\\\\"Tokyo\\\\\\"}\\", \\"call_id\\": \\"call_Kud0j0DxWSmLzv9W5m6qVqXn\\", \\"name\\": \\"get_weather\\", \\"type\\": \\"function_call\\", \\"id\\": \\"fc_0f00ca5b7e22bb4c0068db9d00d258819d987f4b9b63189e76\\", \\"status\\": \\"completed\\"}, {\\"call_id\\": \\"call_Kud0j0DxWSmLzv9W5m6qVqXn\\", \\"output\\": \\"The weather in Tokyo is sunny.\\", \\"type\\": \\"function_call_output\\"}]","llm.input_messages.1.message.role":"user","llm.input_messages.1.message.content":"What\'s the weather in Tokyo?","llm.input_messages.2.message.role":"assistant","llm.input_messages.2.message.tool_calls.0.tool_call.id":"call_Kud0j0DxWSmLzv9W5m6qVqXn","llm.input_messages.2.message.tool_calls.0.tool_call.function.name":"get_weather","llm.input_messages.2.message.tool_calls.0.tool_call.function.arguments":"{\\"city\\":\\"Tokyo\\"}","llm.input_messages.3.message.role":"tool","llm.input_messages.3.message.tool_call_id":"call_Kud0j0DxWSmLzv9W5m6qVqXn","llm.input_messages.3.message.content":"The weather in Tokyo is sunny.","openinference.span.kind":"LLM"},"resourceAttributes":{"telemetry.sdk.language":"python","telemetry.sdk.name":"opentelemetry","telemetry.sdk.version":"1.37.0","service.name":"unknown_service"},"scope":{"name":"openinference.instrumentation.openai_agents","version":"1.3.0","attributes":{}}}',
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
              toolCallId: "call_Kud0j0DxWSmLzv9W5m6qVqXn",
              toolName: "get_weather",
              input: {
                city: "Tokyo",
              },
              toolType: "function_call",
              providerMetadata: {
                status: "completed",
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
              toolCallId: "call_Kud0j0DxWSmLzv9W5m6qVqXn",
              output: "The weather in Tokyo is sunny.",
            },
          ],
          source: "input",
        },
        {
          id: "msg_0f00ca5b7e22bb4c0068db9d019a78819d9fe1e4d3b6c96b68",
          role: "assistant",
          parts: [
            {
              type: "text",
              text: "The weather in Tokyo is currently sunny. If you need more details like temperature or forecast for the upcoming days, just let me know!",
              providerMetadata: {
                logprobs: [],
              },
            },
          ],
          source: "output",
        },
      ],
      toolDefinitions: [
        {
          name: "get_weather",
          inputSchema: {
            properties: {
              city: {
                title: "City",
                type: "string",
              },
            },
            required: ["city"],
            title: "get_weather_args",
            type: "object",
            additionalProperties: false,
          },
          type: "function",
          providerMetadata: {
            strict: true,
          },
        },
      ],
    },
  },
  // Source: worker/src/__tests__/chatml/framework-traces/openai-agents-2025-09-30.trace.json; observation 98870087af69bf06
  {
    name: "verbatim openai-agents-2025-09-30.trace.json / 98870087af69bf06",
    spanIO: {
      input: '[{"content": "What\'s the weather in Tokyo?", "role": "user"}]',
      output:
        '{"id":"resp_0f00ca5b7e22bb4c0068db9d000be4819d824c447c54b65bc1","created_at":1759223040.0,"error":null,"incomplete_details":null,"instructions":"You are a helpful agent.","metadata":{},"model":"gpt-4.1-2025-04-14","object":"response","output":[{"arguments":"{\\"city\\":\\"Tokyo\\"}","call_id":"call_Kud0j0DxWSmLzv9W5m6qVqXn","name":"get_weather","type":"function_call","id":"fc_0f00ca5b7e22bb4c0068db9d00d258819d987f4b9b63189e76","status":"completed"}],"parallel_tool_calls":true,"temperature":1.0,"tool_choice":"auto","tools":[{"name":"get_weather","parameters":{"properties":{"city":{"title":"City","type":"string"}},"required":["city"],"title":"get_weather_args","type":"object","additionalProperties":false},"strict":true,"type":"function","description":null}],"top_p":1.0,"background":false,"conversation":null,"max_output_tokens":null,"max_tool_calls":null,"previous_response_id":null,"prompt":null,"prompt_cache_key":null,"reasoning":{"effort":null,"generate_summary":null,"summary":null},"safety_identifier":null,"service_tier":"default","status":"completed","text":{"format":{"type":"text"},"verbosity":"medium"},"top_logprobs":0,"truncation":"disabled","usage":{"input_tokens":55,"input_tokens_details":{"cached_tokens":0},"output_tokens":15,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":70},"user":null,"billing":{"payer":"developer"},"store":true}',
      metadata:
        '{"attributes":{"llm.system":"openai","output.mime_type":"application/json","output.value":"{\\"id\\":\\"resp_0f00ca5b7e22bb4c0068db9d000be4819d824c447c54b65bc1\\",\\"created_at\\":1759223040.0,\\"error\\":null,\\"incomplete_details\\":null,\\"instructions\\":\\"You are a helpful agent.\\",\\"metadata\\":{},\\"model\\":\\"gpt-4.1-2025-04-14\\",\\"object\\":\\"response\\",\\"output\\":[{\\"arguments\\":\\"{\\\\\\"city\\\\\\":\\\\\\"Tokyo\\\\\\"}\\",\\"call_id\\":\\"call_Kud0j0DxWSmLzv9W5m6qVqXn\\",\\"name\\":\\"get_weather\\",\\"type\\":\\"function_call\\",\\"id\\":\\"fc_0f00ca5b7e22bb4c0068db9d00d258819d987f4b9b63189e76\\",\\"status\\":\\"completed\\"}],\\"parallel_tool_calls\\":true,\\"temperature\\":1.0,\\"tool_choice\\":\\"auto\\",\\"tools\\":[{\\"name\\":\\"get_weather\\",\\"parameters\\":{\\"properties\\":{\\"city\\":{\\"title\\":\\"City\\",\\"type\\":\\"string\\"}},\\"required\\":[\\"city\\"],\\"title\\":\\"get_weather_args\\",\\"type\\":\\"object\\",\\"additionalProperties\\":false},\\"strict\\":true,\\"type\\":\\"function\\",\\"description\\":null}],\\"top_p\\":1.0,\\"background\\":false,\\"conversation\\":null,\\"max_output_tokens\\":null,\\"max_tool_calls\\":null,\\"previous_response_id\\":null,\\"prompt\\":null,\\"prompt_cache_key\\":null,\\"reasoning\\":{\\"effort\\":null,\\"generate_summary\\":null,\\"summary\\":null},\\"safety_identifier\\":null,\\"service_tier\\":\\"default\\",\\"status\\":\\"completed\\",\\"text\\":{\\"format\\":{\\"type\\":\\"text\\"},\\"verbosity\\":\\"medium\\"},\\"top_logprobs\\":0,\\"truncation\\":\\"disabled\\",\\"usage\\":{\\"input_tokens\\":55,\\"input_tokens_details\\":{\\"cached_tokens\\":0},\\"output_tokens\\":15,\\"output_tokens_details\\":{\\"reasoning_tokens\\":0},\\"total_tokens\\":70},\\"user\\":null,\\"billing\\":{\\"payer\\":\\"developer\\"},\\"store\\":true}","llm.tools.0.tool.json_schema":"{\\"type\\": \\"function\\", \\"function\\": {\\"name\\": \\"get_weather\\", \\"description\\": null, \\"parameters\\": {\\"properties\\": {\\"city\\": {\\"title\\": \\"City\\", \\"type\\": \\"string\\"}}, \\"required\\": [\\"city\\"], \\"title\\": \\"get_weather_args\\", \\"type\\": \\"object\\", \\"additionalProperties\\": false}, \\"strict\\": true}}","llm.token_count.completion":"15","llm.token_count.prompt":"55","llm.token_count.total":"70","llm.token_count.prompt_details.cache_read":"0","llm.token_count.completion_details.reasoning":"0","llm.output_messages.0.message.role":"assistant","llm.output_messages.0.message.tool_calls.0.tool_call.id":"call_Kud0j0DxWSmLzv9W5m6qVqXn","llm.output_messages.0.message.tool_calls.0.tool_call.function.name":"get_weather","llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments":"{\\"city\\":\\"Tokyo\\"}","llm.input_messages.0.message.role":"system","llm.input_messages.0.message.content":"You are a helpful agent.","llm.model_name":"gpt-4.1-2025-04-14","llm.invocation_parameters":"{\\"id\\": \\"resp_0f00ca5b7e22bb4c0068db9d000be4819d824c447c54b65bc1\\", \\"created_at\\": 1759223040.0, \\"instructions\\": \\"You are a helpful agent.\\", \\"metadata\\": {}, \\"model\\": \\"gpt-4.1-2025-04-14\\", \\"parallel_tool_calls\\": true, \\"temperature\\": 1.0, \\"tool_choice\\": \\"auto\\", \\"top_p\\": 1.0, \\"background\\": false, \\"reasoning\\": {}, \\"service_tier\\": \\"default\\", \\"text\\": {\\"format\\": {\\"type\\": \\"text\\"}, \\"verbosity\\": \\"medium\\"}, \\"top_logprobs\\": 0, \\"truncation\\": \\"disabled\\", \\"billing\\": {\\"payer\\": \\"developer\\"}, \\"store\\": true}","input.mime_type":"application/json","input.value":"[{\\"content\\": \\"What\'s the weather in Tokyo?\\", \\"role\\": \\"user\\"}]","llm.input_messages.1.message.role":"user","llm.input_messages.1.message.content":"What\'s the weather in Tokyo?","openinference.span.kind":"LLM"},"resourceAttributes":{"telemetry.sdk.language":"python","telemetry.sdk.name":"opentelemetry","telemetry.sdk.version":"1.37.0","service.name":"unknown_service"},"scope":{"name":"openinference.instrumentation.openai_agents","version":"1.3.0","attributes":{}}}',
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
              toolCallId: "call_Kud0j0DxWSmLzv9W5m6qVqXn",
              toolName: "get_weather",
              input: {
                city: "Tokyo",
              },
              toolType: "function_call",
              providerMetadata: {
                status: "completed",
              },
            },
          ],
          source: "output",
        },
      ],
      toolDefinitions: [
        {
          name: "get_weather",
          inputSchema: {
            properties: {
              city: {
                title: "City",
                type: "string",
              },
            },
            required: ["city"],
            title: "get_weather_args",
            type: "object",
            additionalProperties: false,
          },
          type: "function",
          providerMetadata: {
            strict: true,
          },
        },
      ],
    },
  },
];
