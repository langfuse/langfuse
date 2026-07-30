import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { HttpAgent, type AgentSubscriber } from "@ag-ui/client";
import { InAppAgentRunStatus } from "@langfuse/shared";
import type { AgUiMessage } from "@langfuse/shared/in-app-agent";
import {
  createInAppAgentDisplayState,
  InAppAiAgentProvider,
  projectInAppAgentMessagesForDisplay,
  recordInAppAgentMessagesForDisplay,
  recordInAppAgentToolCallForDisplay,
  useInAppAiAgent,
} from "./InAppAiAgentProvider";

const providerMocks = vi.hoisted(() => ({
  backgroundExecutionEnabled: false,
  capture: vi.fn(),
  startRun: vi.fn(),
  cancelRun: vi.fn(),
  decideToolApproval: vi.fn(),
  getConversation: vi.fn(),
  listQuery: {
    data: { pages: [{ conversations: [] }] },
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  },
  conversationQuery: {
    data: undefined as
      | undefined
      | {
          conversation: { id: string; isWriteLocked: boolean };
          messages: AgUiMessage[];
          eventCursor: number;
          latestRun: {
            id: string;
            status: InAppAgentRunStatus;
            errorCode: string | null;
            cancelRequested: boolean;
          } | null;
          pendingToolApprovals: Array<{
            runId: string;
            approvalRequest: {
              type: "tool_approval_request";
              toolCallId: string;
              toolName: string;
              runId: string;
            };
          }>;
        },
    error: null,
    isLoading: false,
  },
  utils: {
    inAppAgent: {
      getConversation: {
        fetch: vi.fn(),
        invalidate: vi.fn(),
      },
      listConversations: {
        invalidate: vi.fn(),
      },
    },
  },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    asPath: "/project/project-1/traces",
    query: { projectId: "project-1" },
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Test User" } } }),
}));

vi.mock("@/src/features/entitlements/hooks", () => ({
  useHasEntitlement: () => true,
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProjectOrOrganization: () => ({
    organization: { aiFeaturesEnabled: true },
  }),
}));

vi.mock("@/src/features/in-app-agent/lib/backgroundExecutionFlag", () => ({
  useInAppAgentBackgroundExecutionEnabled: () =>
    providerMocks.backgroundExecutionEnabled,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => providerMocks.capture,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => providerMocks.utils,
    inAppAgent: {
      listConversations: {
        useInfiniteQuery: () => providerMocks.listQuery,
      },
      getConversation: {
        useQuery: () => providerMocks.conversationQuery,
      },
      deleteConversation: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
      submitFeedback: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
      startRun: {
        useMutation: () => ({ mutateAsync: providerMocks.startRun }),
      },
      cancelRun: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: providerMocks.cancelRun,
        }),
      },
      decideToolApproval: {
        useMutation: () => ({
          mutateAsync: providerMocks.decideToolApproval,
        }),
      },
    },
  },
}));

const assistantToolMessage = {
  id: "assistant-tools",
  role: "assistant",
  content: "",
  toolCalls: ["tool-1", "tool-2", "tool-3"].map((toolCallId) => ({
    id: toolCallId,
    type: "function" as const,
    function: {
      name: `tool-${toolCallId}`,
      arguments: "{}",
    },
  })),
} satisfies AgUiMessage;

function ForegroundExecutionProbe() {
  const agent = useInAppAiAgent();

  return (
    <>
      <output data-testid="execution-type">{agent.execution.type}</output>
      <output data-testid="is-running">{String(agent.isRunning)}</output>
      <output data-testid="approval-count">
        {agent.pendingToolApprovals.length}
      </output>
      <output data-testid="message-ids">
        {agent.messages.map((message) => message.id).join(",")}
      </output>
      <button
        type="button"
        onClick={() => {
          agent.submit("Investigate this project").catch(() => undefined);
        }}
      >
        Submit
      </button>
      <button
        type="button"
        onClick={() => {
          agent.approveToolCall("tool-call-1").catch(() => undefined);
        }}
      >
        Approve
      </button>
    </>
  );
}

describe("InAppAiAgentProvider foreground execution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    providerMocks.backgroundExecutionEnabled = false;
    providerMocks.conversationQuery.data = undefined;
    window.sessionStorage.clear();
  });

  it("keeps the default transport and approval lifecycle independent of background execution", async () => {
    let subscriber: AgentSubscriber | undefined;
    const runAgent = vi
      .spyOn(HttpAgent.prototype, "runAgent")
      .mockResolvedValue({ result: undefined, newMessages: [] });
    const abortRun = vi.spyOn(HttpAgent.prototype, "abortRun");
    vi.spyOn(HttpAgent.prototype, "subscribe").mockImplementation(
      (nextSubscriber: AgentSubscriber) => {
        subscriber = nextSubscriber;
        return { unsubscribe: vi.fn() };
      },
    );

    const { unmount } = render(
      <InAppAiAgentProvider defaultOpen>
        <ForegroundExecutionProbe />
      </InAppAiAgentProvider>,
    );

    expect(screen.getByTestId("execution-type")).toHaveTextContent(
      "foreground",
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(runAgent).toHaveBeenCalledOnce();
    });
    expect(providerMocks.startRun).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId("is-running")).toHaveTextContent("false");
    });

    await act(async () => {
      await subscriber?.onCustomEvent?.({
        event: {
          name: "on_interrupt",
          value: {
            type: "mastra_suspend",
            toolCallId: "tool-call-1",
            toolName: "dangerousTool",
            runId: "run-1",
          },
        },
      } as never);
    });
    expect(screen.getByTestId("approval-count")).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => {
      expect(runAgent).toHaveBeenCalledTimes(2);
    });

    unmount();
    expect(abortRun).toHaveBeenCalled();
  });

  it("renders one coherent persisted background transcript and approval view", async () => {
    providerMocks.backgroundExecutionEnabled = true;
    providerMocks.conversationQuery.data = {
      conversation: {
        id: "conversation-1",
        isWriteLocked: false,
      },
      messages: [
        {
          id: "persisted-user",
          role: "user",
          content: "Create the prompt",
        },
        {
          id: "persisted-assistant",
          role: "assistant",
          content: "I need approval.",
        },
      ],
      eventCursor: 12,
      latestRun: {
        id: "run-1",
        status: InAppAgentRunStatus.AWAITING_APPROVAL,
        errorCode: null,
        cancelRequested: false,
      },
      pendingToolApprovals: [
        {
          runId: "run-1",
          approvalRequest: {
            type: "tool_approval_request",
            toolCallId: "tool-call-1",
            toolName: "langfuse_createTextPrompt",
            runId: "run-1",
          },
        },
      ],
    };
    window.sessionStorage.setItem(
      "langfuse:in-app-ai-agent-selected-conversation:project-1",
      JSON.stringify("conversation-1"),
    );

    render(
      <InAppAiAgentProvider defaultOpen>
        <ForegroundExecutionProbe />
      </InAppAiAgentProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("execution-type")).toHaveTextContent(
        "background",
      );
    });
    expect(screen.getByTestId("message-ids")).toHaveTextContent(
      "persisted-user,persisted-assistant",
    );
    expect(screen.getByTestId("approval-count")).toHaveTextContent("1");
  });
});

describe("in-app agent display order", () => {
  it("keeps consecutive tool calls with the same parent together", () => {
    const assistantMessage = {
      id: "assistant-tools",
      role: "assistant",
      content: "I'll query both periods.",
    } satisfies AgUiMessage;
    const initialMessages = [
      {
        id: "user",
        role: "user",
        content: "Compare both weeks",
      },
      assistantMessage,
    ] satisfies AgUiMessage[];
    const messagesWithBothTools = [
      initialMessages[0],
      {
        ...assistantMessage,
        toolCalls: assistantToolMessage.toolCalls.slice(0, 2),
      },
    ] satisfies AgUiMessage[];
    let displayState = createInAppAgentDisplayState();
    displayState = recordInAppAgentMessagesForDisplay(
      displayState,
      initialMessages,
    );
    displayState = recordInAppAgentToolCallForDisplay(
      displayState,
      "tool-1",
      "assistant-tools",
    );
    displayState = recordInAppAgentToolCallForDisplay(
      displayState,
      "tool-2",
      "assistant-tools",
    );
    displayState = recordInAppAgentMessagesForDisplay(
      displayState,
      messagesWithBothTools,
    );

    const projectedMessages = projectInAppAgentMessagesForDisplay(
      messagesWithBothTools,
      displayState,
    );

    expect(
      projectedMessages.map((message) => ({
        id: message.id,
        toolCallIds:
          message.role === "assistant"
            ? message.toolCalls?.map((toolCall) => toolCall.id)
            : undefined,
      })),
    ).toEqual([
      { id: "user", toolCallIds: undefined },
      { id: "assistant-tools", toolCallIds: ["tool-1", "tool-2"] },
    ]);
  });

  it("projects interleaved tools without changing canonical messages", () => {
    const messages = [
      {
        id: "user",
        role: "user",
        content: "Investigate this",
      },
      assistantToolMessage,
      {
        id: "result-tool-1",
        role: "tool",
        toolCallId: "tool-1",
        content: "done",
      },
      {
        id: "interleaved-assistant",
        role: "assistant",
        content: "Checking another angle.",
      },
      {
        id: "interleaved-reasoning",
        role: "reasoning",
        content: "I should run another tool.",
      },
    ] satisfies AgUiMessage[];
    let displayState = createInAppAgentDisplayState();
    displayState = recordInAppAgentMessagesForDisplay(displayState, [
      messages[0],
      {
        ...assistantToolMessage,
        toolCalls: [assistantToolMessage.toolCalls[0]],
      },
    ]);
    displayState = recordInAppAgentToolCallForDisplay(
      displayState,
      "tool-1",
      "assistant-tools",
    );
    displayState = recordInAppAgentMessagesForDisplay(
      displayState,
      messages.slice(0, 4),
    );
    displayState = recordInAppAgentToolCallForDisplay(
      displayState,
      "tool-2",
      "assistant-tools",
    );
    displayState = recordInAppAgentMessagesForDisplay(displayState, messages);
    displayState = recordInAppAgentToolCallForDisplay(
      displayState,
      "tool-3",
      "assistant-tools",
    );

    const projectedMessages = projectInAppAgentMessagesForDisplay(
      messages,
      displayState,
    );

    expect(
      projectedMessages.map((message) => ({
        id: message.id,
        toolCallIds:
          message.role === "assistant"
            ? message.toolCalls?.map((toolCall) => toolCall.id)
            : undefined,
      })),
    ).toEqual([
      { id: "user", toolCallIds: undefined },
      { id: "assistant-tools", toolCallIds: ["tool-1"] },
      { id: "result-tool-1", toolCallIds: undefined },
      { id: "interleaved-assistant", toolCallIds: undefined },
      {
        id: "display-tool-tool-2",
        toolCallIds: ["tool-2"],
      },
      { id: "interleaved-reasoning", toolCallIds: undefined },
      {
        id: "display-tool-tool-3",
        toolCallIds: ["tool-3"],
      },
    ]);
    expect(
      assistantToolMessage.toolCalls.map((toolCall) => toolCall.id),
    ).toEqual(["tool-1", "tool-2", "tool-3"]);
  });

  it("splits text appended after a later reasoning message", () => {
    const firstMessages = [
      {
        id: "reasoning-1",
        role: "reasoning",
        content: "First thought.",
      },
      {
        id: "assistant-continuation",
        role: "assistant",
        content: "First answer.",
        runId: "run-1",
        feedback: { value: "thumbs_up", comment: null },
      },
    ] satisfies AgUiMessage[];
    const reasoningMessages = firstMessages.concat({
      id: "reasoning-2",
      role: "reasoning",
      content: "Second thought.",
    } satisfies AgUiMessage);
    const canonicalMessages = reasoningMessages.map((message) =>
      message.id === "assistant-continuation"
        ? { ...message, content: "First answer. Second answer." }
        : message,
    );
    let displayState = createInAppAgentDisplayState();
    displayState = recordInAppAgentMessagesForDisplay(
      displayState,
      firstMessages,
    );
    displayState = recordInAppAgentMessagesForDisplay(
      displayState,
      reasoningMessages,
    );
    displayState = recordInAppAgentMessagesForDisplay(
      displayState,
      canonicalMessages,
    );
    const finalMessages = canonicalMessages.map((message) =>
      message.id === "assistant-continuation"
        ? { ...message, content: `${message.content} Third answer.` }
        : message,
    );
    displayState = recordInAppAgentMessagesForDisplay(
      displayState,
      finalMessages,
    );

    const projectedMessages = projectInAppAgentMessagesForDisplay(
      finalMessages,
      displayState,
    );

    expect(
      projectedMessages.map((message) => ({
        id: message.id,
        content: message.content,
        ...(message.role === "assistant"
          ? {
              runId: message.runId,
              feedback: message.feedback,
              feedbackMessageId: message.feedbackMessageId,
            }
          : {}),
      })),
    ).toEqual([
      { id: "reasoning-1", content: "First thought." },
      {
        id: "assistant-continuation",
        content: "First answer.",
        runId: "run-1",
        feedback: { value: "thumbs_up", comment: null },
        feedbackMessageId: undefined,
      },
      { id: "reasoning-2", content: "Second thought." },
      {
        id: "display-text-assistant-continuation-1",
        content: " Second answer. Third answer.",
        runId: "run-1",
        feedback: { value: "thumbs_up", comment: null },
        feedbackMessageId: "assistant-continuation",
      },
    ]);
    expect(canonicalMessages[1]?.content).toBe("First answer. Second answer.");
  });
});
