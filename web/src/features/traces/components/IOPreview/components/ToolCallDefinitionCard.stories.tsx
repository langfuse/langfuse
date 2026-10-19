import { expect, userEvent, within } from "storybook/test";

import preview from "../../../../../../.storybook/preview";
import {
  ToolCallDefinitionCard,
  type ToolDefinition,
} from "./ToolCallDefinitionCard";
import type { ToolCallInvocation } from "../../../hooks/useChatMLParser";

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
  },
});

export const Called = meta.story({
  args: {
    tools: baseTools,
    toolCallCounts: new Map([["search_docs", 1]]),
    toolCallsByName: baseToolCalls,
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
  },
});

const manyToolNames = [
  "langfuse_getPrompt",
  "langfuse_getPromptUnresolved",
  "langfuse_listPrompts",
  "langfuse_listObservations",
  "langfuse_getObservation",
  "langfuse_getObservationFieldSchema",
  "langfuse_getObservationFilterSchema",
  "langfuse_getObservationFilterValues",
  "langfuse_listAnnotationQueues",
  "langfuse_getAnnotationQueue",
  "langfuse_listAnnotationQueueItems",
  "langfuse_createScoreConfigForProject",
  "langfuse_searchLangfuseDocs",
  "langfuse_proposeRedirect",
  "langfuse_listDatasets",
  "langfuse_getDataset",
  "langfuse_listSessions",
  "langfuse_getSession",
];
const calledNames = new Set(manyToolNames.slice(12));

const TOOLS_COLLAPSED_KEY = "toolsSectionCollapsed";

/** Opens the section so stories with many tools show their rows. */
const startExpanded = () => {
  sessionStorage.setItem(TOOLS_COLLAPSED_KEY, "false");
  return () => sessionStorage.removeItem(TOOLS_COLLAPSED_KEY);
};

/** Both sides have tools, so the header shows the Called / Not called switch. */
export const ManyTools = meta.story({
  beforeEach: startExpanded,
  args: {
    tools: manyToolNames.map((name) => ({ name })),
    toolCallCounts: new Map(
      manyToolNames.map((name) => [name, calledNames.has(name) ? 1 : 0]),
    ),
    toolCallsByName: new Map(),
  },
});

/** Nothing called: no switch, one muted list. */
export const NoneCalled = meta.story({
  beforeEach: startExpanded,
  args: {
    tools: manyToolNames.map((name) => ({ name })),
    toolCallCounts: new Map(manyToolNames.map((name) => [name, 0])),
    toolCallsByName: new Map(),
  },
});

/** Everything called: no switch, one list. */
export const AllCalled = meta.story({
  beforeEach: startExpanded,
  args: {
    tools: manyToolNames.map((name) => ({ name })),
    toolCallCounts: new Map(manyToolNames.map((name) => [name, 1])),
    toolCallsByName: new Map(),
  },
});

export const NotCalledTab = meta.story({
  name: "(Test) Not Called Tab",
  beforeEach: startExpanded,
  args: ManyTools.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("tab", { name: /^Called\s*6$/ }),
    ).toHaveAttribute("aria-selected", "true");
    await userEvent.click(
      canvas.getByRole("tab", { name: /^Not called\s*12$/ }),
    );
    const firstRow = canvas.getByRole("button", {
      name: /langfuse_getPrompt$/,
    });
    await expect(within(firstRow).getByText("1.")).toBeVisible();
    await expect(canvas.queryByText("langfuse_getSession")).toBeNull();
  },
});

/** More than five tools: the section starts collapsed to its header. */
export const CollapsedByDefault = meta.story({
  name: "(Test) Collapsed By Default",
  beforeEach: () => sessionStorage.removeItem(TOOLS_COLLAPSED_KEY),
  args: ManyTools.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const header = canvas.getByRole("button", { name: "Tools" });
    await expect(header).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByRole("tab")).toBeNull();

    await userEvent.click(header);
    await expect(header).toHaveAttribute("aria-expanded", "true");
    await expect(
      canvas.getByRole("tab", { name: /^Called\s*6$/ }),
    ).toBeVisible();
    sessionStorage.removeItem(TOOLS_COLLAPSED_KEY);
  },
});
