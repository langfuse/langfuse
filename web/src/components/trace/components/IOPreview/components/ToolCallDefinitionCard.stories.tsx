import preview from "../../../../../../.storybook/preview";
import {
  ToolCallDefinitionCard,
  type ToolDefinition,
} from "./ToolCallDefinitionCard";
import type { ToolCallInvocation } from "../hooks/useChatMLParser";

const baseTools: ToolDefinition[] = [
  {
    name: "search_docs",
    description: "Searches product docs for relevant troubleshooting steps.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What to search for",
        },
        limit: {
          type: "number",
          description: "Maximum number of results",
        },
      },
      required: ["query"],
    },
  },
];

const baseToolCalls = new Map<string, ToolCallInvocation[]>([
  [
    "search_docs",
    [
      {
        id: "call_01HXYZ123",
        name: "search_docs",
        invocationNumber: 1,
        arguments: JSON.stringify({ query: "rate limits", limit: 3 }),
      },
    ],
  ],
]);

const meta = preview.meta({
  component: ToolCallDefinitionCard,
});

export const Default = meta.story({
  args: {
    tools: baseTools,
    toolCallCounts: new Map([["search_docs", 0]]),
    toolCallsByName: new Map(),
    toolNameToDefinitionNumber: new Map([["search_docs", 1]]),
  },
});

export const Called = meta.story({
  args: {
    tools: baseTools,
    toolCallCounts: new Map([["search_docs", 1]]),
    toolCallsByName: baseToolCalls,
    toolNameToDefinitionNumber: new Map([["search_docs", 1]]),
  },
});

export const MultipleTools = meta.story({
  args: {
    tools: [
      ...baseTools,
      {
        name: "create_ticket",
        description: "Creates a support escalation ticket.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            priority: { type: "string", enum: ["low", "high"] },
          },
          required: ["title", "priority"],
        },
      },
      {
        name: "notify_team",
      },
    ],
    toolCallCounts: new Map([
      ["search_docs", 2],
      ["create_ticket", 1],
      ["notify_team", 0],
    ]),
    toolCallsByName: new Map<string, ToolCallInvocation[]>([
      [
        "search_docs",
        [
          {
            id: "call_01HXYZ123",
            name: "search_docs",
            invocationNumber: 1,
            arguments: JSON.stringify({ query: "rate limits", limit: 3 }),
          },
          {
            id: "call_01HXYZ124",
            name: "search_docs",
            invocationNumber: 2,
            arguments: JSON.stringify({ query: "retry policy" }),
          },
        ],
      ],
      [
        "create_ticket",
        [
          {
            id: "call_01HXYZ200",
            name: "create_ticket",
            invocationNumber: 1,
            arguments: {
              title: "API requests failing",
              priority: "high",
            },
          },
        ],
      ],
    ]),
    toolNameToDefinitionNumber: new Map([
      ["search_docs", 1],
      ["create_ticket", 2],
      ["notify_team", 3],
    ]),
  },
});

export const WithLongToolNames = meta.story({
  args: {
    tools: [
      {
        name: "search_enterprise_customer_documentation_for_multistep_api_rate_limit_troubleshooting_and_backoff_recommendations",
        description:
          "Looks up long-form support guidance for enterprise API incidents.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
      },
      {
        name: "create_cross_functional_incident_escalation_ticket_with_customer_context_and_internal_follow_up_requirements",
        description: "Creates a detailed incident escalation ticket.",
      },
    ],
    toolCallCounts: new Map([
      [
        "search_enterprise_customer_documentation_for_multistep_api_rate_limit_troubleshooting_and_backoff_recommendations",
        1,
      ],
      [
        "create_cross_functional_incident_escalation_ticket_with_customer_context_and_internal_follow_up_requirements",
        0,
      ],
    ]),
    toolCallsByName: new Map<string, ToolCallInvocation[]>([
      [
        "search_enterprise_customer_documentation_for_multistep_api_rate_limit_troubleshooting_and_backoff_recommendations",
        [
          {
            id: "call_long_01",
            name: "search_enterprise_customer_documentation_for_multistep_api_rate_limit_troubleshooting_and_backoff_recommendations",
            invocationNumber: 1,
            arguments: JSON.stringify({ query: "429 retry guidance" }),
          },
        ],
      ],
    ]),
    toolNameToDefinitionNumber: new Map([
      [
        "search_enterprise_customer_documentation_for_multistep_api_rate_limit_troubleshooting_and_backoff_recommendations",
        1,
      ],
      [
        "create_cross_functional_incident_escalation_ticket_with_customer_context_and_internal_follow_up_requirements",
        2,
      ],
    ]),
  },
});
