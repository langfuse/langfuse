import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { EventType } from "@ag-ui/core";
import {
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
  type AgUiMessage,
} from "@langfuse/shared/in-app-agent";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { ControlledInAppAgentWindow } from "./ControlledInAppAgentWindow";
import { InAppAiAgentProvider, useInAppAiAgent } from "./InAppAiAgentProvider";
import styles from "./InAppAgentWindow.module.css";

const providerMocks = vi.hoisted(() => {
  const startRun = vi.fn();
  const cancelRun = vi.fn();
  const decideToolApproval = vi.fn();
  const activityQuery = {
    data: undefined as undefined,
    refetch: vi.fn(() => Promise.resolve({ data: undefined })),
  };
  const activityUseQuery = vi.fn(
    (
      _input?: { projectId: string; limit: number },
      _options?: { enabled?: boolean },
    ) => activityQuery,
  );

  return {
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
    activityQuery,
    activityUseQuery,
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
            conversation: { id: string };
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
      dashboard: {
        invalidate: vi.fn(() => Promise.resolve()),
      },
      dashboardWidgets: {
        invalidate: vi.fn(() => Promise.resolve()),
      },
      inAppAgent: {
        getConversation: {
          fetch: vi.fn(),
          invalidate: vi.fn(() => Promise.resolve()),
        },
        listConversations: {
          invalidate: vi.fn(() => Promise.resolve()),
        },
      },
      prompts: {
        invalidate: vi.fn(() => Promise.resolve()),
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

const sessionMocks = vi.hoisted(() => ({
  userId: "user-1" as string | undefined,
  aiFeaturesEnabled: true,
  inAppAgentEnabled: true,
  isLangfuseCloud: true,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: { id: sessionMocks.userId, name: "Test User" },
      environment: { inAppAgentEnabled: sessionMocks.inAppAgentEnabled },
    },
  }),
}));

vi.mock("@/src/features/entitlements/hooks", () => ({
  useHasEntitlement: () => true,
}));

vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({
    isLangfuseCloud: sessionMocks.isLangfuseCloud,
    region: sessionMocks.isLangfuseCloud ? "US" : undefined,
  }),
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProjectOrOrganization: () => ({
    organization: { aiFeaturesEnabled: sessionMocks.aiFeaturesEnabled },
  }),
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
        // Bounded activity poll: same procedure, `limit: 50`.
        useQuery: (
          input: { projectId: string; limit: number },
          options?: { enabled?: boolean },
        ) => providerMocks.activityUseQuery(input, options),
      },
      getConversation: {
        useQuery: (...args: unknown[]) => {
          providerMocks.getConversation(...args);
          return providerMocks.conversationQuery;
        },
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

function ReopenAssistantButton() {
  const { setOpen } = useInAppAiAgent();

  return (
    <button
      type="button"
      onClick={() => {
        setOpen(true);
      }}
    >
      Reopen assistant
    </button>
  );
}

function ConcurrentConversationProbe({
  conversationId,
}: {
  conversationId: string | null;
}) {
  const { isSubmitting, selectConversation, submit } = useInAppAiAgent();

  return (
    <>
      <p>{isSubmitting ? "Submitting" : "Ready"}</p>
      <button
        type="button"
        onClick={() => {
          submit("First question").catch(() => undefined);
        }}
      >
        Submit
      </button>
      <button
        type="button"
        onClick={() => {
          selectConversation(null);
        }}
      >
        Leave conversation
      </button>
      <button
        type="button"
        disabled={!conversationId}
        onClick={() => {
          selectConversation(conversationId);
        }}
      >
        Return to conversation
      </button>
    </>
  );
}

function providerProbe(conversationId: string | null) {
  return (
    <InAppAiAgentProvider defaultOpen>
      <ConcurrentConversationProbe conversationId={conversationId} />
    </InAppAiAgentProvider>
  );
}

function renderExecutionUi({
  defaultOpen = true,
  includeReopenButton = false,
}: {
  defaultOpen?: boolean;
  includeReopenButton?: boolean;
} = {}) {
  return render(
    <InAppAiAgentProvider defaultOpen={defaultOpen}>
      <TooltipProvider>
        {includeReopenButton ? <ReopenAssistantButton /> : null}
        <ControlledInAppAgentWindow
          isExpanded={false}
          onDeleteConversation={vi.fn()}
          onExpandedChange={vi.fn()}
          showCloseButton={false}
        />
      </TooltipProvider>
    </InAppAiAgentProvider>,
  );
}

function queryActivityIndicator() {
  return document.querySelector(`.${styles.loadingGradient}`);
}

describe("in-app agent execution", () => {
  beforeEach(() => {
    sessionMocks.userId = "user-1";
    sessionMocks.aiFeaturesEnabled = true;
    sessionMocks.inAppAgentEnabled = true;
    sessionMocks.isLangfuseCloud = true;
    providerMocks.activityUseQuery.mockImplementation(
      () => providerMocks.activityQuery,
    );
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
    providerMocks.conversationQuery.data = undefined;
    window.sessionStorage.clear();
  });

  // Polling uses useCanUseInAppAgent (org AI Features on). Entry points use
  // useIsInAppAgentLauncherVisible, which still shows when AI Features are off
  // so clicking can open the enable dialog. Polling with it off turns every
  // page load and window focus into a Forbidden toast.
  it("polls for activity only once AI features are on", () => {
    sessionMocks.aiFeaturesEnabled = false;

    const offRender = render(
      <InAppAiAgentProvider defaultOpen={false}>
        <div />
      </InAppAiAgentProvider>,
    );

    expect(providerMocks.activityUseQuery.mock.calls.at(-1)?.[1]?.enabled).toBe(
      false,
    );
    offRender.unmount();

    sessionMocks.aiFeaturesEnabled = true;
    render(
      <InAppAiAgentProvider defaultOpen={false}>
        <div />
      </InAppAiAgentProvider>,
    );

    expect(providerMocks.activityUseQuery.mock.calls.at(-1)?.[1]?.enabled).toBe(
      true,
    );
  });

  it("does not poll for activity when in-app agent is instance-disabled", () => {
    sessionMocks.inAppAgentEnabled = false;

    render(
      <InAppAiAgentProvider defaultOpen={false}>
        <div />
      </InAppAiAgentProvider>,
    );

    expect(providerMocks.activityUseQuery.mock.calls.at(-1)?.[1]?.enabled).toBe(
      false,
    );
  });

  it("always allows a persisted background tool for the conversation", async () => {
    const approvedSnapshot = {
      conversation: {
        id: "conversation-1",
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
          toolCalls: [
            {
              id: "tool-call-1",
              type: "function",
              function: {
                name: "langfuse_createTextPrompt",
                arguments: "{}",
              },
            },
            {
              id: "tool-call-2",
              type: "function",
              function: {
                name: "langfuse_createDashboardWidget",
                arguments: "{}",
              },
            },
          ],
        },
      ],
      eventCursor: 12,
      latestRun: {
        id: "run-2",
        status: InAppAgentRunStatus.RUNNING,
        errorCode: null,
        cancelRequested: false,
      },
      pendingToolApprovals: [],
    } satisfies NonNullable<typeof providerMocks.conversationQuery.data>;
    providerMocks.conversationQuery.data = {
      ...approvedSnapshot,
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
    providerMocks.decideToolApproval.mockResolvedValueOnce({});
    providerMocks.utils.inAppAgent.getConversation.fetch.mockResolvedValueOnce(
      approvedSnapshot,
    );
    window.sessionStorage.setItem(
      "langfuse:in-app-ai-agent-selected-conversation:project-1",
      JSON.stringify("conversation-1"),
    );

    renderExecutionUi();

    expect(await screen.findByText("Create the prompt")).toBeInTheDocument();
    // The run is parked on this approval, so the drawer says so rather than
    // narrating the tool it was about to call.
    fireEvent.click(
      screen.getByRole("button", { name: "Waiting for your approval…" }),
    );
    expect(screen.getByText("I need approval.")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Always approve for this conversation",
      }),
    );

    await waitFor(() => {
      expect(providerMocks.decideToolApproval).toHaveBeenCalledOnce();
      expect(providerMocks.decideToolApproval).toHaveBeenCalledWith({
        projectId: "project-1",
        conversationId: "conversation-1",
        runId: "run-1",
        toolCallId: "tool-call-1",
        approved: true,
        approvalScope: "conversation",
      });
      expect(providerMocks.capture).toHaveBeenCalledOnce();
      expect(providerMocks.capture).toHaveBeenCalledWith(
        "in_app_agent:tool_approval_decided",
        {
          isApproved: true,
          toolName: "langfuse_createTextPrompt",
          approvalScope: "conversation",
        },
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByLabelText(/^createDashboardWidget:/),
      ).not.toBeInTheDocument();
    });
  });

  it("replays prompt and dashboard invalidations after a detached run completes", async () => {
    const completedSnapshot = {
      conversation: {
        id: "conversation-1",
      },
      messages: [
        {
          id: "prompt-call",
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "prompt-tool-call",
              type: "function",
              function: {
                name: "langfuse_createTextPrompt",
                arguments: "{}",
              },
            },
          ],
        },
        {
          id: "prompt-result",
          role: "tool",
          toolCallId: "prompt-tool-call",
          content: '{"id":"prompt-1"}',
        },
        {
          id: "prompt-call-2",
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "prompt-tool-call-2",
              type: "function",
              function: {
                name: "langfuse_createTextPrompt",
                arguments: "{}",
              },
            },
          ],
        },
        {
          id: "prompt-result-2",
          role: "tool",
          toolCallId: "prompt-tool-call-2",
          content: '{"id":"prompt-2"}',
        },
        {
          id: "placement-call",
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "placement-tool-call",
              type: "function",
              function: {
                name: "langfuse_addDashboardPlacement",
                arguments: "{}",
              },
            },
          ],
        },
        {
          id: "placement-result",
          role: "tool",
          toolCallId: "placement-tool-call",
          content: '{"id":"placement-1"}',
        },
      ],
      eventCursor: 14,
      latestRun: {
        id: "run-1",
        status: InAppAgentRunStatus.SUCCEEDED,
        errorCode: null,
        cancelRequested: false,
      },
      pendingToolApprovals: [],
    } satisfies NonNullable<typeof providerMocks.conversationQuery.data>;
    providerMocks.conversationQuery.data = completedSnapshot;
    providerMocks.utils.inAppAgent.getConversation.fetch.mockResolvedValueOnce(
      completedSnapshot,
    );
    window.sessionStorage.setItem(
      "langfuse:in-app-ai-agent-selected-conversation:project-1",
      JSON.stringify("conversation-1"),
    );

    renderExecutionUi({
      defaultOpen: false,
      includeReopenButton: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Reopen assistant" }));

    // Repeated calls union into one invalidation per affected route.
    await waitFor(() => {
      expect(providerMocks.utils.prompts.invalidate).toHaveBeenCalledOnce();
      expect(providerMocks.utils.dashboard.invalidate).toHaveBeenCalledOnce();
    });
    expect(
      providerMocks.utils.dashboardWidgets.invalidate,
    ).not.toHaveBeenCalled();
  });

  it("keeps a hydrated in-flight tool call visibly running", async () => {
    providerMocks.conversationQuery.data = {
      conversation: {
        id: "conversation-1",
      },
      messages: [
        {
          id: "persisted-user",
          role: "user",
          content: "Inspect the traces",
        },
        {
          id: "persisted-assistant",
          role: "assistant",
          content: "",
          runId: "run-1",
          toolCalls: [
            {
              id: "tool-call-1",
              type: "function",
              function: {
                name: "list_traces",
                arguments: "{}",
              },
            },
          ],
        },
      ],
      eventCursor: 12,
      latestRun: {
        id: "run-1",
        status: InAppAgentRunStatus.RUNNING,
        errorCode: null,
        cancelRequested: false,
      },
      pendingToolApprovals: [],
    };
    window.sessionStorage.setItem(
      "langfuse:in-app-ai-agent-selected-conversation:project-1",
      JSON.stringify("conversation-1"),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>(() => undefined),
    );

    renderExecutionUi();

    expect(
      await screen.findByRole("button", { name: "Browsing traces" }),
    ).toBeInTheDocument();
  });

  it("keeps approval cancellation visibly stopping until hydration settles", async () => {
    providerMocks.conversationQuery.data = {
      conversation: {
        id: "conversation-1",
      },
      messages: [
        {
          id: "persisted-user",
          role: "user",
          content: "Create the prompt",
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
    providerMocks.cancelRun.mockResolvedValueOnce({
      cancelledImmediately: true,
      status: InAppAgentRunStatus.CANCELLED,
    });
    providerMocks.utils.inAppAgent.getConversation.fetch.mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    window.sessionStorage.setItem(
      "langfuse:in-app-ai-agent-selected-conversation:project-1",
      JSON.stringify("conversation-1"),
    );

    renderExecutionUi();
    fireEvent.click(await screen.findByRole("button", { name: "Stop run" }));

    await waitFor(() => {
      expect(
        providerMocks.utils.inAppAgent.getConversation.fetch,
      ).toHaveBeenCalledOnce();
    });
    expect(screen.getByRole("button", { name: "Stopping run" })).toBeDisabled();
    expect(screen.getByText("Stopping the run…")).toBeVisible();
  });

  it("does not observe a cached active run while the assistant is closed", async () => {
    const runningSnapshot = {
      conversation: { id: "conversation-1" },
      messages: [],
      eventCursor: 5,
      latestRun: {
        id: "run-1",
        status: InAppAgentRunStatus.RUNNING,
        errorCode: null,
        cancelRequested: false,
      },
      pendingToolApprovals: [],
    } satisfies NonNullable<typeof providerMocks.conversationQuery.data>;
    providerMocks.conversationQuery.data = runningSnapshot;
    providerMocks.utils.inAppAgent.getConversation.fetch.mockResolvedValue(
      runningSnapshot,
    );
    const watchFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(sseFrame({ type: "done" })));
    window.sessionStorage.setItem(
      "langfuse:in-app-ai-agent-selected-conversation:project-1",
      JSON.stringify("conversation-1"),
    );

    render(
      <InAppAiAgentProvider defaultOpen={false}>
        <div />
      </InAppAiAgentProvider>,
    );
    await act(async () => undefined);

    expect(watchFetch).not.toHaveBeenCalled();
  });

  it("settles the drawer without restarting its activity state after Stop", async () => {
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
      conversation: { id: "conversation-1" },
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
        screen.queryByRole("button", { name: /stop(?:ping)? run/i }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText(finalText)).toBeVisible();
    expect(screen.getByText("Current trace view in context")).toBeVisible();
    expect(screen.getByRole("button", { name: "Good response" })).toBeVisible();
  });

  it("settles a newly submitted run as soon as Stop receives a terminal status", async () => {
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
      conversation: { id: "conversation-1" },
      messages: [],
      eventCursor: -1,
      latestRun: null,
      pendingToolApprovals: [],
    };
    const cancellingSnapshot = {
      conversation: { id: "conversation-1" },
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
      .mockResolvedValueOnce({
        conversationId: "conversation-1",
        runId: "run-1",
      })
      .mockResolvedValueOnce({
        conversationId: "conversation-1",
        runId: "run-2",
      });
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
        screen.queryByRole("button", { name: /stop(?:ping)? run/i }),
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

describe("in-app agent concurrent conversations", () => {
  beforeEach(() => {
    sessionMocks.userId = "user-1";
    sessionMocks.aiFeaturesEnabled = true;
    sessionMocks.isLangfuseCloud = true;
    providerMocks.activityUseQuery.mockImplementation(
      () => providerMocks.activityQuery,
    );
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
    providerMocks.conversationQuery.data = undefined;
    providerMocks.conversationQuery.error = null;
    providerMocks.conversationQuery.isLoading = false;
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("starts a new conversation while another one is still running", async () => {
    providerMocks.conversationQuery.data = {
      conversation: { id: "conversation-1" },
      messages: [],
      eventCursor: 3,
      latestRun: {
        id: "run-1",
        status: InAppAgentRunStatus.RUNNING,
        errorCode: null,
        cancelRequested: false,
      },
      pendingToolApprovals: [],
    };
    providerMocks.startRun.mockImplementation(
      async (input: { conversationId: string }) => ({
        conversationId: input.conversationId,
        runId: "run-2",
      }),
    );
    window.sessionStorage.setItem(
      "langfuse:in-app-ai-agent-selected-conversation:project-1",
      JSON.stringify("conversation-1"),
    );

    renderExecutionUi();

    const newConversationButton = await screen.findByRole("button", {
      name: "Start new conversation",
    });
    expect(newConversationButton).toBeEnabled();
    fireEvent.click(newConversationButton);

    const input = await screen.findByRole("textbox", {
      name: "Message the assistant",
    });
    fireEvent.change(input, { target: { value: "Second question" } });
    const form = input.closest("form");
    if (!form) {
      throw new Error("Expected the assistant composer to render a form");
    }
    fireEvent.submit(form);

    await waitFor(() => {
      expect(providerMocks.startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "project-1",
          message: "Second question",
        }),
      );
    });
    expect(providerMocks.cancelRun).not.toHaveBeenCalled();
  });

  it("waits for startRun before fetching a new conversation", async () => {
    providerMocks.getConversation.mockClear();
    providerMocks.startRun.mockReset();

    let resolveStartRun:
      | ((result: { runId: string; conversationId: string }) => void)
      | undefined;
    providerMocks.startRun.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStartRun = resolve;
        }),
    );

    renderExecutionUi();

    const input = screen.getByRole("textbox", {
      name: "Message the assistant",
    });
    fireEvent.change(input, { target: { value: "First question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(providerMocks.startRun).toHaveBeenCalledOnce();
    });
    const conversationId = providerMocks.startRun.mock.calls[0]?.[0]
      ?.conversationId as string;

    expect(providerMocks.getConversation).toHaveBeenLastCalledWith(
      expect.objectContaining({ conversationId }),
      expect.objectContaining({ enabled: false }),
    );

    await act(async () => {
      resolveStartRun?.({ runId: "run-1", conversationId });
    });

    await waitFor(() => {
      expect(providerMocks.getConversation).toHaveBeenLastCalledWith(
        expect.objectContaining({ conversationId }),
        expect.objectContaining({ enabled: true }),
      );
    });
  });

  it("releases a conversation submit lock when switching away", async () => {
    providerMocks.startRun.mockImplementation(
      async (input: { conversationId: string }) => ({
        conversationId: input.conversationId,
        runId: "run-1",
      }),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const { rerender } = render(providerProbe(null));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(providerMocks.startRun).toHaveBeenCalledOnce();
    });
    const conversationId = providerMocks.startRun.mock.calls[0]?.[0]
      ?.conversationId as string;
    rerender(providerProbe(conversationId));

    fireEvent.click(screen.getByRole("button", { name: "Leave conversation" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Return to conversation" }),
    );

    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("keeps a failed new conversation provisional and preserves its messages on retry", async () => {
    providerMocks.getConversation.mockClear();
    providerMocks.startRun
      .mockReset()
      .mockRejectedValueOnce(new Error("Start failed"))
      .mockImplementationOnce(() => new Promise<never>(() => undefined));

    renderExecutionUi();

    const input = screen.getByRole("textbox", {
      name: "Message the assistant",
    });
    fireEvent.change(input, { target: { value: "First question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(providerMocks.startRun).toHaveBeenCalledOnce();
    });
    const conversationId = providerMocks.startRun.mock.calls[0]?.[0]
      ?.conversationId as string;

    await waitFor(() => {
      expect(providerMocks.getConversation).toHaveBeenLastCalledWith(
        expect.objectContaining({ conversationId }),
        expect.objectContaining({ enabled: false }),
      );
    });
    expect(screen.getByText("First question")).toBeVisible();

    fireEvent.change(input, { target: { value: "Retry question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(providerMocks.startRun).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText("First question")).toBeVisible();
    expect(screen.getByText("Retry question")).toBeVisible();
    expect(providerMocks.capture).toHaveBeenCalledWith(
      "in_app_agent:new_chat_started",
      { entryPoint: "chat", hasOtherActiveRun: false },
    );
    expect(
      providerMocks.capture.mock.calls.filter(
        ([event]) => event === "in_app_agent:new_chat_started",
      ),
    ).toHaveLength(1);
  });
});
