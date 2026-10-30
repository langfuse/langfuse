import preview from "../../../../../.storybook/preview";
import { expect, spyOn, userEvent, within, waitFor } from "storybook/test";
import { IOPreviewPretty } from "./IOPreviewPretty";
import type { ToolDefinition } from "./components/ToolCallDefinitionCard";
import type {
  ChatMLParserResult,
  ToolCallInvocation,
} from "../../hooks/useChatMLParser";
import { useState, type ComponentProps, type ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCReact, getQueryKey } from "@trpc/react-query";
import { createTRPCClient, TRPCClientError } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "@/src/server/api/root";
import { api } from "@/src/utils/api";
import { MarkdownRenderCharacterLimitContext } from "@/src/components/MarkdownRenderCharacterLimitProvider/MarkdownRenderCharacterLimitContext";
import { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";
import { MediaContentType, type MediaReturnType } from "@/src/features/media";
import { MediaEnabledFields } from "@/src/features/media/validation";
import { useCollapseSystemPromptPreference } from "@/src/hooks/useCollapsibleSystemPrompt";

const TOOLS_COLLAPSED_KEY = "toolsSectionCollapsed";

const meta = preview.meta({
  component: IOPreviewPretty,
  beforeEach: () => {
    const previousCollapsed = sessionStorage.getItem(TOOLS_COLLAPSED_KEY);
    const storage = window.localStorage;
    const preferences = new Map(
      ["collapseSystemPrompt", "traceSystemPrompt:collapsed"].map(
        (key) => [key, storage.getItem(key)] as const,
      ),
    );
    for (const key of preferences.keys()) storage.removeItem(key);
    sessionStorage.removeItem(TOOLS_COLLAPSED_KEY);
    return () => {
      for (const [key, value] of preferences) {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      }
      if (previousCollapsed === null) {
        sessionStorage.removeItem(TOOLS_COLLAPSED_KEY);
      } else {
        sessionStorage.setItem(TOOLS_COLLAPSED_KEY, previousCollapsed);
      }
    };
  },
  decorators: [
    (Story) => (
      <MarkdownRenderCharacterLimitContext.Provider value={5_000}>
        <Story />
      </MarkdownRenderCharacterLimitContext.Provider>
    ),
  ],
  args: {
    projectId: "storybook-project",
    traceId: "storybook-trace",
    // Keep this false: the correction editor uses private tRPC APIs and is not isolated for Storybook.
    showCorrections: false,
  },
});

export const Default = meta.story({
  args: {
    input: {
      customerId: "customer-123",
      question: "How do I reduce API latency?",
    },
    output: {
      recommendation: "Enable prompt caching and stream the response.",
      latencyMs: 842,
    },
  },
});

export const OversizedSibling = meta.story({
  args: {
    input: {
      attachment: JSON.stringify({ text: "x".repeat(523_000) }),
      details: JSON.stringify({ status: "ready", count: 2 }),
    },
  },
});

export const DefaultStatus = meta.story({
  args: {
    status: {
      level: "DEFAULT",
      message: "The observation completed with additional status details.",
    },
  },
});

export const DebugStatus = meta.story({
  args: {
    status: {
      level: "DEBUG",
      message: "Detailed diagnostic information for this observation.",
    },
  },
});

export const WarningStatus = meta.story({
  args: {
    status: {
      level: "WARNING",
      message: "The observation completed with a recoverable warning.",
    },
  },
});

export const ErrorStatus = meta.story({
  name: "(Test) Renders Error Message",
  args: {
    status: {
      level: "ERROR",
      message: "Upstream model request timed out after 30 seconds.",
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Error")).toBeVisible();
    await expect(
      canvas.getByText("Upstream model request timed out after 30 seconds."),
    ).toBeVisible();
  },
});

export const StructuredStatus = meta.story({
  name: "(Test) Structured status",
  args: {
    status: {
      level: "ERROR",
      message: '{"error":{"code":"timeout","retryable":true}}',
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Error")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: /(?:Expand|Collapse) all rows/ }),
    ).toBeInTheDocument();
  },
});

export const LongSystemPrompt = meta.story({
  name: "(Test) Long system prompt collapses and persists its preference",
  args: {
    input: {
      messages: [
        {
          role: "system",
          content: Array.from(
            { length: 12 },
            (_, i) =>
              `system-prompt-line-${i + 1} lorem ipsum dolor sit amet consectetur adipiscing elit`,
          ).join("\n"),
        },
        {
          role: "user",
          content: "Summarize the constraints above.",
        },
      ],
    },
    output: {
      role: "assistant",
      content: "Stay within the listed role and constraints.",
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getAllByRole("button", { name: "Expand system" }),
    ).toHaveLength(1);
    await expect(
      canvas.queryByText(/system-prompt-line-1 /),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand system" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Collapse system" }),
    ).toBeVisible();
    await expect(localStorage.getItem("collapseSystemPrompt")).toBe("false");
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse system" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Expand system" }),
    ).toBeVisible();
    await expect(localStorage.getItem("collapseSystemPrompt")).toBe("true");
  },
});

export const MarkdownWithCodeBlock = meta.story({
  args: {
    input: {
      messages: [
        {
          role: "system",
          content: `Use this tracing configuration:

\`\`\`typescript
const trace = langfuse.trace({
  name: "support-workflow",
});
\`\`\``,
        },
        {
          role: "user",
          content: "How can I record a generation?",
        },
      ],
    },
    output: {
      role: "assistant",
      content: `Use the Langfuse SDK to wrap the model call:

\`\`\`typescript
const generation = trace.generation({
  name: "support-answer",
  model: "example-model",
});

generation.end({ output: "Your response" });
\`\`\``,
    },
  },
});

export const NestedMarkdownLists = meta.story({
  args: {
    input: {
      messages: [
        {
          role: "user",
          content: "What is Langfuse useful for?",
        },
      ],
    },
    output: {
      role: "assistant",
      content: `Langfuse is an open-source observability and analytics tool for LLM applications.

In practical terms, it helps you:

- **Track and debug LLM calls**
  - Log prompts, model responses, latency, errors, and metadata
- **Evaluate quality**
  - Run evaluations on outputs (automatic metrics or human feedback)
- **Monitor in production**
  - Dashboards for usage, cost, latency, and failure rates`,
    },
  },
});

export const ToolCall = meta.story({
  args: {
    input: {
      messages: [
        {
          role: "system",
          content: "Use tools when they can provide a precise answer.",
          tools: [
            {
              name: "search_docs",
              description: "Search the product documentation.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string" },
                },
                required: ["query"],
              },
            },
          ],
        },
        {
          role: "user",
          content: "Where can I find trace latency?",
        },
      ],
    },
    output: {
      role: "assistant",
      tool_calls: [
        {
          id: "call-search-docs",
          name: "search_docs",
          arguments: JSON.stringify({ query: "trace latency" }),
        },
      ],
    },
  },
});

export const MetadataNotInPreview = meta.story({
  args: {
    input: "Summarize this support conversation.",
    output: "The customer needs help configuring prompt caching.",
    metadata: {
      model: "example-model",
      region: "eu-west-1",
      cached: true,
    },
  },
});

export const Loading = meta.story({
  args: {
    input: {
      question: "How do I configure evaluations?",
    },
    output: null,
    isLoading: true,
  },
});

export const SpanWithChatMessages = meta.story({
  name: "(Test) Span keeps role titles",
  args: {
    observationType: "SPAN",
    input: [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi, how can I help?" },
      { role: "user", content: "a nice car" },
    ],
    output: [{ role: "assistant", content: "sure" }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Each message mounts a formatted and a hidden JSON header.
    await expect(canvas.getAllByText("user").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("assistant").length).toBeGreaterThan(0);
    await expect(canvas.queryAllByText("Input")).toHaveLength(0);
    await expect(canvas.queryAllByText("Output")).toHaveLength(0);
  },
});

export const SpanWithPlainText = meta.story({
  name: "(Test) Span titles plain text by side",
  args: {
    observationType: "SPAN",
    input: "Summarize this support conversation.",
    output: "The customer needs help configuring prompt caching.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("Input").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("Output").length).toBeGreaterThan(0);
    await expect(canvas.queryAllByText("user")).toHaveLength(0);
  },
});

export const AvailableSkills = meta.story({
  args: {
    hideInput: true,
    hideOutput: true,
    skills: {
      kind: "available",
      items: [
        {
          skillName: "refund-policy",
          langfuseSkillId: "refund",
          skillVersion: 3,
        },
        {
          skillName: "shipping-policy",
          langfuseSkillId: "shipping",
          skillVersion: 1,
        },
        {
          skillName: "subscription-support",
          langfuseSkillId: "subscription",
          skillVersion: 2,
        },
        { skillName: "account-security" },
        { skillName: "billing-support" },
        { skillName: "return-policy" },
        { skillName: "order-tracking" },
        { skillName: "customer-escalation" },
        { skillName: "tone-of-voice" },
        { skillName: "product-guide" },
      ],
    },
  },
});

export const RequestedSkills = meta.story({
  name: "(Test) Requested skills",
  args: {
    ...toolPreviewArgs(
      [],
      new Map([["langfuse_loadSkillResource", 1]]),
      new Map([
        [
          "langfuse_loadSkillResource",
          [
            {
              id: "read-refund-policy",
              name: "langfuse_loadSkillResource",
              arguments: {
                name: "refund-policy",
                path: "references/refunds.md",
              },
              invocationNumber: 1,
            },
          ],
        ],
      ]),
    ),
    skills: {
      kind: "available",
      items: [{ skillName: "refund-policy" }, { skillName: "shipping-policy" }],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      (await canvas.findByText("Requested", { exact: true })).closest(
        '[role="tab"]',
      ),
    ).toHaveAttribute("aria-selected", "true");
    await userEvent.click(
      canvas.getByRole("button", { name: "2 available skills show" }),
    );
    const files = canvas.getByRole("button", {
      name: "Files requested for refund-policy",
    });
    await userEvent.click(files);
    await expect(canvas.getByText("references/refunds.md")).toBeVisible();
    await expect(
      canvas.queryByText("shipping-policy", { exact: true }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByText("Not requested", { exact: true }));
    await expect(
      canvas.getByText("shipping-policy", { exact: true }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", {
        name: "Files requested for refund-policy",
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByText("Requested", { exact: true }));
    await expect(
      canvas.getByRole("button", { name: "Files requested for refund-policy" }),
    ).toHaveAttribute("aria-expanded", "false");
  },
});

export const LoadedSkills = meta.story({
  name: "(Test) Loaded skills",
  args: {
    hideInput: true,
    hideOutput: true,
    skills: {
      kind: "loaded",
      items: [
        {
          skillName: "refund-policy",
          langfuseSkillId: "refund",
          skillVersion: 3,
          filePath: "SKILL.md",
        },
        {
          skillName: "refund-policy",
          langfuseSkillId: "refund",
          skillVersion: 3,
          filePath: "references/refunds.md",
        },
        {
          skillName: "shipping-policy",
          langfuseSkillId: "shipping",
          skillVersion: 1,
          filePath: "references/international-shipping.md",
        },
        { skillName: "local-customer-support", filePath: "SKILL.md" },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const summary = canvas.getByRole("button", {
      name: "3 loaded skills show",
    });
    await expect(summary).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(summary);
    const refundFiles = canvas.getByRole("button", {
      name: "Files loaded for refund-policy",
    });
    await userEvent.click(refundFiles);
    await expect(canvas.getByText("references/refunds.md")).toBeVisible();
    await userEvent.click(summary);
    await userEvent.click(summary);
    await expect(canvas.getByText("references/refunds.md")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Files loaded for shipping-policy" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Files loaded for refund-policy" }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      canvas.getByText("references/international-shipping.md"),
    ).toBeVisible();
  },
});

const baseTools: ToolDefinition[] = [
  {
    name: "search_docs",
    description: "Searches product docs for relevant troubleshooting steps.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for" },
        limit: { type: "number", description: "Maximum number of results" },
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

function toolPreviewArgs(
  tools: ToolDefinition[],
  toolCallCounts: Map<string, number>,
  toolCallsByName: Map<string, ToolCallInvocation[]>,
) {
  return {
    hideInput: true,
    hideOutput: true,
    chatMLParserResult: {
      canDisplayAsChat: false,
      allMessages: [],
      additionalInput: undefined,
      allTools: tools,
      toolCallCounts,
      toolCallsByName,
      messageToToolCallNumbers: new Map(),
      inputMessageCount: 0,
    } satisfies ChatMLParserResult,
  };
}

export const UncalledTool = meta.story({
  args: toolPreviewArgs(baseTools, new Map([["search_docs", 0]]), new Map()),
});

export const CalledTool = meta.story({
  args: toolPreviewArgs(
    baseTools,
    new Map([["search_docs", 1]]),
    baseToolCalls,
  ),
});

export const MultipleTools = meta.story({
  args: toolPreviewArgs(
    [
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
      { name: "notify_team" },
    ],
    new Map([
      ["search_docs", 2],
      ["create_ticket", 1],
      ["notify_team", 0],
    ]),
    new Map([
      [
        "search_docs",
        [
          ...baseToolCalls.get("search_docs")!,
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
            arguments: { title: "API requests failing", priority: "high" },
          },
        ],
      ],
    ]),
  ),
});

const longToolName =
  "search_enterprise_customer_documentation_for_multistep_api_rate_limit_troubleshooting_and_backoff_recommendations";
const longUncalledToolName =
  "create_cross_functional_incident_escalation_ticket_with_customer_context_and_internal_follow_up_requirements";

export const WithLongToolNames = meta.story({
  args: toolPreviewArgs(
    [
      {
        name: longToolName,
        description:
          "Looks up long-form support guidance for enterprise API incidents.",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
      {
        name: longUncalledToolName,
        description: "Creates a detailed incident escalation ticket.",
      },
    ],
    new Map([
      [longToolName, 1],
      [longUncalledToolName, 0],
    ]),
    new Map([
      [
        longToolName,
        [
          {
            id: "call_long_01",
            name: longToolName,
            invocationNumber: 1,
            arguments: JSON.stringify({ query: "429 retry guidance" }),
          },
        ],
      ],
    ]),
  ),
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

export const ManyTools = meta.story({
  beforeEach: () => {
    sessionStorage.setItem(TOOLS_COLLAPSED_KEY, "false");
  },
  args: toolPreviewArgs(
    manyToolNames.map((name) => ({ name })),
    new Map(manyToolNames.map((name) => [name, calledNames.has(name) ? 1 : 0])),
    new Map(),
  ),
});

export const NoneCalled = meta.story({
  beforeEach: () => {
    sessionStorage.setItem(TOOLS_COLLAPSED_KEY, "false");
  },
  args: toolPreviewArgs(
    manyToolNames.map((name) => ({ name })),
    new Map(manyToolNames.map((name) => [name, 0])),
    new Map(),
  ),
});

export const AllCalled = meta.story({
  beforeEach: () => {
    sessionStorage.setItem(TOOLS_COLLAPSED_KEY, "false");
  },
  args: toolPreviewArgs(
    manyToolNames.map((name) => ({ name })),
    new Map(manyToolNames.map((name) => [name, 1])),
    new Map(),
  ),
});

export const NotCalledTab = meta.story({
  name: "(Test) Tools expand and filter by invocation status",
  args: ManyTools.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("tab")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Expand Tools" }));
    await expect(
      canvas.getByRole("tab", { name: /^Called\s*6$/ }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      canvas.getByRole("button", {
        name: /langfuse_searchLangfuseDocs$/,
      }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("tab", { name: /^Not called\s*12$/ }),
    );
    await expect(
      canvas.getByRole("button", { name: /langfuse_getPrompt$/ }),
    ).toBeVisible();
    await expect(canvas.queryByText("langfuse_getSession")).toBeNull();
  },
});

export const NoSwitchWhenOneSideEmpty = meta.story({
  name: "(Test) No Switch When One Side Empty",
  beforeEach: () => {
    sessionStorage.setItem(TOOLS_COLLAPSED_KEY, "false");
  },
  args: NoneCalled.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("tab")).toBeNull();
    await expect(
      canvas.getByRole("button", { name: /langfuse_getSession$/ }),
    ).toBeVisible();
  },
});

export const RowTogglesDetails = meta.story({
  name: "(Test) Row Toggles Details",
  beforeEach: () => {
    sessionStorage.removeItem(TOOLS_COLLAPSED_KEY);
  },
  args: CalledTool.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = canvas.getByRole("button", { name: /^1\.\s*search_docs$/ });
    await expect(row).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByText(baseTools[0]!.description!)).toBeNull();
    await userEvent.click(row);
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByText(baseTools[0]!.description!)).toBeVisible();
    await userEvent.click(row);
    await expect(row).toHaveAttribute("aria-expanded", "false");
  },
});

const conversation = [
  { role: "system", name: "Instructions", content: "Be brief." },
  ...Array.from({ length: 5 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    name: `Turn ${index + 1}`,
    content: `Message content ${index + 1}`,
  })),
];
const longConversation = [
  ...conversation,
  { role: "assistant", name: "Turn 6", content: "Message content 6" },
  { role: "user", name: "Turn 7", content: "Message content 7" },
];

function conversationPreviewArgs(messages: unknown[]) {
  return {
    chatMLParserResult: {
      canDisplayAsChat: true,
      allMessages: messages.map((message) =>
        ChatMlMessageSchema.parse(message),
      ),
      additionalInput: undefined,
      allTools: [],
      toolCallCounts: new Map(),
      toolCallsByName: new Map(),
      messageToToolCallNumbers: new Map(),
      inputMessageCount: 0,
    } satisfies ChatMLParserResult,
  };
}

export const HeaderControlsOnFocus = meta.story({
  name: "(Test) Reveals Message Header Controls On Focus",
  args: conversationPreviewArgs([
    {
      role: "assistant",
      content: "Hover this message to reveal its header controls.",
    },
  ]),
  play: async ({ canvas }) => {
    const copyButton = canvas.getByRole("button", {
      name: "Copy to clipboard",
    });
    copyButton.focus();
    await expect(copyButton).toHaveFocus();
    await waitFor(() => expect(copyButton).toBeVisible());
  },
});

export const EarlierMessagesCollapsed = meta.story({
  name: "(Test) Earlier messages collapsed",
  args: conversationPreviewArgs(conversation),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: /other messages?/ }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Collapse Instructions" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Expand Turn 1" }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      canvas.queryByText("Message content 1"),
    ).not.toBeInTheDocument();
    for (const turn of [3, 5]) {
      await expect(
        canvas.getByRole("button", { name: `Collapse Turn ${turn}` }),
      ).toHaveAttribute("aria-expanded", "true");
      await expect(
        canvas
          .getAllByText(`Message content ${turn}`)
          .some((element) => element.checkVisibility()),
      ).toBe(true);
    }
  },
});

export const FoldedConversation = meta.story({
  name: "(Test) Folded conversation",
  args: conversationPreviewArgs(longConversation),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = canvas.getByRole("button", { name: "4 other messages" });
    await expect(row).toHaveAttribute("aria-expanded", "false");
    for (const turn of [1, 2, 3, 4]) {
      await expect(
        canvas.queryByRole("button", { name: `Expand Turn ${turn}` }),
      ).not.toBeInTheDocument();
    }
    for (const turn of [5, 6, 7]) {
      await expect(
        canvas
          .getAllByText(`Message content ${turn}`)
          .some((element) => element.checkVisibility()),
      ).toBe(true);
    }
    await userEvent.click(row);
    await expect(row).toHaveAttribute("aria-expanded", "true");
    for (const turn of [1, 2, 3, 4]) {
      await expect(
        canvas.getByRole("button", { name: `Expand Turn ${turn}` }),
      ).toHaveAttribute("aria-expanded", "false");
      await expect(
        canvas.queryByText(`Message content ${turn}`),
      ).not.toBeInTheDocument();
    }
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand Turn 1" }),
    );
    await expect(
      canvas
        .getAllByText("Message content 1")
        .some((element) => element.checkVisibility()),
    ).toBe(true);
    await userEvent.click(row);
    await expect(
      canvas.queryByText("Message content 1"),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Expand Turn 2" }),
    ).not.toBeInTheDocument();
  },
});

export const EmptyMessagesDoNotTakeTailSlots = meta.story({
  name: "(Test) Empty messages do not take tail slots",
  args: conversationPreviewArgs([
    ...longConversation.slice(0, 6),
    { role: "assistant" },
    ...longConversation.slice(6),
  ]),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "4 other messages" }),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("button", {
        name: /^(Expand|Collapse) (Instructions|Turn \d)$/,
      }),
    ).toHaveLength(4);
    for (const turn of [5, 6, 7]) {
      await expect(
        canvas
          .getAllByText(`Message content ${turn}`)
          .some((element) => element.checkVisibility()),
      ).toBe(true);
    }
  },
});

const MEDIA_REF = "@@@langfuseMedia:type=image/png|id=media-1|source=base64@@@";
const AUDIO_REF = "@@@langfuseMedia:type=audio/wav|id=audio-1|source=base64@@@";
const TEST_MARKDOWN_LIMIT = 1_000;
const imageUrl = "/favicon-32x32.png";
const conversationMedia: MediaReturnType[] = [
  {
    mediaId: "media-1",
    contentType: MediaContentType.PNG,
    contentLength: 68,
    url: imageUrl,
    urlExpiry: "2099-01-01T00:00:00Z",
    field: MediaEnabledFields.Input,
  },
  {
    mediaId: "audio-1",
    contentType: MediaContentType.WAV,
    contentLength: 44,
    url: "/storybook-audio.wav",
    urlExpiry: "2099-01-01T00:00:00Z",
    field: MediaEnabledFields.Output,
  },
];

const storyApi = createTRPCReact<AppRouter>();

function ConversationMediaProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    for (const media of [
      ...conversationMedia,
      { ...conversationMedia[0], mediaId: "media-2" },
    ]) {
      client.setQueryData(
        getQueryKey(
          api.media.getById,
          { mediaId: media.mediaId, projectId: "storybook-project" },
          "query",
        ),
        media,
      );
    }
    return client;
  });
  const [client] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        () => () =>
          observable((observer) => {
            observer.error(
              new TRPCClientError<AppRouter>(
                "Unexpected API request in conversation media story",
              ),
            );
          }),
      ],
    }),
  );
  return (
    <SessionProvider
      session={{
        expires: "2099-01-01T00:00:00Z",
        user: null,
        environment: {
          enableExperimentalFeatures: false,
          selfHostedInstancePlan: null,
        },
      }}
      refetchOnWindowFocus={false}
    >
      <storyApi.Provider client={client} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <MarkdownRenderCharacterLimitContext.Provider
            value={TEST_MARKDOWN_LIMIT}
          >
            {children}
          </MarkdownRenderCharacterLimitContext.Provider>
        </QueryClientProvider>
      </storyApi.Provider>
    </SessionProvider>
  );
}

export const InlineMediaNotDuplicated = meta.story({
  name: "(Test) Inline media not duplicated",
  decorators: [
    (Story) => (
      <ConversationMediaProviders>
        <Story />
      </ConversationMediaProviders>
    ),
  ],
  parameters: {
    nextjs: { router: { query: { projectId: "storybook-project" } } },
  },
  args: {
    ...conversationPreviewArgs([{ role: "user", content: MEDIA_REF }]),
    media: [conversationMedia[0]],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("img")).toBeVisible();
    await expect(canvas.getAllByRole("img")).toHaveLength(1);
    await expect(
      canvas.queryByRole("button", { name: "Collapse Media" }),
    ).not.toBeInTheDocument();
  },
});

export const JsonFallbackKeepsMedia = meta.story({
  name: "(Test) JSON fallback keeps media",
  decorators: [
    (Story) => (
      <ConversationMediaProviders>
        <Story />
      </ConversationMediaProviders>
    ),
  ],
  parameters: {
    nextjs: { router: { query: { projectId: "storybook-project" } } },
  },
  args: {
    ...conversationPreviewArgs([
      {
        role: "assistant",
        content: MEDIA_REF.repeat(
          Math.ceil((TEST_MARKDOWN_LIMIT + 1) / MEDIA_REF.length),
        ),
        audio: {
          data: AUDIO_REF,
        },
      },
    ]),
    media: conversationMedia,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const mediaHeader = canvas.getByRole("button", { name: "Collapse Media" });
    await expect(mediaHeader).toBeVisible();
    await expect(await canvas.findByRole("img")).toBeVisible();
    await expect(await canvas.findByText("storybook-audio.wav")).toBeVisible();
  },
});

export const Empty = meta.story({
  name: "(Test) Empty",
  args: { input: undefined, output: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getAllByText("undefined", { exact: true }),
    ).toHaveLength(2);
  },
});

const systemPrompt = Array.from(
  { length: 12 },
  (_, index) =>
    `system-prompt-line-${index + 1} lorem ipsum dolor sit amet consectetur adipiscing elit`,
).join("\n");

function messagePreviewArgs(
  message: unknown,
  {
    collapsedHistory = false,
    budgetExceeded = false,
    asOutput = false,
  }: {
    collapsedHistory?: boolean;
    budgetExceeded?: boolean;
    asOutput?: boolean;
  } = {},
) {
  // Parser projections can include paired tool results that the wire schema drops.
  const messages = [
    message,
    ...(collapsedHistory
      ? [1, 2, 3].map((index) =>
          ChatMlMessageSchema.parse({
            role: "user",
            name: `Recent ${index}`,
            content: `Recent content ${index}`,
          }),
        )
      : []),
  ] as ChatMLParserResult["allMessages"];
  return {
    hideOutput: !asOutput,
    hideIfNull: true,
    parsedInput: budgetExceeded ? "x".repeat(10_000) : undefined,
    chatMLParserResult: {
      canDisplayAsChat: true,
      allMessages: messages,
      additionalInput: undefined,
      allTools: [],
      toolCallCounts: new Map<string, number>(),
      toolCallsByName: new Map<string, ToolCallInvocation[]>(),
      messageToToolCallNumbers: new Map<number, number[]>(),
      inputMessageCount: asOutput ? 0 : messages.length,
    } satisfies ChatMLParserResult,
  };
}

export const ConversationOmitsToolDetails = meta.story({
  name: "(Test) Conversation mode retains content without tool details",
  args: {
    ...messagePreviewArgs({
      role: "assistant",
      content: "I will check that for you.",
      tool_calls: [
        { id: "call-1", name: "search_traces", arguments: '{"limit":10}' },
      ],
    }),
    contentMode: "conversation",
  },
  play: async ({ canvas }) => {
    await expect(
      canvas
        .getAllByText("I will check that for you.")
        .some((element) => element.checkVisibility()),
    ).toBe(true);
    await expect(canvas.queryByText("search_traces")).not.toBeInTheDocument();
  },
});

export const MessageHeaderToggles = meta.story({
  name: "(Test) Message header toggles its body without controls toggling it",
  args: messagePreviewArgs({ role: "user", content: "Where is my refund?" }),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Where is my refund?")[0]).toBeVisible();
    await userEvent.click(canvas.getAllByText("user")[0]);
    for (const body of canvas.queryAllByText("Where is my refund?"))
      await expect(body).not.toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Expand user" }));
    await expect(canvas.getAllByText("Where is my refund?")[0]).toBeVisible();
    const copy = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    try {
      await userEvent.click(
        canvas.getByRole("button", { name: "Copy to clipboard" }),
      );
      await expect(copy).toHaveBeenCalledWith("Where is my refund?");
      await expect(
        canvas.getByRole("button", { name: "Collapse user" }),
      ).toHaveAttribute("aria-expanded", "true");
      await expect(canvas.getAllByText("Where is my refund?")[0]).toBeVisible();
    } finally {
      copy.mockRestore();
    }
  },
});

const passthroughMessage = {
  role: "user",
  content: "Where is my refund?",
  json: { role: "user", content: "Where is my refund?", channel: "web" },
};

export const PassthroughAfterCollapsedHistory = meta.story({
  name: "(Test) Passthrough JSON preserves expanded history state",
  args: messagePreviewArgs(passthroughMessage, { collapsedHistory: true }),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Expand user" }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      canvas.queryByText("Where is my refund?"),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Expand user" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Show passthrough JSON data" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Collapse user" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(
      canvas
        .getAllByText("channel")
        .some((element) => element.checkVisibility()),
    ).toBe(true);
  },
});

export const PassthroughAfterJsonHistory = meta.story({
  name: "(Test) Passthrough JSON stays visible when the markdown budget is exceeded",
  args: messagePreviewArgs(passthroughMessage, {
    collapsedHistory: true,
    budgetExceeded: true,
  }),
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByText("Where is my refund?"),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Expand user" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Show passthrough JSON data" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Collapse user" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(
      canvas
        .getAllByText("channel")
        .some((element) => element.checkVisibility()),
    ).toBe(true);
  },
});

export const RolelessOutputControls = meta.story({
  name: "(Test) Role-less output retains thinking, tools, and correction controls",
  args: {
    ...messagePreviewArgs(
      {
        content: "Checking that for you.",
        thinking: [{ content: "Need the trace first." }],
        tool_calls: [{ id: "call-1", name: "search_traces", arguments: "{}" }],
      },
      { asOutput: true },
    ),
    // Only the disabled header action is mounted; no correction editor or API is used.
    showCorrections: true,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Collapse Output" }),
    ).toBeVisible();
    await expect(canvas.getAllByText(/search_traces/)[0]).toBeVisible();
    await expect(canvas.getAllByText("Need the trace first.")[0]).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Correct output" }),
    ).toBeDisabled();
  },
});

function MarkdownBudgetSwitcher({ children }: { children: ReactNode }) {
  const [overBudget, setOverBudget] = useState(false);
  return (
    <MarkdownRenderCharacterLimitContext.Provider
      value={overBudget ? 1 : 5_000}
    >
      <button onClick={() => setOverBudget((value) => !value)}>
        Toggle markdown budget
      </button>
      {children}
    </MarkdownRenderCharacterLimitContext.Provider>
  );
}

export const TableExpansionSurvivesViewSwitch = meta.story({
  name: "(Test) Table expansion survives switching between mounted view paths",
  decorators: [
    (Story) => (
      <MarkdownBudgetSwitcher>
        <Story />
      </MarkdownBudgetSwitcher>
    ),
  ],
  args: messagePreviewArgs({
    role: "user",
    content: { details: { status: "pending" } },
  }),
  play: async ({ canvas }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Expand all rows" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Collapse all rows" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("pending")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Toggle markdown budget" }),
    );
    await expect(
      await canvas.findByRole("button", { name: "Expand all rows" }),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Toggle markdown budget" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Collapse all rows" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("pending")).toBeVisible();
  },
});

export const NestedToolResponses = meta.story({
  name: "(Test) Nested paired tool responses collapse independently",
  args: messagePreviewArgs({
    role: "assistant",
    tool_calls: [
      {
        id: "search-1",
        name: "search",
        arguments: "{}",
        response: {
          output: "Search body",
          message: {
            role: "tool",
            name: "Search result",
            content: "Search body",
            tool_calls: [
              {
                id: "lookup-1",
                name: "lookup",
                arguments: "{}",
                response: {
                  output: "Leaf result",
                  message: {
                    role: "tool",
                    name: "Lookup result",
                    content: "Leaf result",
                  },
                },
              },
            ],
          },
        },
      },
    ],
  }),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Leaf result")[0]).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse Search result" }),
    );
    await expect(canvas.queryByText("Leaf result")).not.toBeInTheDocument();
    await expect(canvas.getByText("search")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand Search result" }),
    );
    await expect(canvas.getAllByText("Leaf result")[0]).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse Lookup result" }),
    );
    for (const body of canvas.queryAllByText("Leaf result"))
      await expect(body).not.toBeVisible();
    await expect(canvas.getAllByText("Search body")[0]).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand Lookup result" }),
    );
    await expect(canvas.getAllByText("Leaf result")[0]).toBeVisible();
  },
});

export const NamedSystemPrompt = meta.story({
  name: "(Test) Named system prompts collapse by raw role",
  args: messagePreviewArgs({
    role: "system",
    name: "planner-instructions",
    content: systemPrompt,
  }),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Expand planner-instructions" }),
    ).toBeVisible();
  },
});

function RemountablePreview(props: ComponentProps<typeof IOPreviewPretty>) {
  const [mount, setMount] = useState(0);
  return (
    <>
      <button onClick={() => setMount((value) => value + 1)}>
        Remount preview
      </button>
      <IOPreviewPretty key={mount} {...props} />
    </>
  );
}

export const JsonSystemPrompt = meta.story({
  name: "(Test) JSON system-prompt expansion persists after remounting",
  render: (args) => <RemountablePreview {...args} />,
  args: messagePreviewArgs(
    { role: "system", content: systemPrompt },
    { budgetExceeded: true },
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getAllByRole("button", { name: "Expand system" }),
    ).toHaveLength(1);
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand system" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Collapse system" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Remount preview" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Collapse system" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse system" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Expand system" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Remount preview" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Expand system" }),
    ).toBeVisible();
  },
});

export const PersistedSystemPrompt = meta.story({
  name: "(Test) Persisted expanded system-prompt preference is respected",
  render: (args) => <RemountablePreview {...args} />,
  beforeEach: () => {
    localStorage.setItem("collapseSystemPrompt", "false");
  },
  args: messagePreviewArgs({ role: "system", content: systemPrompt }),
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("button", { name: "Expand system" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse system" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Expand system" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Remount preview" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Expand system" }),
    ).toBeVisible();
  },
});

export const LegacySystemPromptPreference = meta.story({
  name: "(Test) Legacy expanded system-prompt preference is migrated",
  render: (args) => <RemountablePreview {...args} />,
  beforeEach: () => {
    localStorage.setItem("traceSystemPrompt:collapsed", "false");
  },
  args: messagePreviewArgs({ role: "system", content: systemPrompt }),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Collapse system" }),
    ).toBeVisible();
    localStorage.removeItem("traceSystemPrompt:collapsed");
    await userEvent.click(
      canvas.getByRole("button", { name: "Remount preview" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Collapse system" }),
    ).toBeVisible();
  },
});

export const SystemPromptContentParts = meta.story({
  name: "(Test) Text content parts participate in system-prompt collapse",
  args: messagePreviewArgs({
    role: "system",
    content: [{ type: "text", text: systemPrompt }],
  }),
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand system" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Collapse system" }),
    ).toBeVisible();
    await expect(
      canvas
        .getAllByText(/system-prompt-line-1 /)
        .some((element) => element.checkVisibility()),
    ).toBe(true);
  },
});

export const ReadableSystemPrompt = meta.story({
  name: "(Test) A readable system prompt stays open above the character threshold",
  args: messagePreviewArgs({
    role: "system",
    content: Array.from(
      { length: 3 },
      (_, index) => `line-${index + 1} ${"x".repeat(90)}`,
    ).join("\n"),
  }),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Collapse system" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Expand system" }),
    ).not.toBeInTheDocument();
  },
});

export const LongUserMessage = meta.story({
  name: "(Test) Long non-system messages do not auto-collapse",
  args: messagePreviewArgs({ role: "user", content: systemPrompt }),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Collapse user" }),
    ).toBeVisible();
    await expect(
      canvas
        .getAllByText(/system-prompt-line-1 /)
        .some((element) => element.checkVisibility()),
    ).toBe(true);
  },
});

export const SystemPromptWithoutStorage = meta.story({
  name: "(Test) System-prompt toggle works with blocked localStorage",
  render: function StorageUnavailablePreview(args) {
    const [, setCollapsed] = useCollapseSystemPromptPreference();
    return (
      <>
        <button onClick={() => setCollapsed(true)}>
          Reset prompt preference
        </button>
        <IOPreviewPretty {...args} />
      </>
    );
  },
  beforeEach: () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    const denyStorageAccess = () => {
      throw new Error("Storage blocked");
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        length: 0,
        clear: denyStorageAccess,
        getItem: denyStorageAccess,
        key: () => null,
        removeItem: denyStorageAccess,
        setItem: denyStorageAccess,
      } satisfies Storage,
    });
    return () => {
      if (descriptor) Object.defineProperty(window, "localStorage", descriptor);
      else Reflect.deleteProperty(window, "localStorage");
    };
  },
  args: messagePreviewArgs({ role: "system", content: systemPrompt }),
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Reset prompt preference" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand system" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Collapse system" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse system" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Expand system" }),
    ).toBeVisible();
  },
});

export const UnicodeToolCopy = meta.story({
  name: "(Test) Tool-only copy decodes Unicode escapes",
  args: messagePreviewArgs({
    role: "assistant",
    tool_calls: [
      {
        id: "call-1",
        name: "search_traces",
        arguments: '{"question":"\\u3053\\u3093\\u306b\\u3061\\u306f"}',
      },
    ],
  }),
  play: async ({ canvas }) => {
    const copy = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    try {
      await userEvent.click(
        canvas.getByRole("button", { name: "Copy to clipboard" }),
      );
      await expect(copy).toHaveBeenCalled();
      await expect(copy.mock.calls[0]?.[0]).toContain("こんにちは");
      await expect(copy.mock.calls[0]?.[0]).not.toContain("\\u3053");
    } finally {
      copy.mockRestore();
    }
  },
});

export const EmptyParsedMessage = meta.story({
  name: "(Test) Materialized empty messages have no header",
  args: messagePreviewArgs(ChatMlMessageSchema.parse({})),
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("button", { name: /^(Expand|Collapse) / }),
    ).not.toBeInTheDocument();
  },
});

export const FallbackOmitsUnsetFields = meta.story({
  name: "(Test) Whole-message fallback omits unset ChatML fields",
  args: messagePreviewArgs(
    ChatMlMessageSchema.parse({ role: "user", name: "Agent", content: "" }),
  ),
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("undefined")).not.toBeInTheDocument();
    await expect(canvas.queryByText("tool_call_id")).not.toBeInTheDocument();
  },
});

export const ImageContentPart = meta.story({
  name: "(Test) OpenAI image parts retain their media reference",
  decorators: [
    (Story) => (
      <ConversationMediaProviders>
        <Story />
      </ConversationMediaProviders>
    ),
  ],
  parameters: {
    nextjs: { router: { query: { projectId: "storybook-project" } } },
  },
  args: messagePreviewArgs({
    role: "user",
    content: [
      { type: "text", text: "here is the thermostat" },
      { type: "image_url", image_url: { url: MEDIA_REF } },
    ],
  }),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("here is the thermostat")).toBeVisible();
    await expect(await canvas.findByRole("img")).toHaveProperty(
      "src",
      new URL(imageUrl, window.location.href).href,
    );
  },
});

export const FileContentPart = meta.story({
  name: "(Test) AI SDK file parts retain their media reference",
  decorators: [
    (Story) => (
      <ConversationMediaProviders>
        <Story />
      </ConversationMediaProviders>
    ),
  ],
  parameters: {
    nextjs: { router: { query: { projectId: "storybook-project" } } },
  },
  args: messagePreviewArgs({
    role: "user",
    content: [
      { type: "text", text: "attached report" },
      { type: "file", data: MEDIA_REF, mediaType: "image/png" },
    ],
  }),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("attached report")).toBeVisible();
    await expect(await canvas.findByRole("img")).toHaveProperty(
      "src",
      new URL(imageUrl, window.location.href).href,
    );
  },
});

export const BareMediaArray = meta.story({
  name: "(Test) Arrays of bare media references render inline",
  decorators: [
    (Story) => (
      <ConversationMediaProviders>
        <Story />
      </ConversationMediaProviders>
    ),
  ],
  parameters: {
    nextjs: { router: { query: { projectId: "storybook-project" } } },
  },
  args: messagePreviewArgs({
    role: "user",
    content: [MEDIA_REF, MEDIA_REF.replace("media-1", "media-2")],
  }),
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getAllByRole("img")).toHaveLength(2));
    for (const image of canvas.getAllByRole("img"))
      await expect(image).toHaveProperty(
        "src",
        new URL(imageUrl, window.location.href).href,
      );
  },
});

export const ShortSystemPromptWithMedia = meta.story({
  name: "(Test) Media payloads do not make a short system prompt collapse",
  decorators: [
    (Story) => (
      <ConversationMediaProviders>
        <Story />
      </ConversationMediaProviders>
    ),
  ],
  parameters: {
    nextjs: { router: { query: { projectId: "storybook-project" } } },
  },
  args: messagePreviewArgs({
    role: "system",
    content: [
      { type: "text", text: "Short system prompt." },
      ...Array.from({ length: 4 }, () => ({
        type: "image_url",
        image_url: { url: MEDIA_REF },
      })),
    ],
  }),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Collapse system" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Expand system" }),
    ).not.toBeInTheDocument();
  },
});

export const CollapsedSystemPromptMedia = meta.story({
  name: "(Test) System-prompt attachments mount only after expansion",
  decorators: [
    (Story) => (
      <ConversationMediaProviders>
        <MarkdownRenderCharacterLimitContext.Provider value={5_000}>
          <Story />
        </MarkdownRenderCharacterLimitContext.Provider>
      </ConversationMediaProviders>
    ),
  ],
  parameters: {
    nextjs: { router: { query: { projectId: "storybook-project" } } },
  },
  args: messagePreviewArgs({
    role: "system",
    content: [
      { type: "text", text: systemPrompt },
      { type: "image_url", image_url: { url: MEDIA_REF } },
    ],
  }),
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("img", { hidden: true }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand system" }),
    );
    await expect(await canvas.findByRole("img")).toHaveProperty(
      "src",
      new URL(imageUrl, window.location.href).href,
    );
  },
});
