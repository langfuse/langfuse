import preview from "../../../../../.storybook/preview";
import { expect, userEvent, within } from "storybook/test";
import { IOPreviewPretty } from "./IOPreviewPretty";
import type { ToolDefinition } from "./components/ToolCallDefinitionCard";
import type {
  ChatMLParserResult,
  ToolCallInvocation,
} from "../../hooks/useChatMLParser";
import { useState, type ReactNode } from "react";
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

const meta = preview.meta({
  component: IOPreviewPretty,
  beforeEach: () => {
    const previousCollapsed = sessionStorage.getItem(TOOLS_COLLAPSED_KEY);
    sessionStorage.removeItem(TOOLS_COLLAPSED_KEY);
    return () => {
      if (previousCollapsed === null) {
        sessionStorage.removeItem(TOOLS_COLLAPSED_KEY);
      } else {
        sessionStorage.setItem(TOOLS_COLLAPSED_KEY, previousCollapsed);
      }
    };
  },
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

export const LongSystemPrompt = meta.story({
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
const TOOLS_COLLAPSED_KEY = "toolsSectionCollapsed";

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
  name: "(Test) Not Called Tab",
  beforeEach: () => {
    sessionStorage.setItem(TOOLS_COLLAPSED_KEY, "false");
  },
  args: ManyTools.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("tab", { name: /^Called\s*6$/ }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      canvas.getByRole("button", {
        name: /^1\.\s*langfuse_searchLangfuseDocs$/,
      }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("tab", { name: /^Not called\s*12$/ }),
    );
    await expect(
      canvas.getByRole("button", { name: /^1\.\s*langfuse_getPrompt$/ }),
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
      canvas.getByRole("button", { name: /^18\.\s*langfuse_getSession$/ }),
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
    await expect(canvas.queryByText("Description")).toBeNull();
    await userEvent.click(row);
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByText("Description")).toBeVisible();
    await userEvent.click(row);
    await expect(row).toHaveAttribute("aria-expanded", "false");
  },
});

export const CollapsedByDefault = meta.story({
  name: "(Test) Collapsed By Default",
  beforeEach: () => {
    sessionStorage.removeItem(TOOLS_COLLAPSED_KEY);
  },
  args: ManyTools.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const header = canvas.getByRole("button", { name: "Expand Tools" });
    await expect(header).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByRole("tab")).toBeNull();
    await userEvent.click(header);
    await expect(header).toHaveAttribute("aria-expanded", "true");
    await expect(
      canvas.getByRole("tab", { name: /^Called\s*6$/ }),
    ).toBeVisible();
    await expect(sessionStorage.getItem(TOOLS_COLLAPSED_KEY)).toBe("false");
    sessionStorage.removeItem(TOOLS_COLLAPSED_KEY);
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

export const EarlierMessagesCollapsed = meta.story({
  name: "(Test) Earlier messages collapsed",
  args: conversationPreviewArgs(conversation),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Collapse Instructions" }),
    ).toBeVisible();
    for (const turn of [1, 2]) {
      await expect(
        canvas.getByRole("button", { name: `Expand Turn ${turn}` }),
      ).toHaveAttribute("aria-expanded", "false");
      await expect(
        canvas.queryByText(`Message content ${turn}`),
      ).not.toBeInTheDocument();
    }
    for (const turn of [3, 4, 5]) {
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

export const ShortHistoryNotFolded = meta.story({
  name: "(Test) Short history not folded",
  args: conversationPreviewArgs(conversation),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: /other messages?/ }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getAllByRole("button", {
        name: /^(Expand|Collapse) (Instructions|Turn \d)$/,
      }),
    ).toHaveLength(6);
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
const imageUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
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
    for (const media of conversationMedia) {
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
    <storyApi.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <MarkdownRenderCharacterLimitContext.Provider
          value={TEST_MARKDOWN_LIMIT}
        >
          {children}
        </MarkdownRenderCharacterLimitContext.Provider>
      </QueryClientProvider>
    </storyApi.Provider>
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
    const mediaSection = within(mediaHeader.parentElement!.parentElement!);
    await expect(await mediaSection.findByRole("img")).toBeVisible();
    await expect(
      await mediaSection.findByText("storybook-audio.wav"),
    ).toBeVisible();
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
