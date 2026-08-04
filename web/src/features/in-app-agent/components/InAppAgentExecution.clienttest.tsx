import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { HttpAgent, type AgentSubscriber } from "@ag-ui/client";
import { EventType } from "@ag-ui/core";
import { InAppAgentRunErrorCode, InAppAgentRunStatus } from "@langfuse/shared";
import type { AgUiMessage } from "@langfuse/shared/in-app-agent";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { ControlledInAppAgentWindow } from "./ControlledInAppAgentWindow";
import { InAppAiAgentProvider } from "./InAppAiAgentProvider";
import styles from "./InAppAgentWindow.module.css";

const providerMocks = vi.hoisted(() => {
  const startRun = vi.fn();
  const cancelRun = vi.fn();
  const decideToolApproval = vi.fn();

  return {
    backgroundExecutionEnabled: false,
    capture: vi.fn(),
    startRun,
    cancelRun,
    decideToolApproval,
    mutations: {
      startRun: { mutateAsync: startRun },
      cancelRun: { isPending: false, mutateAsync: cancelRun },
      decideToolApproval: { mutateAsync: decideToolApproval },
    },
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
            displayState?: unknown;
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
  };
});

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
        useMutation: () => providerMocks.mutations.startRun,
      },
      cancelRun: {
        useMutation: () => providerMocks.mutations.cancelRun,
      },
      decideToolApproval: {
        useMutation: () => providerMocks.mutations.decideToolApproval,
      },
    },
  },
}));

Element.prototype.scrollTo = vi.fn();

function sseFrame(frame: unknown): string {
  return `data: ${JSON.stringify(frame)}\n\n`;
}

function renderExecutionUi() {
  return render(
    <TooltipProvider>
      <InAppAiAgentProvider defaultOpen>
        <ControlledInAppAgentWindow
          isExpanded={false}
          onDeleteConversation={vi.fn()}
          onExpandedChange={vi.fn()}
          showCloseButton={false}
        />
      </InAppAiAgentProvider>
    </TooltipProvider>,
  );
}

function queryActivityIndicator() {
  return document.querySelector(`.${styles.loadingGradient}`);
}

describe("in-app agent execution", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    providerMocks.backgroundExecutionEnabled = false;
    providerMocks.conversationQuery.data = undefined;
    window.sessionStorage.clear();
  });

  it("keeps foreground submission and approval working when background execution is disabled", async () => {
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

    const { unmount } = renderExecutionUi();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /stop run/i }),
    ).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Message the assistant" }),
      { target: { value: "Investigate this project" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(runAgent).toHaveBeenCalledOnce();
    });
    expect(providerMocks.startRun).not.toHaveBeenCalled();

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

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Confirm",
      }),
    );
    await waitFor(() => {
      expect(runAgent).toHaveBeenCalledTimes(2);
    });

    unmount();
    expect(abortRun).toHaveBeenCalled();
  });

  it("renders persisted background messages and approval actions in the drawer", async () => {
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

    renderExecutionUi();

    expect(await screen.findByText("Create the prompt")).toBeInTheDocument();
    expect(screen.getByText("I need approval.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Confirm",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Reject",
      }),
    ).toBeInTheDocument();
  });

  it("settles the drawer without restarting its activity state after Stop", async () => {
    providerMocks.backgroundExecutionEnabled = true;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    const initialText = "I found the affected traces.";
    const finalText = "The remaining analysis was cancelled before completion.";
    const runningSnapshot = {
      conversation: { id: "conversation-1", isWriteLocked: false },
      messages: [
        { id: "persisted-user", role: "user", content: "Investigate this" },
        {
          id: "persisted-assistant",
          role: "assistant",
          content: initialText,
        },
      ] satisfies AgUiMessage[],
      eventCursor: 5,
      latestRun: {
        id: "run-1",
        status: InAppAgentRunStatus.RUNNING,
        errorCode: null,
        cancelRequested: false,
      },
      pendingToolApprovals: [],
    };
    const cancellingSnapshot = {
      ...runningSnapshot,
      latestRun: { ...runningSnapshot.latestRun, cancelRequested: true },
    };
    const cancelledSnapshot = {
      ...runningSnapshot,
      messages: [
        ...runningSnapshot.messages,
        { id: "cancelled-assistant", role: "assistant", content: finalText },
      ] satisfies AgUiMessage[],
      eventCursor: 10,
      latestRun: {
        ...runningSnapshot.latestRun,
        status: InAppAgentRunStatus.CANCELLED,
        errorCode: InAppAgentRunErrorCode.CANCELLED,
        cancelRequested: true,
      },
    };

    providerMocks.conversationQuery.data = runningSnapshot;
    providerMocks.cancelRun.mockResolvedValue({
      cancelledImmediately: false,
      status: InAppAgentRunStatus.RUNNING,
    });
    providerMocks.utils.inAppAgent.getConversation.fetch
      .mockResolvedValueOnce(runningSnapshot)
      .mockResolvedValueOnce(cancellingSnapshot)
      .mockResolvedValueOnce(cancelledSnapshot);

    let resolveTerminalWatch: (response: Response) => void = () => undefined;
    const watchFetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                reject(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveTerminalWatch = resolve;
          }),
      );
    const terminalWatchResponse = new Response(
      [
        sseFrame({
          type: "event",
          sequenceNumber: 6,
          event: {
            type: EventType.RUN_STARTED,
            runId: "run-1",
            threadId: "conversation-1",
          },
        }),
        sseFrame({
          type: "event",
          sequenceNumber: 7,
          event: {
            type: EventType.TEXT_MESSAGE_START,
            messageId: "cancelled-assistant",
            role: "assistant",
          },
        }),
        sseFrame({
          type: "event",
          sequenceNumber: 8,
          event: {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: "cancelled-assistant",
            delta: finalText,
          },
        }),
        sseFrame({
          type: "event",
          sequenceNumber: 9,
          event: {
            type: EventType.TEXT_MESSAGE_END,
            messageId: "cancelled-assistant",
          },
        }),
        sseFrame({
          type: "event",
          sequenceNumber: 10,
          event: {
            type: EventType.RUN_FINISHED,
            runId: "run-1",
            threadId: "conversation-1",
          },
        }),
        sseFrame({
          type: "status",
          runId: "run-1",
          status: InAppAgentRunStatus.CANCELLED,
          errorCode: InAppAgentRunErrorCode.CANCELLED,
          cancelRequested: true,
        }),
        sseFrame({ type: "done" }),
      ].join(""),
    );

    window.sessionStorage.setItem(
      "langfuse:in-app-ai-agent-selected-conversation:project-1",
      JSON.stringify("conversation-1"),
    );
    renderExecutionUi();

    await waitFor(() => {
      expect(watchFetch).toHaveBeenCalledOnce();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Stop run",
      }),
    );

    await waitFor(() => {
      expect(watchFetch).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      resolveTerminalWatch(terminalWatchResponse);
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /stopp?ing run/i }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText(finalText)).toBeVisible();
    expect(
      screen.getByText("The assistant is aware of this trace view."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Good response" })).toBeVisible();
  });

  it("settles a newly submitted run as soon as Stop receives a terminal status", async () => {
    providerMocks.backgroundExecutionEnabled = true;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    const finalText = "The investigation was cancelled before it completed.";
    providerMocks.conversationQuery.data = {
      conversation: { id: "conversation-1", isWriteLocked: false },
      messages: [],
      eventCursor: -1,
      latestRun: null,
      pendingToolApprovals: [],
    };
    const cancellingSnapshot = {
      conversation: { id: "conversation-1", isWriteLocked: false },
      messages: [
        { id: "persisted-user", role: "user", content: "Investigate this" },
      ] satisfies AgUiMessage[],
      eventCursor: -1,
      latestRun: {
        id: "run-1",
        status: InAppAgentRunStatus.RUNNING,
        errorCode: null,
        cancelRequested: true,
      },
      pendingToolApprovals: [],
    };
    const cancelledSnapshot = {
      ...cancellingSnapshot,
      messages: [
        ...cancellingSnapshot.messages,
        { id: "persisted-assistant", role: "assistant", content: finalText },
      ] satisfies AgUiMessage[],
      eventCursor: 4,
      latestRun: {
        ...cancellingSnapshot.latestRun,
        status: InAppAgentRunStatus.CANCELLED,
        errorCode: InAppAgentRunErrorCode.CANCELLED,
      },
    };
    providerMocks.startRun
      .mockResolvedValueOnce({ runId: "run-1" })
      .mockResolvedValueOnce({ runId: "run-2" });
    providerMocks.cancelRun.mockResolvedValue({
      cancelledImmediately: false,
      status: InAppAgentRunStatus.RUNNING,
    });
    providerMocks.utils.inAppAgent.getConversation.fetch
      .mockResolvedValueOnce(cancellingSnapshot)
      .mockResolvedValueOnce(cancelledSnapshot);

    const encoder = new TextEncoder();
    let watchRequestCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      watchRequestCount += 1;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              watchRequestCount === 1
                ? sseFrame({
                    type: "status",
                    runId: "run-1",
                    status: InAppAgentRunStatus.RUNNING,
                    errorCode: null,
                    cancelRequested: false,
                  })
                : watchRequestCount === 2
                  ? [
                      sseFrame({
                        type: "event",
                        sequenceNumber: 0,
                        event: {
                          type: EventType.RUN_STARTED,
                          runId: "run-1",
                          threadId: "conversation-1",
                        },
                      }),
                      sseFrame({
                        type: "event",
                        sequenceNumber: 1,
                        event: {
                          type: EventType.TEXT_MESSAGE_START,
                          messageId: "persisted-assistant",
                          role: "assistant",
                        },
                      }),
                      sseFrame({
                        type: "event",
                        sequenceNumber: 2,
                        event: {
                          type: EventType.TEXT_MESSAGE_CONTENT,
                          messageId: "persisted-assistant",
                          delta: finalText,
                        },
                      }),
                      sseFrame({
                        type: "event",
                        sequenceNumber: 3,
                        event: {
                          type: EventType.TEXT_MESSAGE_END,
                          messageId: "persisted-assistant",
                        },
                      }),
                      sseFrame({
                        type: "event",
                        sequenceNumber: 4,
                        event: {
                          type: EventType.RUN_FINISHED,
                          runId: "run-1",
                          threadId: "conversation-1",
                        },
                      }),
                      sseFrame({
                        type: "status",
                        runId: "run-1",
                        status: InAppAgentRunStatus.CANCELLED,
                        errorCode: InAppAgentRunErrorCode.CANCELLED,
                        cancelRequested: true,
                      }),
                    ].join("")
                  : sseFrame({
                      type: "status",
                      runId: "run-2",
                      status: InAppAgentRunStatus.RUNNING,
                      errorCode: null,
                      cancelRequested: false,
                    }),
            ),
          );
          init?.signal?.addEventListener(
            "abort",
            () => {
              controller.close();
            },
            { once: true },
          );
        },
      });

      return Promise.resolve(new Response(stream));
    });

    window.sessionStorage.setItem(
      "langfuse:in-app-ai-agent-selected-conversation:project-1",
      JSON.stringify("conversation-1"),
    );
    renderExecutionUi();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Message the assistant" }),
      { target: { value: "Investigate this" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    const stopButton = await screen.findByRole("button", { name: "Stop run" });
    expect(queryActivityIndicator()).toBeInTheDocument();
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(watchRequestCount).toBe(2);
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /stopp?ing run/i }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText(finalText)).toBeVisible();
    expect(queryActivityIndicator()).not.toBeInTheDocument();

    const textbox = screen.getByRole("textbox", {
      name: "Message the assistant",
    });
    fireEvent.change(textbox, { target: { value: "Start a new analysis" } });
    const sendButton = screen.getByRole("button", { name: "Send message" });
    expect(sendButton).toBeEnabled();
    fireEvent.click(sendButton);
    await waitFor(() => {
      expect(providerMocks.startRun).toHaveBeenCalledTimes(2);
    });
  });
});
