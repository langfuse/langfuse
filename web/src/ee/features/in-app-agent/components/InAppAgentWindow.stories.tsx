import preview from "../../../../../.storybook/preview";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";
import {
  InAppAgentWindow,
  type InAppAgentWindowProps,
} from "./InAppAgentWindow";

function StatefulInAppAgentWindow(args: InAppAgentWindowProps) {
  const [, updateArgs] = useArgs<InAppAgentWindowProps>();

  return (
    <InAppAgentWindow
      {...args}
      onExpandedChange={(isExpanded) => {
        updateArgs({ isExpanded });
        args.onExpandedChange(isExpanded);
      }}
    />
  );
}

const conversations = [
  {
    id: "conversation-1",
    title: "Latency outliers",
    updatedAt: new Date("2026-05-19T10:00:00.000Z"),
  },
  {
    id: "conversation-2",
    title: "Score correlation",
    updatedAt: new Date("2026-05-19T09:00:00.000Z"),
  },
];

const meta = preview.meta({
  component: InAppAgentWindow,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="flex h-screen w-full items-center justify-center">
        <Story />
      </div>
    ),
  ],
  args: {
    error: null,
    isExpanded: false,
    isInputDisabled: false,
    conversations,
    hasMoreConversations: false,
    isLoadingMoreConversations: false,
    selectedConversationId: undefined,
    onLoadMoreConversations: fn(),
    onNewConversation: fn(),
    onSelectConversation: fn(),
    onClose: fn(),
    onExpandedChange: fn(),
    onSubmit: fn(),
    onSubmitFeedback: fn(),
    showCloseButton: true,
  },
  render: StatefulInAppAgentWindow,
});

export const Empty = meta.story({
  args: {
    messages: [],
  },
});

export const Conversation = meta.story({
  args: {
    selectedConversationId: "conversation-1",
    messages: [
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Which traces had the highest latency today?",
        },
      },
      {
        id: "assistant-tool-1",
        role: "assistant",
        content: {
          type: "toolGroup",
          tools: [
            {
              type: "tool",
              name: "langfuse_queryMetrics",
              args: JSON.stringify({
                view: "observations",
                dimensions: [],
                metrics: [{ measure: "count", aggregation: "count" }],
                filters: [],
                fromTimestamp: "2025-06-30T00:00:00Z",
                toTimestamp: "2025-07-06T23:59:59Z",
              }),
              result: JSON.stringify({ data: [{ count_count: 0 }] }),
            },
            {
              type: "tool",
              name: "langfuse_getTraces",
              args: JSON.stringify({ limit: 10 }),
              result: JSON.stringify({ data: [] }),
            },
          ],
        },
      },
      {
        id: "assistant-text-1",
        role: "assistant",
        content: {
          type: "text",
          text: "Start by filtering traces by timestamp, then sort by latency. Open the slowest traces to inspect long-running observations.",
        },
      },
      {
        id: "user-2",
        role: "user",
        content: {
          type: "text",
          text: "Can I compare that with scores?",
        },
      },
      {
        id: "assistant-2",
        role: "assistant",
        content: {
          type: "text",
          text: "Yes. Add score filters or group the traces by score name to see whether latency correlates with lower quality.",
        },
      },
      {
        id: "assistant-3",
        role: "assistant",
        content: {
          type: "text",
          text: [
            "# Heading 1",
            "## Heading 2",
            "### Heading 3",
            "#### Heading 4",
            "##### Heading 5",
            "###### Heading 6",
            "",
            "You can use **Langfuse** to inspect _production traces_ and compare `input`, `output`, and metadata across releases.",
            "",
            "- Inspect traces with nested observations",
            "- Evaluate outputs with scores",
            "- Monitor production quality over time",
            "",
            "1. Filter for `level = ERROR`.",
            "2. Open the slowest trace.",
            "3. Compare model settings and prompt versions.",
            "",
            "> Tip: add scores and metadata early so regressions are easier to segment later.",
            "",
            "| Signal | Where to look |",
            "| --- | --- |",
            "| Latency | Observation timings |",
            "| Cost | Usage and model pricing |",
            "| Quality | Scores and comments |",
            "",
            "```ts",
            "const trace = {",
            '  name: "checkout-agent",',
            '  environment: "production",',
            '  metadata: { region: "eu" },',
            "};",
            "```",
            "",
            "Streaming partial markdown:",
            "",
            "- The assistant can render a list item while it is still streaming",
            "- It can also keep an unfinished **bold phrase",
            "",
            "```json",
            "{",
            '  "status": "streaming",',
            '  "next": "content still arriving"',
          ].join("\n"),
        },
      },
    ],
  },
});

export const LoadingResponse = meta.story({
  args: {
    messages: [
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Summarize recent ingestion errors.",
        },
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: {
          type: "loading",
        },
      },
    ],
  },
});

export const LoadingAfterToolCall = meta.story({
  args: {
    isInputDisabled: true,
    messages: [
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "How many OpenAI tokens were used last week?",
        },
      },
      {
        id: "assistant-tool-1",
        role: "assistant",
        content: {
          type: "toolGroup",
          tools: [
            {
              type: "tool",
              name: "langfuse_queryMetrics",
              args: JSON.stringify({
                view: "observations",
                metrics: [{ measure: "totalTokens", aggregation: "sum" }],
                filters: [
                  {
                    column: "providedModelName",
                    operator: "contains",
                    value: "gpt",
                    type: "string",
                  },
                ],
              }),
              result: JSON.stringify({
                data: [{ sum_totalTokens: 6848204 }],
              }),
            },
          ],
        },
      },
      {
        id: "assistant-text-1",
        role: "assistant",
        content: {
          type: "text",
          text: "Let me check what model names are available to better identify OpenAI models.",
        },
      },
      {
        id: "assistant-tool-2",
        role: "assistant",
        content: {
          type: "toolGroup",
          isLoading: true,
          tools: [
            {
              type: "tool",
              name: "langfuse_getObservationFilterValues",
              args: JSON.stringify({
                column: "providedModelName",
                limit: 50,
                fromStartTime: "2026-06-01T00:00:00Z",
                toStartTime: "2026-06-08T00:00:00Z",
              }),
              result: JSON.stringify({
                type: "VALUES",
                column: "providedModelName",
                values: [
                  {
                    value: "gpt-4",
                    count: 41700,
                  },
                ],
              }),
            },
          ],
        },
      },
    ],
  },
});

export const Connecting = meta.story({
  args: {
    isInputDisabled: true,
    messages: [
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Summarize recent ingestion errors.",
        },
      },
      {
        id: "connecting",
        role: "assistant",
        content: {
          type: "loading",
          label: "Connecting...",
        },
      },
    ],
  },
});

export const Error = meta.story({
  args: {
    error: "Assistant is not enabled for this user",
    messages: [
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Help me inspect this trace.",
        },
      },
    ],
  },
});
