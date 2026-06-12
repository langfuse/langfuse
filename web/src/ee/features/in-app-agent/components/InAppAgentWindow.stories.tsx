import preview from "../../../../../.storybook/preview";
import { useEffect, useRef, useState } from "react";
import { fn } from "storybook/test";
import {
  InAppAgentWindow,
  type InAppAgentWindowMessage,
  type InAppAgentWindowProps,
} from "./InAppAgentWindow";

function StatefulInAppAgentWindow(args: InAppAgentWindowProps) {
  const [isExpanded, setIsExpanded] = useState(args.isExpanded);

  return (
    <InAppAgentWindow
      {...args}
      isExpanded={isExpanded}
      onExpandedChange={(isExpanded) => {
        setIsExpanded(isExpanded);
        args.onExpandedChange(isExpanded);
      }}
    />
  );
}

const streamingSeedMessages: InAppAgentWindowMessage[] = [
  {
    id: "seed-user-1",
    role: "user",
    content: {
      type: "text",
      text: "Find the cause of latency spikes in production traces.",
    },
  },
  {
    id: "seed-assistant-1",
    role: "assistant",
    content: {
      type: "text",
      text: "I will inspect recent traces, query latency metrics, and compare the slowest observations against scores and model usage.",
    },
  },
  {
    id: "seed-tool-1",
    role: "assistant",
    content: {
      type: "toolGroup",
      tools: [
        {
          type: "tool",
          name: "langfuse_queryMetrics",
          args: JSON.stringify({
            view: "observations",
            metrics: [{ measure: "latency", aggregation: "p95" }],
            fromTimestamp: "2026-06-10T08:00:00Z",
            toTimestamp: "2026-06-10T09:00:00Z",
          }),
          result: JSON.stringify({ data: [{ p95_latency: 4.82 }] }),
        },
      ],
    },
  },
  ...(Array.from({ length: 8 }, (_, index) => ({
    id: `seed-follow-up-${index}`,
    role: index % 3 === 0 ? "user" : "assistant",
    content: {
      type: "text",
      text:
        index % 3 === 0
          ? `Can you narrow this down for service group ${index + 1}?`
          : [
              `Service group ${index + 1} has enough previous context to make this story scrollable before live streaming starts.`,
              "Scroll up while the assistant response streams to verify auto-follow detaches.",
              "Scroll back near the bottom to attach again.",
            ].join("\n"),
    },
  })) satisfies InAppAgentWindowMessage[]),
];

const streamingInvestigations = [
  {
    prompt: "Check whether the spike is isolated to retrieval.",
    intro:
      "I am checking retrieval-heavy traces first because their p95 latency moved before generation latency changed.",
    toolName: "langfuse_getTraces",
    toolArgs: {
      limit: 5,
      orderBy: "latency.desc",
      filter: "name contains retrieval",
    },
    toolResult: {
      data: [
        { traceId: "trace-ret-104", latencyMs: 5820 },
        { traceId: "trace-ret-219", latencyMs: 5410 },
      ],
    },
    conclusion:
      "The slowest traces are retrieval-heavy. The expensive step is document reranking, not the initial vector search.",
  },
  {
    prompt: "Compare the same window against quality scores.",
    intro:
      "Next I am joining the slow traces with score distributions so we can see whether the latency spike also changed output quality.",
    toolName: "langfuse_queryMetrics",
    toolArgs: {
      view: "scores",
      dimensions: ["scoreName"],
      metrics: [{ measure: "value", aggregation: "avg" }],
    },
    toolResult: {
      data: [
        { scoreName: "helpfulness", avg_value: 0.72 },
        { scoreName: "groundedness", avg_value: 0.68 },
      ],
    },
    conclusion:
      "Quality moved down in the same segment. The groundedness score dropped most, which fits a retrieval or reranking regression.",
  },
  {
    prompt: "Inspect model usage for the outlier traces.",
    intro:
      "I am checking model and token usage because a fallback model or larger context window can make otherwise healthy traces slow.",
    toolName: "langfuse_getObservations",
    toolArgs: {
      traceIds: ["trace-ret-104", "trace-ret-219"],
      columns: ["providedModelName", "totalTokens", "latency"],
    },
    toolResult: {
      data: [
        { providedModelName: "gpt-4.1", totalTokens: 18420, latencyMs: 3820 },
        { providedModelName: "gpt-4.1", totalTokens: 17610, latencyMs: 3610 },
      ],
    },
    conclusion:
      "Model choice is stable, but token counts are much higher than the baseline. The reranker is likely passing too many documents forward.",
  },
];

function appendToken(currentText: string, nextText: string) {
  if (currentText.length >= nextText.length) {
    return currentText;
  }

  const nextSpaceIndex = nextText.indexOf(" ", currentText.length + 1);

  return nextText.slice(
    0,
    nextSpaceIndex === -1 ? nextText.length : nextSpaceIndex,
  );
}

function StreamingInAppAgentWindow(args: InAppAgentWindowProps) {
  const [isExpanded, setIsExpanded] = useState(args.isExpanded);
  const [messages, setMessages] = useState<InAppAgentWindowMessage[]>(
    streamingSeedMessages,
  );
  const streamRef = useRef({
    cycle: 0,
    phase: "start" as
      | "start"
      | "intro"
      | "tool-loading"
      | "tool-done"
      | "conclusion",
    phaseTicks: 0,
    introMessageId: "",
    toolMessageId: "",
    conclusionMessageId: "",
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const stream = streamRef.current;
      const investigation =
        streamingInvestigations[stream.cycle % streamingInvestigations.length];

      if (stream.phase === "start") {
        const cycleId = `stream-${stream.cycle}`;
        stream.introMessageId = `${cycleId}-intro`;
        stream.toolMessageId = `${cycleId}-tool`;
        stream.conclusionMessageId = `${cycleId}-conclusion`;
        stream.phase = "intro";
        stream.phaseTicks = 0;

        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: `${cycleId}-user`,
            role: "user",
            content: { type: "text", text: investigation.prompt },
          },
          {
            id: stream.introMessageId,
            role: "assistant",
            content: { type: "text", text: "" },
          },
        ]);

        return;
      }

      if (stream.phase === "intro") {
        setMessages((currentMessages) =>
          currentMessages.map((message) => {
            if (
              message.id !== stream.introMessageId ||
              message.content.type !== "text"
            ) {
              return message;
            }

            const text = appendToken(message.content.text, investigation.intro);

            if (text === investigation.intro) {
              stream.phase = "tool-loading";
              stream.phaseTicks = 0;
            }

            return { ...message, content: { type: "text", text } };
          }),
        );

        return;
      }

      if (stream.phase === "tool-loading") {
        stream.phase = "tool-done";
        stream.phaseTicks = 0;

        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: stream.toolMessageId,
            role: "assistant",
            content: {
              type: "toolGroup",
              isLoading: true,
              tools: [
                {
                  type: "tool",
                  name: investigation.toolName,
                  args: JSON.stringify(investigation.toolArgs, null, 2),
                },
              ],
            },
          },
        ]);

        return;
      }

      if (stream.phase === "tool-done") {
        stream.phaseTicks += 1;

        if (stream.phaseTicks < 5) {
          return;
        }

        stream.phase = "conclusion";
        stream.phaseTicks = 0;

        setMessages((currentMessages) => [
          ...currentMessages.map((message) => {
            if (
              message.id !== stream.toolMessageId ||
              message.content.type !== "toolGroup"
            ) {
              return message;
            }

            return {
              ...message,
              content: {
                type: "toolGroup" as const,
                tools: [
                  {
                    type: "tool" as const,
                    name: investigation.toolName,
                    args: JSON.stringify(investigation.toolArgs, null, 2),
                    result: JSON.stringify(investigation.toolResult, null, 2),
                  },
                ],
              },
            };
          }),
          {
            id: stream.conclusionMessageId,
            role: "assistant",
            content: { type: "text", text: "" },
          },
        ]);

        return;
      }

      setMessages((currentMessages) =>
        currentMessages.map((message) => {
          if (
            message.id !== stream.conclusionMessageId ||
            message.content.type !== "text"
          ) {
            return message;
          }

          const text = appendToken(
            message.content.text,
            investigation.conclusion,
          );

          if (text === investigation.conclusion) {
            stream.cycle += 1;
            stream.phase = "start";
            stream.phaseTicks = 0;
          }

          return { ...message, content: { type: "text", text } };
        }),
      );
    }, 140);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <InAppAgentWindow
      {...args}
      isExpanded={isExpanded}
      messages={messages}
      onExpandedChange={(isExpanded) => {
        setIsExpanded(isExpanded);
        args.onExpandedChange(isExpanded);
      }}
      onSubmit={(input) => {
        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: `manual-${currentMessages.length}`,
            role: "user",
            content: { type: "text", text: input },
          },
        ]);

        args.onSubmit(input);
        return true;
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

const longUnbrokenWord = `trace-${"0123456789abcdef".repeat(18)}`;
const longUnbrokenTableValue = `observation-${"abcdefghijklmnopqrstuvwxyz".repeat(10)}`;

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
        id: "assistant-redirect-1",
        role: "assistant",
        content: {
          type: "redirectAction",
          label: "Open slow traces",
          href: "/project/project-1/traces?dateRange=1d&orderBy=column-latency_order-DESC",
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
      {
        id: "user-long-word",
        role: "user",
        content: {
          type: "text",
          text: `This normal message includes a very long unbroken word to check wrapping: ${longUnbrokenWord}`,
        },
      },
      {
        id: "assistant-long-word",
        role: "assistant",
        content: {
          type: "text",
          text: `This normal message includes a very long unbroken word to check wrapping: ${longUnbrokenWord}`,
        },
      },
      {
        id: "assistant-long-table",
        role: "assistant",
        content: {
          type: "text",
          text: [
            "Some trace attributes can contain very long values without spaces:",
            "",
            "| Field | Value | Notes |",
            "| --- | --- | --- |",
            `| Trace ID | ${longUnbrokenWord} | Generated by a customer system without delimiters |`,
            `| Observation ID | ${longUnbrokenTableValue} | Long table cell value without spaces |`,
            `| Metadata key | custom-${longUnbrokenTableValue} | Another long unbroken token in a different column |`,
          ].join("\n"),
        },
      },
    ],
  },
});

export const Streaming = meta.story({
  args: {
    selectedConversationId: "conversation-1",
    messages: streamingSeedMessages,
  },
  render: StreamingInAppAgentWindow,
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
