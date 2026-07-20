import preview from "../../../../../.storybook/preview";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import {
  InAppAgentWindow,
  type InAppAgentWindowMessage,
  type InAppAgentWindowProps,
} from "./InAppAgentWindow";
import { getInAppAgentQuickActionContext } from "@/src/ee/features/in-app-agent/quickActions";
import {
  InAppAgentWindowShell,
  useInAppAgentWindowShellPanelControl,
} from "./InAppAgentWindowShell";

function InAppAgentWindowStoryShell({
  children,
  isExpanded,
}: {
  children: (props: { isHeaderDragHandleEnabled: boolean }) => ReactNode;
  isExpanded: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const floatingPanelHandle = useInAppAgentWindowShellPanelControl({});

  useEffect(() => {
    floatingPanelHandle.initializeGeometry();
  }, [floatingPanelHandle]);

  return (
    <InAppAgentWindowShell
      floatingPanelHandle={floatingPanelHandle}
      isExpanded={isExpanded}
      panelRef={panelRef}
    >
      {children}
    </InAppAgentWindowShell>
  );
}

function StatefulInAppAgentWindow(args: InAppAgentWindowProps) {
  const [isExpanded, setIsExpanded] = useState(args.isExpanded);

  return (
    <InAppAgentWindowStoryShell isExpanded={isExpanded}>
      {({ isHeaderDragHandleEnabled }) => (
        <InAppAgentWindow
          {...args}
          isHeaderDragHandleEnabled={isHeaderDragHandleEnabled}
          isExpanded={isExpanded}
          onExpandedChange={(isExpanded) => {
            setIsExpanded(isExpanded);
            args.onExpandedChange(isExpanded);
          }}
        />
      )}
    </InAppAgentWindowStoryShell>
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
          status: "succeeded",
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
    reasoning: [
      "The user suspects retrieval, so I should isolate retrieval-heavy traces before looking anywhere else.",
      "Sorting by latency and filtering on the trace name keeps the query small and read-only.",
      "If the slowest traces are all retrieval traces, the next step is comparing them against quality scores.",
    ].join("\n"),
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
    subsequentTools: [
      {
        name: "langfuse_getObservations",
        args: {
          traceIds: ["trace-ret-104", "trace-ret-219"],
          columns: ["name", "latency"],
        },
        result: {
          data: [
            { name: "document-reranking", latencyMs: 3910 },
            { name: "vector-search", latencyMs: 480 },
          ],
        },
      },
    ],
    conclusion:
      "The slowest traces are retrieval-heavy. The expensive step is document reranking, not the initial vector search.",
  },
  {
    prompt: "Compare the same window against quality scores.",
    reasoning: [
      "Latency alone does not tell us whether users were affected, so I am joining the slow segment with scores.",
      "Averaging per score name is enough resolution to spot a quality regression without a heavy query.",
    ].join("\n"),
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
    subsequentTools: [
      {
        name: "langfuse_getTraces",
        args: {
          limit: 5,
          filter: "scoreName equals groundedness and scoreValue below 0.7",
        },
        result: {
          data: [
            { traceId: "trace-ret-104", groundedness: 0.61 },
            { traceId: "trace-ret-219", groundedness: 0.65 },
          ],
        },
      },
    ],
    conclusion:
      "Quality moved down in the same segment. The groundedness score dropped most, which fits a retrieval or reranking regression.",
  },
  {
    prompt: "Inspect model usage for the outlier traces.",
    reasoning: [
      "A fallback model or a larger context window can explain slow traces even when retrieval is healthy.",
      "Fetching model name, token counts, and latency for just the two outlier traces keeps this cheap.",
      "High token counts with a stable model would point back at the reranker passing too many documents.",
    ].join("\n"),
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
    subsequentTools: [
      {
        name: "langfuse_queryMetrics",
        args: {
          view: "observations",
          metrics: [{ measure: "totalTokens", aggregation: "avg" }],
          filter: "name contains retrieval",
        },
        result: { data: [{ avg_totalTokens: 8940 }] },
      },
    ],
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
  type StreamingPhase =
    | "start"
    | "reasoning"
    | "intro"
    | "tool-loading"
    | "tool-done"
    | "conclusion";

  const streamRef = useRef<{
    cycle: number;
    phase: StreamingPhase;
    phaseTicks: number;
    toolIndex: number;
    reasoningMessageId: string;
    introMessageId: string;
    toolMessageId: string;
    conclusionMessageId: string;
  }>({
    cycle: 0,
    phase: "start",
    phaseTicks: 0,
    toolIndex: 0,
    reasoningMessageId: "",
    introMessageId: "",
    toolMessageId: "",
    conclusionMessageId: "",
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const stream = streamRef.current;
      const investigation =
        streamingInvestigations[stream.cycle % streamingInvestigations.length];
      const toolCalls = [
        {
          name: investigation.toolName,
          args: investigation.toolArgs,
          result: investigation.toolResult,
        },
        ...investigation.subsequentTools,
      ];
      const activeTool = toolCalls[stream.toolIndex];

      if (stream.phase === "start") {
        const cycleId = `stream-${stream.cycle}`;
        stream.reasoningMessageId = `${cycleId}-reasoning`;
        stream.introMessageId = `${cycleId}-intro`;
        stream.toolMessageId = `${cycleId}-tool`;
        stream.conclusionMessageId = `${cycleId}-conclusion`;
        stream.phase = "reasoning";
        stream.phaseTicks = 0;
        stream.toolIndex = 0;

        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: `${cycleId}-user`,
            role: "user",
            content: { type: "text", text: investigation.prompt },
          },
          {
            id: stream.reasoningMessageId,
            role: "assistant",
            content: { type: "reasoning", text: "", isStreaming: true },
          },
        ]);

        return;
      }

      if (stream.phase === "reasoning") {
        setMessages((currentMessages) => {
          const nextMessages = currentMessages.map((message) => {
            if (
              message.id !== stream.reasoningMessageId ||
              message.content.type !== "reasoning"
            ) {
              return message;
            }

            const text = appendToken(
              message.content.text,
              investigation.reasoning,
            );

            // The block collapses once the assistant's text answer arrives,
            // mirroring getDrawerMessages semantics.
            const isDone = text === investigation.reasoning;

            if (isDone) {
              stream.phase = "intro";
              stream.phaseTicks = 0;
            }

            return {
              ...message,
              content: {
                type: "reasoning" as const,
                text,
                isStreaming: !isDone,
              },
            };
          });

          if (stream.phase !== "intro") {
            return nextMessages;
          }

          return [
            ...nextMessages,
            {
              id: stream.introMessageId,
              role: "assistant",
              content: { type: "text", text: "" },
            },
          ];
        });

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
                  name: activeTool.name,
                  status: "running",
                  args: JSON.stringify(activeTool.args, null, 2),
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

        const completedToolIndex = stream.toolIndex;
        const nextTool = toolCalls[completedToolIndex + 1];

        if (nextTool) {
          stream.toolIndex += 1;
        } else {
          stream.phase = "conclusion";
        }
        stream.phaseTicks = 0;

        setMessages((currentMessages) => {
          const nextMessages = currentMessages.map((message) => {
            if (
              message.id !== stream.toolMessageId ||
              message.content.type !== "toolGroup"
            ) {
              return message;
            }

            const completedTools = message.content.tools.map((tool, index) =>
              index === completedToolIndex
                ? {
                    ...tool,
                    status: "succeeded" as const,
                    result: JSON.stringify(activeTool.result, null, 2),
                  }
                : tool,
            );

            return {
              ...message,
              content: {
                type: "toolGroup" as const,
                ...(nextTool ? { isLoading: true } : {}),
                tools: nextTool
                  ? [
                      ...completedTools,
                      {
                        type: "tool" as const,
                        name: nextTool.name,
                        status: "running" as const,
                        args: JSON.stringify(nextTool.args, null, 2),
                      },
                    ]
                  : completedTools,
              },
            };
          });

          if (nextTool) {
            return nextMessages;
          }

          return [
            ...nextMessages,
            {
              id: stream.conclusionMessageId,
              role: "assistant",
              content: { type: "text", text: "" },
            },
          ];
        });

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

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <InAppAgentWindowStoryShell isExpanded={isExpanded}>
      {({ isHeaderDragHandleEnabled }) => (
        <InAppAgentWindow
          {...args}
          isHeaderDragHandleEnabled={isHeaderDragHandleEnabled}
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
      )}
    </InAppAgentWindowStoryShell>
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
const longReasoningText = [
  "Reading the current drawer context and selected project state.",
  "Checking active filters before choosing the smallest safe query.",
  "Comparing recent traces, observations, and score names for a matching latency signal.",
  "Waiting for the first tool call result before drafting a final answer.",
  "Keeping this text intentionally long so the reasoning block spans several lines while the drawer follows the conversation bottom.",
  "The final streamed line should remain visible inside the reasoning block.",
].join("\n");

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
    isAssistantTurnInProgress: false,
    selectedConversationId: undefined,
    onDeleteConversation: fn(),
    onLoadMoreConversations: fn(),
    onOpenConversationHistory: fn(),
    onNewConversation: fn(),
    onApproveToolCall: fn(),
    onRejectToolCall: fn(),
    onSelectConversation: fn(),
    onClose: fn(),
    onExpandedChange: fn(),
    onSubmit: fn(),
    onSubmitFeedback: fn(),
    quickActionContext: getInAppAgentQuickActionContext("/"),
    quickActionResetKey: "/",
    screenContextDescription: { type: "page" as const },
    showCloseButton: true,
  },
  render: (args) => <StatefulInAppAgentWindow {...args} />,
});

export const ToolApprovalRequired = meta.story({
  args: {
    isAssistantTurnInProgress: true,
    isInputDisabled: true,
    selectedConversationId: "conversation-1",
    messages: [
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Create a dataset for regression examples.",
        },
      },
      {
        id: "approval-1",
        role: "assistant",
        content: {
          type: "toolGroup",
          tools: [
            {
              type: "tool",
              name: "langfuse_upsertDataset",
              status: "running",
              args: JSON.stringify({
                name: "regression-examples",
                description: "Examples used for release regression tests",
              }),
              approval: {
                id: "approval-1",
                status: "pending",
              },
            },
          ],
        },
      },
    ],
  },
});

export const Empty = meta.story({
  args: {
    messages: [],
  },
});

export const Conversation = meta.story({
  args: {
    selectedConversationId: "conversation-1",
    screenContextDescription: { type: "experimentRun" as const },
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
        id: "assistant-reasoning-1",
        role: "assistant",
        content: {
          type: "reasoning",
          text: longReasoningText,
          isStreaming: false,
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
              status: "succeeded",
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
              status: "succeeded",
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
    isAssistantTurnInProgress: true,
    selectedConversationId: "conversation-1",
    messages: streamingSeedMessages,
  },
  render: (args) => <StreamingInAppAgentWindow {...args} />,
});

export const LoadingResponse = meta.story({
  args: {
    isAssistantTurnInProgress: true,
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
    isAssistantTurnInProgress: true,
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
              status: "succeeded",
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
              status: "succeeded",
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

export const FeedbackControlsWaitForTurnEnd = meta.story({
  name: "(Test) Feedback Controls Wait For Turn End",
  args: {
    selectedConversationId: "conversation-1",
    isInputDisabled: true,
    isAssistantTurnInProgress: true,
    onSubmitFeedback: fn(),
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
        runId: "run-1",
        role: "assistant",
        content: {
          type: "text",
          text: "I found a cluster of ingestion errors around malformed JSON payloads",
        },
      },
    ],
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    await canvas.findByText(
      "I found a cluster of ingestion errors around malformed JSON payloads",
    );

    await waitFor(() => {
      expect(
        canvas.queryByRole("button", { name: "Good response" }),
      ).not.toBeInTheDocument();
      expect(
        canvas.queryByRole("button", { name: "Bad response" }),
      ).not.toBeInTheDocument();
    });
  },
});

export const FeedbackControlsShowAfterTurnEnd = meta.story({
  name: "(Test) Feedback Controls Show After Turn End",
  args: {
    selectedConversationId: "conversation-1",
    isAssistantTurnInProgress: false,
    onSubmitFeedback: fn(),
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
        runId: "run-1",
        role: "assistant",
        content: {
          type: "text",
          text: "The errors were caused by malformed JSON payloads.",
        },
      },
    ],
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.findByRole("button", { name: "Good response" }),
    ).resolves.toBeInTheDocument();
    await expect(
      canvas.findByRole("button", { name: "Bad response" }),
    ).resolves.toBeInTheDocument();
  },
});

export const Connecting = meta.story({
  args: {
    isAssistantTurnInProgress: true,
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
    error: {
      type: "generic",
      message: "Assistant is not enabled for this user",
    },
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

export const RateLimited = meta.story({
  name: "(Test) Rate Limited",
  args: {
    error: null,
    isAssistantTurnInProgress: true,
    isInputDisabled: true,
    messages: [
      {
        id: "approval-1",
        role: "assistant",
        content: {
          type: "toolGroup",
          tools: [
            {
              type: "tool",
              name: "langfuse_upsertDataset",
              status: "running",
              args: JSON.stringify({ name: "regression-examples" }),
              approval: {
                id: "approval-1",
                status: "pending",
              },
            },
          ],
        },
      },
    ],
  },
  render: function Render(args) {
    const [retryAt] = useState(() => Date.now() + 12_000);

    return (
      <StatefulInAppAgentWindow
        {...args}
        error={{ type: "rate_limit", retryAt }}
      />
    );
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const alert = canvas.getByRole("alert");
    const initialAlertText = alert.textContent;

    await expect(alert).toHaveTextContent(
      "You've reached the assistant request limit",
    );
    await expect(alert).toHaveTextContent("Try again in about");
    await waitFor(() => expect(alert.textContent).not.toBe(initialAlertText), {
      timeout: 2_000,
    });
    await expect(
      canvas.getByRole("textbox", { name: "Message the assistant" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Confirm" }),
    ).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Reject" })).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Start new conversation" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Conversation history" }),
    ).toBeDisabled();
  },
});

export const RefocusAfterSubmit = meta.story({
  name: "(Test) Refocus After Submit",
  args: {
    messages: [],
  },
  render: function Render(args) {
    const [isExpanded, setIsExpanded] = useState(args.isExpanded);
    const [isInputDisabled, setIsInputDisabled] = useState(false);
    const [messages, setMessages] = useState<InAppAgentWindowMessage[]>([
      {
        id: "assistant-1",
        role: "assistant",
        content: {
          type: "text",
          text: "Assistant answer",
        },
      },
    ]);

    return (
      <InAppAgentWindowStoryShell isExpanded={isExpanded}>
        {({ isHeaderDragHandleEnabled }) => (
          <InAppAgentWindow
            {...args}
            isHeaderDragHandleEnabled={isHeaderDragHandleEnabled}
            isExpanded={isExpanded}
            isInputDisabled={isInputDisabled}
            messages={messages}
            onExpandedChange={(isExpanded) => {
              setIsExpanded(isExpanded);
              args.onExpandedChange(isExpanded);
            }}
            onSubmit={(input) => {
              setIsInputDisabled(true);
              window.setTimeout(() => {
                setMessages((currentMessages) => [
                  ...currentMessages,
                  {
                    id: `assistant-${currentMessages.length + 1}`,
                    role: "assistant",
                    content: {
                      type: "text",
                      text: `Answer for: ${input}`,
                    },
                  },
                ]);
                setIsInputDisabled(false);
              }, 50);

              args.onSubmit(input);
              return true;
            }}
          />
        )}
      </InAppAgentWindowStoryShell>
    );
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByLabelText("Message the assistant");

    await userEvent.type(textarea, "Check the latest latency regression");
    await userEvent.click(canvas.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(
        canvas.getByText("Answer for: Check the latest latency regression"),
      ).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(textarea).toHaveFocus();
    });
  },
});
