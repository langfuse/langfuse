import preview from "../../../../.storybook/preview";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { startOfWeek, subDays, subHours, subWeeks } from "date-fns";
import {
  IN_APP_AGENT_GENERIC_ERROR_MESSAGE,
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
  type AgUiMessage,
} from "@langfuse/shared/in-app-agent";
import {
  InAppAgentWindow,
  type InAppAgentWindowMessage,
  type InAppAgentWindowProps,
} from "./InAppAgentWindow";
import type { InAppAgentDock } from "@/src/features/in-app-agent/presentation";
import { getInAppAgentQuickActionContext } from "@/src/features/in-app-agent/quickActions";
import type { InAppAgentActivityByConversationId } from "@/src/features/in-app-agent/lib/inAppAgentActivity";
import {
  createInAppAgentDisplayState,
  projectInAppAgentMessagesForDisplay,
} from "@/src/features/in-app-agent/lib/display";
import {
  InAppAgentWindowShell,
  useInAppAgentWindowShellPanelControl,
} from "./InAppAgentWindowShell";
import { getDrawerMessages } from "./utils/utils";
import {
  getBackgroundRunNotice,
  getSettledActivityOutcome,
} from "@/src/features/in-app-agent/lib/backgroundExecutionSession";

function InAppAgentWindowStoryShell({
  children,
  isExpanded,
  onExpandedChange,
}: {
  children: (props: { isHeaderDragHandleEnabled: boolean }) => ReactNode;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
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
      onClose={() => undefined}
      onExpandedChange={onExpandedChange}
      open
      panelRef={panelRef}
    >
      {children}
    </InAppAgentWindowShell>
  );
}

function StatefulInAppAgentWindow(args: InAppAgentWindowProps) {
  const [isExpanded, setIsExpanded] = useState(args.isExpanded);
  const [dock, setDock] = useState(args.dock ?? "detached");
  const handleExpandedChange = (isExpanded: boolean) => {
    setIsExpanded(isExpanded);
    args.onExpandedChange(isExpanded);
  };
  const handleDockChange = (nextDock: InAppAgentDock) => {
    setDock(nextDock);
    args.onDockChange?.(nextDock);
  };

  return (
    <InAppAgentWindowStoryShell
      isExpanded={isExpanded}
      onExpandedChange={handleExpandedChange}
    >
      {({ isHeaderDragHandleEnabled }) => (
        <InAppAgentWindow
          {...args}
          dock={dock}
          onDockChange={handleDockChange}
          isHeaderDragHandleEnabled={isHeaderDragHandleEnabled}
          isExpanded={isExpanded}
          onExpandedChange={handleExpandedChange}
        />
      )}
    </InAppAgentWindowStoryShell>
  );
}

const streamingSeedMessages: InAppAgentWindowMessage[] = [
  {
    id: "seed-user-1",
    timestamp: new Date("2026-08-06T11:48:43.000Z").getTime(),
    role: "user",
    content: {
      type: "text",
      text: "Find the cause of latency spikes in production traces.",
    },
  },
  {
    id: "seed-assistant-1",
    timestamp: new Date("2026-08-06T11:49:13.000Z").getTime(),
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
  const [dock, setDock] = useState(args.dock ?? "detached");
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

  const handleExpandedChange = (isExpanded: boolean) => {
    setIsExpanded(isExpanded);
    args.onExpandedChange(isExpanded);
  };
  const handleDockChange = (nextDock: InAppAgentDock) => {
    setDock(nextDock);
    args.onDockChange?.(nextDock);
  };

  return (
    <InAppAgentWindowStoryShell
      isExpanded={isExpanded}
      onExpandedChange={handleExpandedChange}
    >
      {({ isHeaderDragHandleEnabled }) => (
        <InAppAgentWindow
          {...args}
          dock={dock}
          onDockChange={handleDockChange}
          isHeaderDragHandleEnabled={isHeaderDragHandleEnabled}
          isExpanded={isExpanded}
          messages={messages}
          onExpandedChange={handleExpandedChange}
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

function conversationHistoryFixtureDates(now = new Date()) {
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });

  return {
    today: subHours(now, 2),
    yesterday: subDays(now, 1),
    thisWeek: weekStart,
    lastWeek: subWeeks(weekStart, 1),
    older: subWeeks(now, 3),
  };
}

const historyDates = conversationHistoryFixtureDates();

const conversations = [
  {
    id: "conversation-1",
    title: "Latency outliers",
    updatedAt: historyDates.today,
  },
  {
    id: "conversation-2",
    title: "Score correlation",
    updatedAt: historyDates.yesterday,
  },
];

/**
 * One conversation per activity state, in the priority order a row applies:
 * only the first matching state is ever rendered. Dates span recency groups
 * so the history menu can show Today / Yesterday / This week / Last week /
 * Older in one list.
 */
const activityConversations = [
  {
    id: "activity-approval",
    title: "Create the eval dataset",
    updatedAt: historyDates.today,
  },
  {
    id: "activity-running",
    title: "Activity digest comparing last two weeks",
    updatedAt: historyDates.yesterday,
  },
  {
    id: "activity-failed",
    title: "Score correlation",
    updatedAt: historyDates.thisWeek,
  },
  {
    id: "activity-done",
    title: "Latency outliers",
    updatedAt: historyDates.lastWeek,
  },
  {
    id: "activity-none",
    title: "Seed conversation",
    updatedAt: historyDates.older,
  },
];

const activityByConversationId: InAppAgentActivityByConversationId = new Map([
  [
    "activity-approval",
    {
      state: "approval",
      title: "Create the eval dataset",
      runId: "run-1",
      activityKey: "run-1:AWAITING_APPROVAL",
      needsAttention: true,
    },
  ],
  [
    "activity-running",
    {
      state: "running",
      title: "Activity digest comparing last two weeks",
      runId: "run-2",
      activityKey: "run-2:RUNNING",
      needsAttention: false,
    },
  ],
  [
    "activity-failed",
    {
      state: "failed-unread",
      title: "Score correlation",
      runId: "run-3",
      activityKey: "run-3:FAILED",
      needsAttention: true,
    },
  ],
  [
    "activity-done",
    {
      state: "done-unread",
      title: "Latency outliers",
      runId: "run-4",
      activityKey: "run-4:SUCCEEDED",
      needsAttention: true,
    },
  ],
]);

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
  args: {
    error: null,
    executionUi: { notice: null, stop: null },
    isExpanded: false,
    isConversationInteractionDisabled: false,
    isSelectedConversationHydrating: false,
    conversations,
    activityByConversationId: new Map(),
    hasMoreConversations: false,
    isLoadingMoreConversations: false,
    isAssistantTurnInProgress: false,
    selectedConversationId: undefined,
    selectedConversationTitle: null,
    onDeleteConversation: fn(),
    onLoadMoreConversations: fn(),
    onOpenConversationHistory: fn(),
    onNewConversation: fn(),
    onApproveToolCall: fn(),
    onAlwaysAllowToolCall: fn(),
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
  name: "(Test) Tool approval required",
  args: {
    isAssistantTurnInProgress: true,
    isAwaitingApproval: true,
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
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    // The run has stopped on the approval below, so the drawer must say so
    // rather than narrate the tool it was about to call.
    await expect(
      canvas.getByRole("button", { name: "Waiting for your approval…" }),
    ).toBeVisible();
  },
});

export const Empty = meta.story({
  args: {
    messages: [],
  },
});

function DockedSidebarInAppAgentWindow(args: InAppAgentWindowProps) {
  const [isExpanded, setIsExpanded] = useState(args.isExpanded);
  const [dock, setDock] = useState<InAppAgentDock>(args.dock ?? "sidebar");
  const handleExpandedChange = (nextExpanded: boolean) => {
    setIsExpanded(nextExpanded);
    args.onExpandedChange(nextExpanded);
  };
  const handleDockChange = (nextDock: InAppAgentDock) => {
    setDock(nextDock);
    args.onDockChange?.(nextDock);
  };

  const agentWindow = (
    <InAppAgentWindow
      {...args}
      dock={dock}
      onDockChange={handleDockChange}
      isHeaderDragHandleEnabled={false}
      isExpanded={isExpanded}
      onExpandedChange={handleExpandedChange}
    />
  );

  if (dock === "sidebar" && !isExpanded) {
    return (
      <div className="flex h-screen w-full">
        <div className="bg-muted/40 min-h-0 min-w-0 flex-1" />
        <div className="h-full min-h-0 w-[min(100%,28rem)] min-w-96 border-l">
          {agentWindow}
        </div>
      </div>
    );
  }

  return (
    <InAppAgentWindowStoryShell
      isExpanded={isExpanded}
      onExpandedChange={handleExpandedChange}
    >
      {({ isHeaderDragHandleEnabled }) => (
        <InAppAgentWindow
          {...args}
          dock={dock}
          onDockChange={handleDockChange}
          isHeaderDragHandleEnabled={isHeaderDragHandleEnabled}
          isExpanded={isExpanded}
          onExpandedChange={handleExpandedChange}
        />
      )}
    </InAppAgentWindowStoryShell>
  );
}

export const DockedSidebar = meta.story({
  args: {
    dock: "sidebar" as const,
    messages: [],
  },
  render: (args) => <DockedSidebarInAppAgentWindow {...args} />,
});

/**
 * History lives on the clock icon. Recency groups and relative age; hover a
 * row to replace the age with delete. New conversation stays a header action.
 */
export const PastConversations = meta.story({
  name: "Past Conversations",
  args: {
    conversations: activityConversations,
    activityByConversationId,
    selectedConversationId: "activity-running",
    selectedConversationTitle: "Activity digest comparing last two weeks",
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

export const GroupedAssistantTurn = meta.story({
  args: {
    isExpanded: true,
    selectedConversationId: "conversation-1",
    screenContextDescription: { type: "trace-list" },
    messages: [
      {
        id: "grouped-user",
        role: "user",
        content: { type: "text", text: "Why did latency increase?" },
      },
      {
        id: "grouped-intro",
        timestamp: new Date("2026-08-06T15:26:26.000Z").getTime(),
        role: "assistant",
        content: {
          type: "text",
          text: "I will compare the slow traces with their observations.",
        },
      },
      {
        id: "grouped-reasoning",
        role: "assistant",
        content: {
          type: "reasoning",
          text: "The slowest traces share a reranking step.",
          isStreaming: false,
        },
      },
      {
        id: "grouped-tool",
        role: "assistant",
        content: {
          type: "toolGroup",
          tools: [
            {
              type: "tool",
              name: "langfuse_getObservations",
              status: "succeeded",
              args: JSON.stringify({ orderBy: "latency.desc", limit: 10 }),
              result: JSON.stringify({ bottleneck: "document-reranking" }),
            },
          ],
        },
      },
      {
        id: "grouped-reasoning-2",
        role: "assistant",
        content: {
          type: "reasoning",
          text: "The reranking step is slow across both outlier traces.",
          isStreaming: false,
        },
      },
      {
        id: "grouped-tool-2",
        role: "assistant",
        content: {
          type: "toolGroup",
          tools: [
            {
              type: "tool",
              name: "langfuse_getTraces",
              status: "succeeded",
              args: JSON.stringify({ ids: ["trace-104", "trace-219"] }),
              result: JSON.stringify({ count: 2 }),
            },
            {
              type: "tool",
              name: "langfuse_queryMetrics",
              status: "succeeded",
              args: JSON.stringify({ metric: "latency", aggregation: "p95" }),
              result: JSON.stringify({ value: 5.82 }),
            },
          ],
        },
      },
      {
        id: "grouped-conclusion",
        runId: "grouped-run",
        timestamp: new Date("2026-08-06T15:27:17.000Z").getTime(),
        role: "assistant",
        content: {
          type: "text",
          text: "The latency increase comes from document reranking. Vector search remains stable.",
        },
      },
    ],
  },
});

const progressLogSeedMessages: InAppAgentWindowMessage[] = [
  {
    id: "progress-user",
    role: "user",
    content: { type: "text", text: "What changed in yesterday's dashboards?" },
  },
  {
    id: "progress-reasoning",
    timestamp: new Date("2026-08-06T15:26:26.000Z").getTime(),
    role: "assistant",
    content: {
      type: "reasoning",
      text: "I should read the dashboards first, then list recent observations.",
      isStreaming: false,
    },
  },
  {
    id: "progress-tools-start",
    role: "assistant",
    content: {
      type: "toolGroup",
      tools: [
        {
          type: "tool",
          name: "skill",
          status: "succeeded",
          args: JSON.stringify({ name: "error-analysis" }),
          result: JSON.stringify({ ok: true }),
        },
        {
          type: "tool",
          name: "langfuseDocs_search",
          status: "succeeded",
          args: JSON.stringify({ query: "dashboards" }),
          result: JSON.stringify({ hits: 2 }),
        },
        {
          type: "tool",
          name: "langfuse_getDashboard",
          status: "succeeded",
          args: JSON.stringify({ dashboardId: "dash-1" }),
          result: JSON.stringify({ name: "Latency" }),
        },
      ],
    },
  },
  {
    id: "progress-reasoning-2",
    role: "assistant",
    content: {
      type: "reasoning",
      text: "The dashboard spike lines up with a reranking change. Checking observation volume next.",
      isStreaming: false,
    },
  },
  {
    id: "progress-tool-latest",
    role: "assistant",
    content: {
      type: "toolGroup",
      tools: [
        {
          type: "tool",
          name: "langfuse_getObservation",
          status: "succeeded",
          args: JSON.stringify({ observationId: "obs-1" }),
          result: JSON.stringify({ name: "rerank" }),
        },
        {
          type: "tool",
          name: "langfuse_listObservations",
          status: "running",
          args: JSON.stringify({ limit: 20 }),
        },
      ],
    },
  },
];

export const ProgressLogWorking = meta.story({
  args: {
    isAssistantTurnInProgress: true,
    isExpanded: true,
    selectedConversationId: "conversation-1",
    messages: progressLogSeedMessages,
  },
});

export const ProgressLogOpened = meta.story({
  name: "(Test) Progress log opened",
  args: {
    isAssistantTurnInProgress: true,
    isExpanded: true,
    selectedConversationId: "conversation-1",
    messages: progressLogSeedMessages,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Looking at observations" }),
    );
    await expect(canvas.getAllByText("Thought")).toHaveLength(2);
    await expect(canvas.getByLabelText("skill: succeeded")).toBeVisible();
    await expect(canvas.getByLabelText("search: succeeded")).toBeVisible();
    await expect(
      canvas.getByLabelText("getDashboard: succeeded"),
    ).toBeVisible();
    await expect(
      canvas.getByLabelText("getObservation: succeeded"),
    ).toBeVisible();
    await expect(
      canvas.getByLabelText("listObservations: running"),
    ).toBeVisible();
  },
});

export const ProgressLogMidTurnText = meta.story({
  args: {
    isAssistantTurnInProgress: true,
    isExpanded: true,
    selectedConversationId: "conversation-1",
    messages: [
      ...progressLogSeedMessages,
      {
        id: "progress-mid-turn-text",
        role: "assistant",
        content: {
          type: "text",
          text: "The dashboard spike looks like reranking. Checking a few observation payloads next.",
        },
      },
    ],
  },
});

export const ProgressLogCompleted = meta.story({
  args: {
    isExpanded: true,
    selectedConversationId: "conversation-1",
    messages: [
      ...progressLogSeedMessages.slice(0, -1),
      {
        id: "progress-tool-latest",
        role: "assistant",
        content: {
          type: "toolGroup",
          tools: [
            {
              type: "tool",
              name: "langfuse_listObservations",
              status: "succeeded",
              args: JSON.stringify({ limit: 20 }),
              result: JSON.stringify({ count: 20 }),
            },
          ],
        },
      },
      {
        id: "progress-answer",
        runId: "progress-run",
        timestamp: new Date("2026-08-06T15:27:17.000Z").getTime(),
        role: "assistant",
        content: {
          type: "text",
          text: "Yesterday's latency dashboard picked up a reranking spike. Observation volume stayed flat.",
        },
      },
    ],
  },
});

export const MultiBlockAnswer = meta.story({
  args: {
    isExpanded: true,
    selectedConversationId: "conversation-1",
    screenContextDescription: { type: "trace-list" },
    messages: [
      {
        id: "multiblock-user",
        role: "user",
        content: { type: "text", text: "What is going on with errors?" },
      },
      {
        id: "multiblock-reasoning",
        timestamp: new Date("2026-08-06T15:26:26.000Z").getTime(),
        role: "assistant",
        content: {
          type: "reasoning",
          text: "I should inspect the error traces first.",
          isStreaming: false,
        },
      },
      {
        id: "multiblock-tool",
        role: "assistant",
        content: {
          type: "toolGroup",
          tools: [
            {
              type: "tool",
              name: "langfuse_getTraces",
              status: "succeeded",
              args: JSON.stringify({ level: "ERROR", limit: 20 }),
              result: JSON.stringify({ count: 12, synthetic: true }),
            },
          ],
        },
      },
      {
        id: "multiblock-analysis",
        timestamp: new Date("2026-08-06T15:27:20.000Z").getTime(),
        role: "assistant",
        content: {
          type: "text",
          text: "The traces are synthetic seed data, not real traffic. Error volume is concentrated on the ingestion path.",
          redirectAction: {
            type: "redirectAction",
            label: "Open error traces",
            href: "/project/project-1/traces?level=ERROR",
          },
        },
      },
      {
        id: "multiblock-closer",
        runId: "multiblock-run",
        timestamp: new Date("2026-08-06T15:27:48.000Z").getTime(),
        role: "assistant",
        content: {
          type: "text",
          text: "I've prepared a link to the error-level traces.",
        },
      },
    ],
  },
});

export const LightConversation = meta.story({
  globals: { theme: "light" },
  args: {
    isExpanded: true,
    selectedConversationId: "conversation-1",
    messages: streamingSeedMessages,
  },
});

export const DarkConversation = meta.story({
  globals: { theme: "dark" },
  args: {
    isExpanded: true,
    selectedConversationId: "conversation-1",
    messages: streamingSeedMessages,
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

export const Working = meta.story({
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
    ],
  },
});

export const LoadingAfterToolCall = meta.story({
  args: {
    isAssistantTurnInProgress: true,
    isConversationInteractionDisabled: true,
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

export const Error = meta.story({
  name: "(Test) Error",
  args: {
    error: {
      type: "generic",
      message: "Internal sandbox bridge timeout",
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = canvas.getByRole("alert");

    await expect(alert).toHaveTextContent(IN_APP_AGENT_GENERIC_ERROR_MESSAGE);
    await expect(alert).not.toHaveTextContent(
      "Internal sandbox bridge timeout",
    );
    await expect(
      canvas.getByRole("textbox", { name: "Message the assistant" }),
    ).toBeEnabled();
    await expect(within(alert).queryByRole("button")).not.toBeInTheDocument();
  },
});

const stepLimitRun = {
  id: "run-1",
  status: InAppAgentRunStatus.SUCCEEDED,
  errorCode: InAppAgentRunErrorCode.STEP_LIMIT,
  cancelRequested: false,
};

export const StepLimit = meta.story({
  name: "(Test) Step limit",
  args: {
    selectedConversationId: "conversation-1",
    executionUi: {
      notice: getBackgroundRunNotice(stepLimitRun),
      activityOutcome: getSettledActivityOutcome(stepLimitRun),
      stop: null,
    },
    messages: [
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Investigate yesterday's errors.",
        },
      },
      {
        id: "assistant-reasoning-1",
        timestamp: new Date("2026-08-06T15:20:00.000Z").getTime(),
        role: "assistant",
        content: {
          type: "reasoning",
          text: "Checking yesterday first.",
          isStreaming: false,
        },
      },
      {
        id: "assistant-text-1",
        runId: "run-0",
        timestamp: new Date("2026-08-06T15:20:12.000Z").getTime(),
        role: "assistant",
        content: {
          type: "text",
          text: "Yesterday was quiet.",
        },
      },
      {
        id: "user-2",
        role: "user",
        content: {
          type: "text",
          text: "Keep inspecting traces until you find the spike.",
        },
      },
      {
        id: "assistant-tool-2",
        timestamp: new Date("2026-08-06T15:26:26.000Z").getTime(),
        role: "assistant",
        content: {
          type: "toolGroup",
          tools: [
            {
              type: "tool",
              name: "langfuse_getTraces",
              status: "succeeded",
              args: JSON.stringify({ limit: 10 }),
              result: JSON.stringify({ data: [] }),
            },
            {
              type: "tool",
              name: "langfuse_queryMetrics",
              status: "succeeded",
              args: JSON.stringify({ view: "traces" }),
              result: JSON.stringify({ data: [] }),
            },
          ],
        },
      },
      {
        id: "assistant-text-2",
        timestamp: new Date("2026-08-06T15:27:17.000Z").getTime(),
        role: "assistant",
        content: {
          type: "text",
          text: "Latency is up on the last two batches, but I still need to inspect the remaining traces.",
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Too many steps in one turn",
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Send another message",
    );
    await expect(
      canvas.getByRole("button", { name: "Worked for 12s" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Stopped after 51s" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("textbox", { name: "Message the assistant" }),
    ).toBeEnabled();
  },
});

const failedRun = {
  id: "run-1",
  status: InAppAgentRunStatus.FAILED,
  errorCode: InAppAgentRunErrorCode.RUN_TIMEOUT,
  cancelRequested: false,
};

export const Failed = meta.story({
  name: "(Test) Failed",
  args: {
    selectedConversationId: "conversation-1",
    executionUi: {
      notice: getBackgroundRunNotice(failedRun),
      activityOutcome: getSettledActivityOutcome(failedRun),
      stop: null,
    },
    messages: [
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Investigate latency",
        },
      },
      {
        id: "assistant-reasoning",
        timestamp: new Date("2026-08-06T15:26:26.000Z").getTime(),
        role: "assistant",
        content: {
          type: "reasoning",
          text: "Checking the slow traces.",
          isStreaming: false,
        },
      },
      {
        id: "assistant-answer",
        runId: "run-1",
        timestamp: new Date("2026-08-06T15:27:17.000Z").getTime(),
        role: "assistant",
        content: {
          type: "text",
          text: "Still inspecting the remaining traces.",
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("status")).toHaveTextContent(
      "The run hit the time limit.",
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Send another message",
    );
    await expect(
      canvas.getByRole("button", { name: "Failed after 51s" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("textbox", { name: "Message the assistant" }),
    ).toBeEnabled();
  },
});

const failedBeforeFirstTokenRun = {
  id: "run-2",
  status: InAppAgentRunStatus.FAILED,
  errorCode: InAppAgentRunErrorCode.QUEUE_TIMEOUT,
  cancelRequested: false,
};

export const FailedBeforeFirstToken = meta.story({
  name: "(Test) Failed before first token",
  args: {
    selectedConversationId: "conversation-1",
    executionUi: {
      notice: getBackgroundRunNotice(failedBeforeFirstTokenRun),
      activityOutcome: getSettledActivityOutcome(failedBeforeFirstTokenRun),
      stop: null,
    },
    messages: [
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Investigate yesterday's errors.",
        },
      },
      {
        id: "assistant-reasoning-1",
        timestamp: new Date("2026-08-06T15:20:00.000Z").getTime(),
        role: "assistant",
        content: {
          type: "reasoning",
          text: "Checking yesterday first.",
          isStreaming: false,
        },
      },
      {
        id: "assistant-text-1",
        runId: "run-1",
        timestamp: new Date("2026-08-06T15:20:12.000Z").getTime(),
        role: "assistant",
        content: {
          type: "text",
          text: "Yesterday was quiet.",
        },
      },
      {
        id: "user-2",
        role: "user",
        content: {
          type: "text",
          text: "Now look at today's traces.",
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("status")).toHaveTextContent(
      "The assistant failed.",
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Send another message",
    );
    await expect(
      canvas.getByRole("button", { name: "Worked for 12s" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: /Failed after/ }),
    ).not.toBeInTheDocument();
  },
});

const failedWorkerLostRun = {
  id: "run-1",
  status: InAppAgentRunStatus.FAILED,
  errorCode: InAppAgentRunErrorCode.WORKER_LOST,
  cancelRequested: false,
};

export const FailedWorkerLost = meta.story({
  name: "(Test) Assistant failed",
  args: {
    selectedConversationId: "conversation-1",
    executionUi: {
      notice: getBackgroundRunNotice(failedWorkerLostRun),
      activityOutcome: getSettledActivityOutcome(failedWorkerLostRun),
      stop: null,
    },
    messages: [
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Investigate latency",
        },
      },
      {
        id: "assistant-answer",
        runId: "run-1",
        timestamp: new Date("2026-08-06T15:27:17.000Z").getTime(),
        role: "assistant",
        content: {
          type: "text",
          text: "Still inspecting the remaining traces.",
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("status")).toHaveTextContent(
      "The assistant failed.",
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Send another message",
    );
    await expect(
      canvas.getByRole("textbox", { name: "Message the assistant" }),
    ).toBeEnabled();
  },
});

const expiredApprovalRun = {
  id: "run-1",
  status: InAppAgentRunStatus.FAILED,
  errorCode: InAppAgentRunErrorCode.APPROVAL_EXPIRED,
  cancelRequested: false,
};

export const ApprovalExpired = meta.story({
  name: "(Test) Approval expired",
  args: {
    selectedConversationId: "conversation-1",
    isAwaitingApproval: false,
    isAssistantTurnInProgress: false,
    executionUi: {
      notice: getBackgroundRunNotice(expiredApprovalRun),
      activityOutcome: getSettledActivityOutcome(expiredApprovalRun),
      stop: null,
    },
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
        id: "assistant-tool-1",
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
            },
          ],
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("status")).toHaveTextContent(
      "The approval request expired. The action was not run. Send another message if you still want it.",
    );
    await expect(
      canvas.queryByRole("button", { name: "Approve" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Decline" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Waiting for your approval…" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("textbox", { name: "Message the assistant" }),
    ).toBeEnabled();
  },
});

/**
 * Recency groups, left-side activity, and relative age. The title is only a
 * name: attention lives on the rows and the launcher, and the count stays in
 * the history icon's accessible name. The running conversation is omitted from
 * that count: it has nothing for the user to act on yet.
 */
export const ConversationActivity = meta.story({
  name: "(Test) Conversation activity",
  args: {
    conversations: activityConversations,
    activityByConversationId,
    selectedConversationId: "activity-running",
    selectedConversationTitle: "Activity digest comparing last two weeks",
    messages: [],
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    const historyTrigger = canvas.getByRole("button", {
      name: "Conversation history (3 need attention)",
    });

    await expect(historyTrigger).toBeVisible();
    await expect(
      within(historyTrigger).queryByText("3"),
    ).not.toBeInTheDocument();

    await userEvent.click(historyTrigger);

    const history = within(await screen.findByRole("menu"));

    await expect(
      history.getByText("Past conversations", { exact: true }),
    ).toBeInTheDocument();
    await expect(
      history.getByText("Today", { exact: true }),
    ).toBeInTheDocument();
    await expect(
      history.getByText("Yesterday", { exact: true }),
    ).toBeInTheDocument();
    await expect(
      history.getByText("This week", { exact: true }),
    ).toBeInTheDocument();
    await expect(
      history.getByText("Last week", { exact: true }),
    ).toBeInTheDocument();
    await expect(
      history.getByText("Older", { exact: true }),
    ).toBeInTheDocument();
    await expect(
      history.getByRole("menuitem", { name: /Create the eval dataset/ }),
    ).toBeInTheDocument();
    await expect(history.getByText("2h")).toBeInTheDocument();
    await expect(
      history.getByLabelText("Needs your approval"),
    ).toBeInTheDocument();
    await expect(history.getByLabelText("Working")).toBeInTheDocument();
    await expect(history.getByLabelText("Failed")).toBeInTheDocument();
    await expect(history.getByLabelText("Finished")).toBeInTheDocument();
  },
});

export const DeletesAConversation = meta.story({
  name: "(Test) Deletes a conversation",
  args: {
    selectedConversationId: "conversation-1",
    selectedConversationTitle: "Latency outliers",
    messages: [],
  },
  play: async ({
    args,
    canvasElement,
  }: {
    args: InAppAgentWindowProps;
    canvasElement: HTMLElement;
  }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", { name: /^Conversation history/ }),
    );

    const history = within(await screen.findByRole("menu"));
    const row = history.getByRole("menuitem", { name: /Latency outliers/ });

    await userEvent.hover(row);
    await userEvent.click(
      within(row).getByRole("button", { name: "Delete conversation" }),
    );

    await expect(args.onDeleteConversation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conversation-1" }),
    );
  },
});

/** Long enough to watch the hint, short enough to settle before it expires. */
const STORY_RUN_MS = 3_000;

/**
 * The nudge that opens a conversation. Send a second message to see that it
 * belongs to the first one only, and wait for the run to settle to see it go.
 */
export const BackgroundHint = meta.story({
  name: "(Test) Background hint",
  args: {
    messages: [],
  },
  render: function Render(args) {
    const [messages, setMessages] = useState<InAppAgentWindowMessage[]>([]);
    const [isRunning, setIsRunning] = useState(false);

    return (
      <StatefulInAppAgentWindow
        {...args}
        messages={messages}
        isAssistantTurnInProgress={isRunning}
        onSubmit={(input) => {
          setMessages((currentMessages) => [
            ...currentMessages,
            {
              id: `user-${currentMessages.length}`,
              role: "user",
              content: { type: "text", text: input },
            },
          ]);
          setIsRunning(true);

          window.setTimeout(() => {
            setIsRunning(false);
            setMessages((currentMessages) => [
              ...currentMessages,
              {
                id: `assistant-${currentMessages.length}`,
                role: "assistant",
                content: {
                  type: "text",
                  text: "Cost is up 12% week over week, driven by gpt-4o traces.",
                },
              },
            ]);
          }, STORY_RUN_MS);

          args.onSubmit(input);
          return true;
        }}
      />
    );
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(
      canvas.getByRole("textbox", { name: "Message the assistant" }),
      "Compare cost against last week",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Send message" }));
    await waitFor(() => {
      expect(
        canvas.getByText(/I keep running in the background/),
      ).toBeVisible();
    });
    await expect(canvas.getByText(/Feel free to close/)).toBeVisible();

    await waitFor(
      () =>
        expect(
          canvas.queryByText(/I keep running in the background/),
        ).not.toBeInTheDocument(),
      { timeout: STORY_RUN_MS * 2 },
    );
  },
});

export const BackgroundRun = meta.story({
  args: {
    isAssistantTurnInProgress: true,
    executionUi: {
      notice: null,
      stop: { status: "available", onStop: fn() },
    },
    messages: [
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Summarize recent ingestion errors.",
        },
      },
    ],
  },
});

const cancelledRun = {
  id: "run-1",
  status: InAppAgentRunStatus.CANCELLED,
  errorCode: InAppAgentRunErrorCode.CANCELLED,
  cancelRequested: false,
};

const backgroundStopUserMessage = {
  id: "user-1",
  role: "user" as const,
  content: {
    type: "text" as const,
    text: "Summarize recent ingestion errors.",
  },
};

const backgroundStopReasoning = {
  id: "assistant-reasoning",
  timestamp: new Date("2026-08-06T15:26:26.000Z").getTime(),
  role: "assistant" as const,
  content: {
    type: "reasoning" as const,
    text: "I'll look at recent ingestion errors first.",
    isStreaming: false,
  },
};

export const BackgroundRunStops = meta.story({
  name: "(Test) Background run stops",
  args: {
    isAssistantTurnInProgress: true,
    selectedConversationId: "conversation-1",
    messages: [backgroundStopUserMessage, backgroundStopReasoning],
  },
  render: function Render(args) {
    const [phase, setPhase] = useState<"running" | "stopping" | "settled">(
      "running",
    );
    const isSettled = phase === "settled";

    useEffect(() => {
      if (phase !== "stopping") {
        return;
      }

      const timeoutId = window.setTimeout(() => {
        setPhase("settled");
      }, 1_500);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }, [phase]);

    return (
      <StatefulInAppAgentWindow
        {...args}
        isAssistantTurnInProgress={!isSettled}
        messages={
          isSettled
            ? [
                backgroundStopUserMessage,
                backgroundStopReasoning,
                {
                  id: "assistant-1",
                  runId: "run-1",
                  timestamp: new Date("2026-08-06T15:27:17.000Z").getTime(),
                  role: "assistant",
                  content: {
                    type: "text",
                    text: "The run stopped before the investigation completed.",
                  },
                },
              ]
            : args.messages
        }
        executionUi={
          isSettled
            ? {
                notice: getBackgroundRunNotice(cancelledRun),
                activityOutcome: getSettledActivityOutcome(cancelledRun),
                stop: null,
              }
            : {
                notice:
                  phase === "stopping"
                    ? { text: "Stopping the run…", tone: "info" }
                    : null,
                stop: {
                  status: phase === "stopping" ? "stopping" : "available",
                  onStop: () => {
                    setPhase("stopping");
                  },
                },
              }
        }
      />
    );
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "Stop run" }));
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Stopping the run…",
    );
    await waitFor(
      () =>
        expect(
          canvas.getByRole("button", { name: "Stopped after 51s" }),
        ).toBeVisible(),
      { timeout: 3_000 },
    );
  },
});

export const LoadingConversation = meta.story({
  name: "(Test) Loading Conversation",
  args: {
    isConversationInteractionDisabled: true,
    messages: [],
    selectedConversationId: "conversation-1",
    isSelectedConversationHydrating: true,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.queryByText("Welcome to the Langfuse Assistant"),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: /^Create a prompt/ }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Start new conversation" }),
    ).toBeEnabled();
    await expect(
      canvas.getByRole("button", { name: /^Conversation history/ }),
    ).toBeEnabled();
    await expect(
      canvas.getByRole("textbox", { name: "Message the assistant" }),
    ).toBeDisabled();
  },
});

export const RateLimited = meta.story({
  name: "(Test) Rate Limited",
  args: {
    error: null,
    isAssistantTurnInProgress: true,
    isConversationInteractionDisabled: false,
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
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = canvas.getByRole("alert");
    const textarea = canvas.getByRole("textbox", {
      name: "Message the assistant",
    });

    await expect(alert).toHaveTextContent(
      "You've reached the assistant request limit",
    );
    await expect(alert).toHaveTextContent("Try again in about");
    await expect(textarea).toBeEnabled();
    await userEvent.type(textarea, "Follow up");
    await expect(textarea).toHaveValue("Follow up");
    await expect(
      canvas.getByRole("button", { name: "Send message" }),
    ).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    await expect(args.onSubmit).not.toHaveBeenCalled();
    await expect(
      canvas.getByRole("button", { name: "Approve" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", {
        name: "Always approve for this conversation",
      }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Decline" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Start new conversation" }),
    ).toBeEnabled();
    await expect(
      canvas.getByRole("button", { name: /^Conversation history/ }),
    ).toBeEnabled();
  },
});

export const RefocusAfterSubmit = meta.story({
  name: "(Test) Refocus After Submit",
  args: {
    messages: [],
  },
  render: function Render(args) {
    const [isExpanded, setIsExpanded] = useState(args.isExpanded);
    const [
      isConversationInteractionDisabled,
      setIsConversationInteractionDisabled,
    ] = useState(false);
    const [messages, setMessages] = useState<InAppAgentWindowMessage[]>([
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Summarize the current trace.",
        },
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: {
          type: "text",
          text: "Assistant answer",
        },
      },
    ]);
    const handleExpandedChange = (isExpanded: boolean) => {
      setIsExpanded(isExpanded);
      args.onExpandedChange(isExpanded);
    };

    return (
      <InAppAgentWindowStoryShell
        isExpanded={isExpanded}
        onExpandedChange={handleExpandedChange}
      >
        {({ isHeaderDragHandleEnabled }) => (
          <InAppAgentWindow
            {...args}
            isHeaderDragHandleEnabled={isHeaderDragHandleEnabled}
            isExpanded={isExpanded}
            isConversationInteractionDisabled={
              isConversationInteractionDisabled
            }
            messages={messages}
            onExpandedChange={handleExpandedChange}
            onSubmit={(input) => {
              setIsConversationInteractionDisabled(true);
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
                setIsConversationInteractionDisabled(false);
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
    const answer = "Answer for: Check the latest latency regression";
    const previousAnswerCount = canvas.queryAllByText(answer).length;

    await expect(
      canvas.queryByText("Welcome to the Langfuse Assistant"),
    ).not.toBeInTheDocument();
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Check the latest latency regression");
    await userEvent.click(canvas.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(canvas.getAllByText(answer)).toHaveLength(previousAnswerCount + 1);
    });

    await waitFor(() => {
      expect(textarea).toHaveFocus();
    });
  },
});

export const FeedbackControlsWaitForTurnEnd = meta.story({
  name: "(Test) Feedback Controls Wait For Turn End",
  args: {
    selectedConversationId: "conversation-1",
    isConversationInteractionDisabled: true,
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
    const midTurnText =
      "I found a cluster of ingestion errors around malformed JSON payloads";

    expect(canvas.queryByText(midTurnText)).not.toBeInTheDocument();
    expect(
      canvas.queryByRole("button", { name: "Good response" }),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole("button", { name: "Bad response" }),
    ).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Working…" }));
    await expect(canvas.getByText(midTurnText)).toBeVisible();
    expect(
      canvas.queryByRole("button", { name: "Good response" }),
    ).not.toBeInTheDocument();
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

export const ProjectedMessageSubmitsFeedbackToSource = meta.story({
  name: "(Test) Projected Message Submits Feedback To Source",
  args: {
    selectedConversationId: "conversation-1",
    isAssistantTurnInProgress: false,
    onSubmitFeedback: fn(),
    // Two projected blocks join into one answer, and only the first carries the
    // persisted id: feedback still has to reach that source message.
    messages: [
      {
        id: "display-text-assistant-1-1",
        feedbackMessageId: "assistant-1",
        runId: "run-1",
        role: "assistant",
        content: {
          type: "text",
          text: "The errors were caused by malformed JSON payloads.",
        },
      },
      {
        id: "display-text-assistant-1-2",
        runId: "run-1",
        role: "assistant",
        content: {
          type: "text",
          text: "Retrying them after the fix cleared the backlog.",
        },
      },
    ],
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const goodResponseButton = await canvas.findByRole("button", {
      name: "Good response",
    });

    await expect(
      canvas.getAllByRole("button", { name: "Copy message" }),
    ).toHaveLength(1);

    await userEvent.click(goodResponseButton);
    await expect(args.onSubmitFeedback).toHaveBeenCalledWith({
      messageId: "assistant-1",
      runId: "run-1",
      value: "thumbs_up",
      comment: null,
    });
  },
});

export const AlwaysApprovesWithHiddenParallelCall = meta.story({
  name: "(Test) Always Approves With Hidden Parallel Call",
  args: {
    selectedConversationId: "conversation-1",
    isAssistantTurnInProgress: true,
    onAlwaysAllowToolCall: fn(() => new Promise<void>(() => undefined)),
    messages: getDrawerMessages({
      error: null,
      isRunning: false,
      messages: [
        {
          id: "assistant-approval",
          role: "assistant",
          content: "I need approval before creating these resources.",
          toolCalls: [
            {
              id: "approval-1",
              type: "function",
              function: {
                name: "langfuse_createTextPrompt",
                arguments: '{"name":"approved-prompt"}',
              },
            },
            {
              id: "deferred-sibling",
              type: "function",
              function: {
                name: "langfuse_createDashboardWidget",
                arguments: '{"name":"deferred-widget"}',
              },
            },
          ],
        },
      ],
      pendingToolApprovals: [
        {
          id: "approval-1",
          status: "pending",
          runId: "run-1",
          approvalRequest: {
            type: "tool_approval_request",
            toolCallId: "approval-1",
            toolName: "langfuse_createTextPrompt",
            runId: "run-1",
          },
        },
      ],
    }),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const approve = canvas.getByRole("button", { name: "Approve" });
    const alwaysApprove = canvas.getByRole("button", {
      name: "Always approve for this conversation",
    });
    const decline = canvas.getByRole("button", { name: "Decline" });

    await expect(
      canvas.queryByLabelText(/^createDashboardWidget:/),
    ).not.toBeInTheDocument();
    await userEvent.click(alwaysApprove);

    await expect(args.onAlwaysAllowToolCall).toHaveBeenCalledOnce();
    await expect(args.onAlwaysAllowToolCall).toHaveBeenCalledWith("approval-1");
    await expect(alwaysApprove).toHaveAttribute("aria-busy", "true");
    await expect(approve).toBeDisabled();
    await expect(alwaysApprove).toBeDisabled();
    await expect(decline).toBeDisabled();
  },
});

export const ContinuedToolResultRendersOnce = meta.story({
  name: "(Test) Continued Tool Result Renders Once",
  args: {
    selectedConversationId: "conversation-1",
    isAssistantTurnInProgress: false,
    messages: getDrawerMessages({
      error: null,
      isRunning: false,
      messages: projectInAppAgentMessagesForDisplay(
        [
          {
            id: "assistant-proposal",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "tool-call-1",
                type: "function",
                function: {
                  name: "langfuse_createDashboardWidget",
                  arguments: '{"name":"Cost over time"}',
                },
              },
            ],
          },
          {
            id: "tool-call-1-approval-tool-call",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "tool-call-1",
                type: "function",
                function: {
                  name: "langfuse_createDashboardWidget",
                  arguments: '{"name":"Changed by continuation"}',
                },
              },
            ],
          },
          {
            id: "tool-call-1-approval-tool-result",
            role: "tool",
            toolCallId: "tool-call-1",
            content: '{"id":"widget-1"}',
          },
        ] satisfies AgUiMessage[],
        createInAppAgentDisplayState(),
      ),
    }),
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.queryByText("Called 2 tools")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Activity" }));
    await expect(
      canvas.getAllByLabelText("createDashboardWidget: succeeded"),
    ).toHaveLength(1);
    await userEvent.click(
      canvas.getByLabelText("createDashboardWidget: succeeded"),
    );
    await expect(canvas.getByText(/Cost over time/)).toBeInTheDocument();
    await expect(
      canvas.queryByText(/Changed by continuation/),
    ).not.toBeInTheDocument();
  },
});

export const RedirectStaysActionableAfterMoreThinking = meta.story({
  name: "(Test) Redirect Stays Actionable After More Thinking",
  args: {
    selectedConversationId: "conversation-1",
    messages: [
      {
        id: "user-1",
        role: "user",
        content: { type: "text", text: "Take me to the failing traces." },
      },
      {
        id: "assistant-reasoning-1",
        timestamp: new Date("2026-08-06T15:26:26.000Z").getTime(),
        role: "assistant",
        content: {
          type: "reasoning",
          text: "The error traces view is the right destination.",
          isStreaming: false,
        },
      },
      {
        id: "assistant-redirect",
        role: "assistant",
        content: {
          type: "redirectAction",
          label: "Open error traces",
          href: "/project/project-1/traces?level=ERROR",
        },
      },
      {
        // A redirect tool result merges into a preceding text block rather than
        // arriving standalone whenever there is one to merge into.
        id: "assistant-ack",
        role: "assistant",
        content: {
          type: "text",
          text: "The dashboard shows the same spike.",
          redirectAction: {
            type: "redirectAction",
            label: "Open the latency dashboard",
            href: "/project/project-1/dashboards/latency",
          },
        },
      },
      {
        id: "assistant-reasoning-2",
        role: "assistant",
        content: {
          type: "reasoning",
          text: "I should also explain what they will see.",
          isStreaming: false,
        },
      },
      {
        id: "assistant-answer",
        runId: "run-1",
        timestamp: new Date("2026-08-06T15:27:17.000Z").getTime(),
        role: "assistant",
        content: { type: "text", text: "These are all timeouts." },
      },
    ],
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    // The drawer stays collapsed, so a redirect parked inside it would be lost,
    // whether it arrived standalone or merged into a mid-turn text block.
    const drawer = canvas.getByRole("button", { name: /Worked for/ });
    await expect(drawer).toHaveAttribute("aria-expanded", "false");
    await expect(
      canvas.getByRole("button", { name: "Open the latency dashboard" }),
    ).toBeVisible();

    // ...and opening the drawer must not offer the same action a second time.
    await userEvent.click(drawer);
    await expect(
      canvas.getAllByRole("button", { name: "Open the latency dashboard" }),
    ).toHaveLength(1);
  },
});

export const SourcesReachTheSettledAnswer = meta.story({
  name: "(Test) Sources Reach The Settled Answer",
  args: {
    selectedConversationId: "conversation-1",
    messages: [
      {
        id: "user-1",
        role: "user",
        content: { type: "text", text: "How do I mask trace input?" },
      },
      {
        id: "assistant-ack",
        timestamp: new Date("2026-08-06T15:26:26.000Z").getTime(),
        role: "assistant",
        content: {
          type: "text",
          text: "The docs cover masking.",
          sources: [
            {
              title: "Masking",
              url: "https://langfuse.com/docs/observability/features/masking",
              faviconUrl: "https://langfuse.com/favicon.ico",
            },
          ],
        },
      },
      {
        id: "assistant-reasoning",
        role: "assistant",
        content: {
          type: "reasoning",
          text: "Now I can summarise the masking setup.",
          isStreaming: false,
        },
      },
      {
        id: "assistant-answer",
        runId: "run-1",
        timestamp: new Date("2026-08-06T15:27:17.000Z").getTime(),
        role: "assistant",
        content: { type: "text", text: "Set a mask function on the SDK." },
      },
    ],
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    // The citation was earned by an intermediate block that lives in the
    // collapsed drawer; it has to travel to the answer the user is reading.
    await userEvent.click(canvas.getByRole("button", { name: "Sources" }));
    // The popover portals into a layer container outside the canvas.
    const source = await screen.findByRole("link", { name: /Masking/ });
    await waitFor(() => expect(source).toBeVisible());
    await expect(source).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/observability/features/masking",
    );
  },
});

// Enough turns to overflow the conversation viewport so real scrolling happens.
const scrollableTranscript: InAppAgentWindowMessage[] = Array.from(
  { length: 12 },
  (_, index): InAppAgentWindowMessage => ({
    id: `scroll-${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content: {
      type: "text",
      text:
        index % 2 === 0
          ? `Question ${index / 2 + 1} about the latency regression.`
          : `Finding ${(index + 1) / 2}: the reranker dominates p95 for this segment, and the effect persists across retries.`,
    },
  }),
);

/**
 * The scroller is a plain overflow container with no role of its own, and
 * `overscroll-contain` is what distinguishes it from the composer textarea.
 */
function getConversationViewport(canvasElement: HTMLElement) {
  const viewport = canvasElement.querySelector<HTMLElement>(
    ".overscroll-contain",
  );

  if (!viewport) {
    // `globalThis` because the Error story shadows the constructor here.
    throw new globalThis.Error("Expected the assistant conversation viewport");
  }

  return viewport;
}

// Mirrors AUTO_SCROLL_THRESHOLD_PX in the component.
function isViewportAtBottom(viewport: HTMLElement) {
  return (
    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 50
  );
}

export const LatestReattachesAutoFollow = meta.story({
  name: "(Test) Latest Reattaches Auto Follow",
  args: {
    selectedConversationId: "conversation-1",
    messages: scrollableTranscript,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const viewport = getConversationViewport(canvasElement);
    const latest = { name: "Scroll to latest message" };

    // Mounting pins us to the newest message, so there is nothing to catch up to.
    await waitFor(() => expect(isViewportAtBottom(viewport)).toBe(true));
    await expect(canvas.queryByRole("button", latest)).not.toBeInTheDocument();

    viewport.scrollTop = 0;
    await waitFor(() =>
      expect(canvas.getByRole("button", latest)).toBeVisible(),
    );

    await userEvent.click(canvas.getByRole("button", latest));

    // The pill hides the moment we start travelling, so the smooth scroll's
    // intermediate positions cannot make it flicker back in.
    await expect(canvas.queryByRole("button", latest)).not.toBeInTheDocument();
    await waitFor(() => expect(isViewportAtBottom(viewport)).toBe(true));
    await expect(canvas.queryByRole("button", latest)).not.toBeInTheDocument();
  },
});

export const LatestHidesWhenTheDrawerCollapses = meta.story({
  name: "(Test) Latest Hides When The Drawer Collapses",
  args: {
    selectedConversationId: "conversation-1",
    messages: [
      {
        id: "user-1",
        role: "user",
        content: { type: "text", text: "What changed yesterday?" },
      },
      {
        id: "assistant-reasoning",
        timestamp: new Date("2026-08-06T15:26:26.000Z").getTime(),
        role: "assistant",
        content: {
          type: "reasoning",
          // Long enough that expanding the drawer overflows the viewport and
          // collapsing it fits again.
          text: Array.from(
            { length: 40 },
            (_, index) =>
              `Step ${index + 1}: compare yesterday's dashboard against the trailing week.`,
          ).join("\n"),
          isStreaming: false,
        },
      },
      {
        id: "assistant-answer",
        runId: "run-1",
        timestamp: new Date("2026-08-06T15:27:17.000Z").getTime(),
        role: "assistant",
        content: {
          type: "text",
          text: "Yesterday's latency dashboard picked up a reranking spike.",
        },
      },
    ],
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const viewport = getConversationViewport(canvasElement);
    const latest = { name: "Scroll to latest message" };

    const drawer = canvas.getByRole("button", { name: /Worked for/ });
    await expect(canvas.queryByRole("button", latest)).not.toBeInTheDocument();

    // Read to the end of the opened drawer, then scroll back up. Going down
    // first is what makes the scroll position actually change on the way up.
    await userEvent.click(drawer);
    await userEvent.click(canvas.getByText("Thought"));
    viewport.scrollTop = viewport.scrollHeight;
    await waitFor(() => expect(viewport.scrollTop).toBeGreaterThan(0));

    viewport.scrollTop = 0;
    await waitFor(() =>
      expect(canvas.getByRole("button", latest)).toBeVisible(),
    );

    // Collapsing shrinks the transcript back under the viewport without any
    // scroll event, so only the resize observer can retire the pill.
    await userEvent.click(drawer);
    await waitFor(() =>
      expect(canvas.queryByRole("button", latest)).not.toBeInTheDocument(),
    );
  },
});

export const SendingReattachesAutoFollow = meta.story({
  name: "(Test) Sending Reattaches Auto Follow",
  args: {
    selectedConversationId: "conversation-1",
    messages: scrollableTranscript,
  },
  render: function Render(args) {
    const [messages, setMessages] = useState(args.messages);

    return (
      <InAppAgentWindowStoryShell
        isExpanded={args.isExpanded}
        onExpandedChange={args.onExpandedChange}
      >
        {({ isHeaderDragHandleEnabled }) => (
          <InAppAgentWindow
            {...args}
            isHeaderDragHandleEnabled={isHeaderDragHandleEnabled}
            messages={messages}
            onSubmit={(input) => {
              // The real provider appends a placeholder behind the user
              // message, so the newest message is not the one that was sent.
              setMessages((currentMessages) => [
                ...currentMessages,
                {
                  id: `sent-${currentMessages.length}`,
                  role: "user",
                  content: { type: "text", text: input },
                },
                {
                  id: `connecting-${currentMessages.length}`,
                  role: "assistant",
                  content: { type: "loading", label: "Connecting..." },
                },
              ]);
              return true;
            }}
          />
        )}
      </InAppAgentWindowStoryShell>
    );
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const viewport = getConversationViewport(canvasElement);
    const latest = { name: "Scroll to latest message" };

    viewport.scrollTop = 0;
    await waitFor(() =>
      expect(canvas.getByRole("button", latest)).toBeVisible(),
    );

    await userEvent.type(
      canvas.getByRole("textbox", { name: "Message the assistant" }),
      "And the error rate?",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Send message" }));

    // Saying something is a request to follow along again.
    await waitFor(() =>
      expect(canvas.queryByRole("button", latest)).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(isViewportAtBottom(viewport)).toBe(true));
  },
});
