import { EventType } from "@ag-ui/core";
import type { AgentSubscriber } from "@ag-ui/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InAppAgentRunErrorCode, InAppAgentRunStatus } from "@langfuse/shared";
import type { AgUiMessage } from "@langfuse/shared/in-app-agent";

import { InAppAgentBackgroundClient } from "./backgroundAgentClient";
import {
  createInAppAgentDisplayState,
  projectInAppAgentMessagesForDisplay,
  recordInAppAgentMessagesForDisplay,
} from "./display";
import { BackgroundExecutionConnectionError } from "./backgroundExecutionErrors";
import {
  BackgroundExecutionSessionController,
  type BackgroundExecutionView,
} from "./backgroundExecutionSession";

const message = {
  id: "message-1",
  role: "assistant",
  content: "persisted",
} satisfies AgUiMessage;

const runningView = {
  messages: [message],
  displayState: createInAppAgentDisplayState(),
  eventCursor: 7,
  currentRun: {
    id: "run-1",
    status: InAppAgentRunStatus.RUNNING,
    errorCode: null,
    cancelRequested: false,
  },
  pendingToolApprovals: [],
} satisfies Omit<
  BackgroundExecutionView,
  "attachment" | "cancelStatus" | "liveMessageRevision"
>;

const userMessage = {
  id: "user-message",
  role: "user",
  content: "Add a cost widget to this dashboard",
} satisfies AgUiMessage;

const explanationMessage = {
  id: "assistant-explanation",
  role: "assistant",
  content: "I will create the widget and then add it to the dashboard.",
} satisfies AgUiMessage;

const createWidgetMessage = {
  id: "create-widget-call",
  role: "assistant",
  content: "",
  toolCalls: [
    {
      id: "create-widget",
      type: "function",
      function: {
        name: "langfuse_createDashboardWidget",
        arguments: '{"name":"Cost by Model"}',
      },
    },
  ],
} satisfies AgUiMessage;

const createWidgetResult = {
  id: "create-widget-result",
  role: "tool",
  toolCallId: "create-widget",
  content: '{"id":"widget-1"}',
} satisfies AgUiMessage;

const addPlacementMessage = {
  id: "add-placement-call",
  role: "assistant",
  content: "",
  toolCalls: [
    {
      id: "add-placement",
      type: "function",
      function: {
        name: "langfuse_addDashboardPlacement",
        arguments: '{"widgetId":"widget-1"}',
      },
    },
  ],
} satisfies AgUiMessage;

const addPlacementResult = {
  id: "add-placement-result",
  role: "tool",
  toolCallId: "add-placement",
  content: '{"id":"placement-1"}',
} satisfies AgUiMessage;

const finalMessage = {
  id: "assistant-final",
  role: "assistant",
  content: "Done. I created and placed the Cost by Model widget.",
} satisfies AgUiMessage;

function createAgent() {
  return {
    messages: [],
    setMessages: vi.fn(),
    setCursor: vi.fn(),
    runAgent: vi.fn().mockResolvedValue(undefined),
    connectAgent: vi.fn().mockResolvedValue(undefined),
    abortRun: vi.fn(),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("BackgroundExecutionSessionController", () => {
  it("hydrates messages and cursor before attaching", async () => {
    let subscriber: AgentSubscriber | undefined;
    const agent = {
      ...createAgent(),
      subscribe: vi.fn((nextSubscriber: AgentSubscriber) => {
        subscriber = nextSubscriber;
        return { unsubscribe: vi.fn() };
      }),
      setMessages: vi.fn((messages: AgUiMessage[]) => {
        const onMessagesChanged = subscriber?.onMessagesChanged as
          | ((params: never) => void)
          | undefined;
        onMessagesChanged?.({ messages } as never);
      }),
      connectAgent: vi.fn(() => new Promise<unknown>(() => undefined)),
    };
    const hydrate = vi.fn().mockResolvedValue(runningView);
    const session = new BackgroundExecutionSessionController({
      agent,
      hydrate,
      cancelRun: vi.fn(),
      decideApproval: vi.fn(),
    });

    await session.hydrateAndAttach();
    await session.hydrateAndAttach();

    expect(agent.setMessages).toHaveBeenCalledWith([message]);
    expect(agent.setCursor).toHaveBeenCalledWith(7);
    expect(agent.connectAgent).toHaveBeenCalledOnce();
    expect(hydrate).toHaveBeenCalledOnce();
    expect(session.getSnapshot()).toMatchObject({
      messages: [message],
      eventCursor: 7,
      liveMessageRevision: 0,
    });
  });

  it("detaches observation without cancelling the server run", async () => {
    const agent = {
      ...createAgent(),
      connectAgent: vi.fn(() => new Promise<unknown>(() => undefined)),
    };
    const cancelRun = vi.fn();
    const session = new BackgroundExecutionSessionController({
      agent,
      hydrate: vi.fn().mockResolvedValue(runningView),
      cancelRun,
      decideApproval: vi.fn(),
    });

    await session.hydrateAndAttach();
    session.detach();

    expect(agent.abortRun).toHaveBeenCalledOnce();
    expect(cancelRun).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({
      attachment: { status: "detached" },
      currentRun: runningView.currentRun,
    });

    await session.hydrateAndAttach();

    expect(agent.connectAgent).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().attachment).toEqual({ status: "attached" });
    expect(session.getSnapshot().currentRun).toEqual(runningView.currentRun);
    expect(session.getSnapshot().messages).toEqual([message]);
  });

  it("cancels the active server run", async () => {
    const agent = createAgent();
    const cancelRun = vi.fn().mockResolvedValue(undefined);
    const cancelledView = {
      ...runningView,
      currentRun: {
        ...runningView.currentRun,
        status: InAppAgentRunStatus.CANCELLED,
      },
      pendingToolApprovals: [],
    };
    const session = new BackgroundExecutionSessionController({
      agent,
      hydrate: vi.fn().mockResolvedValue(cancelledView),
      cancelRun,
      decideApproval: vi.fn(),
      initialView: { currentRun: runningView.currentRun },
    });

    await session.cancel();

    expect(cancelRun).toHaveBeenCalledWith("run-1");
    expect(session.getSnapshot().currentRun?.status).toBe(
      InAppAgentRunStatus.CANCELLED,
    );
    expect(agent.connectAgent).not.toHaveBeenCalled();
  });

  it("restores cancellation controls when the mutation fails", async () => {
    const mutationError = new Error("cancel failed");
    const session = new BackgroundExecutionSessionController({
      agent: createAgent(),
      hydrate: vi.fn(),
      cancelRun: vi.fn().mockRejectedValue(mutationError),
      decideApproval: vi.fn(),
      initialView: { currentRun: runningView.currentRun },
    });

    await expect(session.cancel()).rejects.toBe(mutationError);

    expect(session.getSnapshot()).toMatchObject({
      currentRun: {
        id: "run-1",
        cancelRequested: false,
      },
      cancelStatus: "idle",
      attachment: { status: "detached" },
    });
  });

  it("keeps a terminal status delivered while the cancel mutation is in flight", async () => {
    let statusListener:
      | ((status: {
          runId: string;
          status: InAppAgentRunStatus;
          errorCode?: string | null;
          cancelRequested?: boolean;
        }) => void)
      | undefined;
    const agent = {
      ...createAgent(),
      setStatusListener: vi.fn((listener?: typeof statusListener) => {
        statusListener = listener;
      }),
    };
    let resolveCancel: () => void = () => undefined;
    // Deferred so the post-command refresh cannot mask the view cancel() wrote.
    let resolveHydrate: (view: typeof runningView) => void = () => undefined;
    const session = new BackgroundExecutionSessionController({
      agent,
      hydrate: vi.fn(
        () =>
          new Promise<typeof runningView>((resolve) => {
            resolveHydrate = resolve;
          }),
      ),
      cancelRun: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveCancel = resolve;
          }),
      ),
      decideApproval: vi.fn(),
      initialView: { currentRun: runningView.currentRun },
    });

    const cancelling = session.cancel();
    statusListener?.({
      runId: "run-1",
      status: InAppAgentRunStatus.CANCELLED,
      errorCode: InAppAgentRunErrorCode.CANCELLED,
      cancelRequested: true,
    });
    resolveCancel();

    await vi.waitFor(() => {
      expect(session.getSnapshot().cancelStatus).toBe("idle");
    });
    expect(session.getSnapshot().currentRun).toEqual({
      id: "run-1",
      status: InAppAgentRunStatus.CANCELLED,
      errorCode: InAppAgentRunErrorCode.CANCELLED,
      cancelRequested: true,
    });

    resolveHydrate(runningView);
    await cancelling;
  });

  it("does not stamp cancellation onto a superseding run", async () => {
    let statusListener:
      | ((status: {
          runId: string;
          status: InAppAgentRunStatus;
          errorCode?: string | null;
          cancelRequested?: boolean;
        }) => void)
      | undefined;
    const agent = {
      ...createAgent(),
      setStatusListener: vi.fn((listener?: typeof statusListener) => {
        statusListener = listener;
      }),
    };
    let resolveCancel: () => void = () => undefined;
    let resolveHydrate: (view: typeof runningView) => void = () => undefined;
    const session = new BackgroundExecutionSessionController({
      agent,
      hydrate: vi.fn(
        () =>
          new Promise<typeof runningView>((resolve) => {
            resolveHydrate = resolve;
          }),
      ),
      cancelRun: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveCancel = resolve;
          }),
      ),
      decideApproval: vi.fn(),
      initialView: { currentRun: runningView.currentRun },
    });

    const cancelling = session.cancel();
    statusListener?.({
      runId: "run-2",
      status: InAppAgentRunStatus.RUNNING,
      errorCode: null,
      cancelRequested: false,
    });
    resolveCancel();

    await vi.waitFor(() => {
      expect(session.getSnapshot().cancelStatus).toBe("idle");
    });
    expect(session.getSnapshot().currentRun).toEqual({
      id: "run-2",
      status: InAppAgentRunStatus.RUNNING,
      errorCode: null,
      cancelRequested: false,
    });

    resolveHydrate(runningView);
    await cancelling;
  });

  it("keeps an accepted cancellation when attachment refresh fails", async () => {
    const refreshError = new Error("refresh failed");
    const agent = {
      ...createAgent(),
      connectAgent: vi.fn(() => new Promise<unknown>(() => undefined)),
    };
    const hydrate = vi
      .fn()
      .mockResolvedValueOnce(runningView)
      .mockRejectedValueOnce(refreshError);
    const session = new BackgroundExecutionSessionController({
      agent,
      hydrate,
      cancelRun: vi.fn().mockResolvedValue(undefined),
      decideApproval: vi.fn(),
    });

    await session.hydrateAndAttach();
    await expect(session.cancel()).resolves.toBeUndefined();

    expect(agent.abortRun).toHaveBeenCalledOnce();
    expect(hydrate).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot()).toMatchObject({
      currentRun: {
        id: "run-1",
        cancelRequested: true,
      },
      attachment: {
        status: "error",
        error: refreshError,
      },
    });
  });

  it("keeps an accepted approval resolved when attachment refresh fails", async () => {
    const refreshError = new Error("refresh failed");
    const session = new BackgroundExecutionSessionController({
      agent: createAgent(),
      hydrate: vi.fn().mockRejectedValue(refreshError),
      cancelRun: vi.fn(),
      decideApproval: vi.fn().mockResolvedValue(undefined),
      initialView: {
        currentRun: {
          ...runningView.currentRun,
          status: InAppAgentRunStatus.AWAITING_APPROVAL,
        },
        pendingToolApprovals: [
          {
            runId: "run-1",
            status: "pending",
            approvalRequest: {
              type: "tool_approval_request",
              toolCallId: "tool-call-1",
              toolName: "dangerousTool",
              runId: "run-1",
            },
          },
        ],
      },
    });

    await expect(
      session.decide({
        runId: "run-1",
        toolCallId: "tool-call-1",
        approved: true,
      }),
    ).resolves.toBeUndefined();

    expect(session.getSnapshot()).toMatchObject({
      pendingToolApprovals: [],
      attachment: {
        status: "error",
        error: refreshError,
      },
    });
  });

  it("keeps a rejected approval mutation actionable", async () => {
    let rejectDecision: (error: Error) => void = () => undefined;
    const decision = new Promise<void>((_, reject) => {
      rejectDecision = reject;
    });
    const session = new BackgroundExecutionSessionController({
      agent: createAgent(),
      hydrate: vi.fn().mockResolvedValue(runningView),
      cancelRun: vi.fn(),
      decideApproval: vi.fn(() => decision),
      initialView: {
        currentRun: {
          ...runningView.currentRun,
          status: InAppAgentRunStatus.AWAITING_APPROVAL,
        },
        pendingToolApprovals: [
          {
            runId: "run-1",
            status: "pending",
            approvalRequest: {
              type: "tool_approval_request",
              toolCallId: "tool-call-1",
              toolName: "dangerousTool",
              runId: "run-1",
            },
          },
        ],
      },
    });

    const result = session.decide({
      runId: "run-1",
      toolCallId: "tool-call-1",
      approved: true,
    });

    expect(session.getSnapshot().pendingToolApprovals).toMatchObject([
      { status: "submitting" },
    ]);

    const decisionError = new Error("decision failed");
    rejectDecision(decisionError);
    await expect(result).rejects.toBe(decisionError);
    expect(session.getSnapshot().pendingToolApprovals).toMatchObject([
      { status: "pending" },
    ]);
  });

  it("keeps run-start failures outside attachment state", async () => {
    const startError = new Error("start failed");
    const session = new BackgroundExecutionSessionController({
      agent: {
        ...createAgent(),
        runAgent: vi.fn().mockRejectedValue(startError),
      },
      hydrate: vi.fn().mockResolvedValue(runningView),
      cancelRun: vi.fn(),
      decideApproval: vi.fn(),
    });

    await expect(session.run({ context: [] } as never)).rejects.toBe(
      startError,
    );
    expect(session.getSnapshot().attachment).toEqual({
      status: "detached",
    });
  });

  it("surfaces reconnect exhaustion from a newly started run", async () => {
    const watchError = new BackgroundExecutionConnectionError("watch failed", {
      retryable: true,
    });
    const session = new BackgroundExecutionSessionController({
      agent: {
        ...createAgent(),
        runAgent: vi.fn().mockRejectedValue(watchError),
      },
      hydrate: vi.fn().mockResolvedValue(runningView),
      cancelRun: vi.fn(),
      decideApproval: vi.fn(),
    });

    await expect(session.run({ context: [] } as never)).rejects.toBe(
      watchError,
    );
    expect(session.getSnapshot().attachment).toMatchObject({
      status: "error",
      retryable: true,
    });
  });

  it("owns streamed messages and approval state", async () => {
    let subscriber: AgentSubscriber | undefined;
    const unsubscribe = vi.fn();
    const agent = {
      ...createAgent(),
      subscribe: vi.fn((nextSubscriber: AgentSubscriber) => {
        subscriber = nextSubscriber;
        return { unsubscribe };
      }),
    };
    const session = new BackgroundExecutionSessionController({
      agent,
      hydrate: vi.fn().mockResolvedValue(runningView),
      cancelRun: vi.fn(),
      decideApproval: vi.fn(),
    });

    await subscriber?.onMessagesChanged?.({
      messages: [message],
    } as never);
    await subscriber?.onCustomEvent?.({
      event: {
        type: EventType.CUSTOM,
        name: "on_interrupt",
        value: {
          type: "mastra_suspend",
          toolCallId: "tool-call-1",
          toolName: "dangerousTool",
          runId: "run-1",
        },
      },
    } as never);

    expect(session.getSnapshot()).toMatchObject({
      messages: [message],
      liveMessageRevision: 1,
      pendingToolApprovals: [
        {
          runId: "run-1",
          status: "pending",
          approvalRequest: {
            type: "tool_approval_request",
            toolCallId: "tool-call-1",
          },
        },
      ],
    });

    await subscriber?.onToolCallResultEvent?.({
      event: { toolCallId: "tool-call-1" },
    } as never);

    expect(session.getSnapshot().pendingToolApprovals).toEqual([]);

    session.dispose();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("reattaches an accepted approval from a coherent persisted snapshot", async () => {
    let installedMessages: AgUiMessage[] = [];
    let installedCursor = -1;
    const attachedSnapshots: Array<{
      messages: AgUiMessage[];
      cursor: number;
    }> = [];
    const agent = {
      ...createAgent(),
      setMessages: vi.fn((messages: AgUiMessage[]) => {
        installedMessages = messages;
      }),
      setCursor: vi.fn((cursor: number) => {
        installedCursor = cursor;
      }),
      connectAgent: vi.fn(() => {
        attachedSnapshots.push({
          messages: installedMessages,
          cursor: installedCursor,
        });
        return new Promise<unknown>(() => undefined);
      }),
      abortRun: vi.fn(),
    };
    const session = new BackgroundExecutionSessionController({
      agent,
      hydrate: vi.fn().mockResolvedValue(runningView),
      cancelRun: vi.fn(),
      decideApproval: vi.fn().mockResolvedValue(undefined),
    });

    await session.hydrateAndAttach();
    await session.decide({
      runId: "parked-run",
      toolCallId: "tool-call-1",
      approved: true,
    });

    expect(attachedSnapshots).toEqual([
      { messages: [message], cursor: 7 },
      { messages: [message], cursor: 7 },
    ]);
    expect(agent.abortRun).toHaveBeenCalledOnce();
    expect(session.getSnapshot()).toMatchObject({
      messages: [message],
      eventCursor: 7,
      attachment: { status: "attached" },
    });
  });

  it("converges sequential approval continuations to the persisted transcript", async () => {
    let subscriber: AgentSubscriber | undefined;
    let resolveCreateRun: () => void = () => undefined;
    let resolvePlacementRun: () => void = () => undefined;
    const createRun = new Promise<void>((resolve) => {
      resolveCreateRun = resolve;
    });
    const placementRun = new Promise<void>((resolve) => {
      resolvePlacementRun = resolve;
    });
    const messagesBeforeApproval = [userMessage, explanationMessage];
    const messagesAfterCreate = [
      ...messagesBeforeApproval,
      createWidgetMessage,
      createWidgetResult,
    ];
    const finalPersistedMessages = [
      ...messagesAfterCreate,
      addPlacementMessage,
      addPlacementResult,
      finalMessage,
    ];
    let phase:
      | "before-create"
      | "creating"
      | "awaiting-placement"
      | "placing"
      | "complete" = "before-create";
    const hydrate = vi.fn(async () => {
      if (phase === "creating") {
        return {
          ...runningView,
          messages: messagesBeforeApproval,
          currentRun: { ...runningView.currentRun, id: "create-run" },
        };
      }

      if (phase === "awaiting-placement") {
        return {
          ...runningView,
          messages: messagesAfterCreate,
          currentRun: {
            ...runningView.currentRun,
            id: "create-run",
            status: InAppAgentRunStatus.AWAITING_APPROVAL,
          },
        };
      }

      if (phase === "placing") {
        return {
          ...runningView,
          messages: messagesAfterCreate,
          currentRun: { ...runningView.currentRun, id: "placement-run" },
        };
      }

      return {
        ...runningView,
        messages: finalPersistedMessages,
        currentRun: {
          ...runningView.currentRun,
          id: "placement-run",
          status: InAppAgentRunStatus.SUCCEEDED,
        },
      };
    });
    const agent = {
      ...createAgent(),
      subscribe: vi.fn((nextSubscriber: AgentSubscriber) => {
        subscriber = nextSubscriber;
        return { unsubscribe: vi.fn() };
      }),
      connectAgent: vi
        .fn()
        .mockImplementationOnce(() => createRun)
        .mockImplementationOnce(() => placementRun),
    };
    const session = new BackgroundExecutionSessionController({
      agent,
      hydrate,
      cancelRun: vi.fn(),
      decideApproval: vi.fn(async ({ toolCallId }) => {
        phase = toolCallId === "create-widget" ? "creating" : "placing";
      }),
      initialView: {
        messages: messagesBeforeApproval,
        currentRun: {
          ...runningView.currentRun,
          id: "approval-run",
          status: InAppAgentRunStatus.AWAITING_APPROVAL,
        },
      },
    });

    await session.decide({
      runId: "approval-run",
      toolCallId: "create-widget",
      approved: true,
    });
    await subscriber?.onMessagesChanged?.({
      messages: messagesAfterCreate,
    } as never);
    phase = "awaiting-placement";
    resolveCreateRun();
    await vi.waitFor(() => {
      expect(session.getSnapshot().attachment.status).toBe("detached");
    });
    expect(session.getSnapshot().messages).toEqual(messagesAfterCreate);

    await session.decide({
      runId: "create-run",
      toolCallId: "add-placement",
      approved: true,
    });
    await subscriber?.onMessagesChanged?.({
      // Reproduce the live-only loss of the previously completed create call.
      messages: [
        ...messagesBeforeApproval,
        addPlacementMessage,
        addPlacementResult,
        finalMessage,
      ],
    } as never);
    phase = "complete";
    resolvePlacementRun();
    await vi.waitFor(() => {
      expect(session.getSnapshot().attachment.status).toBe("detached");
    });

    expect(session.getSnapshot().messages).toEqual(finalPersistedMessages);
  });

  it("keeps the server run active and can retry when observation fails", async () => {
    const onError = vi.fn();
    const agent = {
      ...createAgent(),
      connectAgent: vi
        .fn()
        .mockRejectedValueOnce(
          new BackgroundExecutionConnectionError("watch failed", {
            retryable: true,
          }),
        )
        .mockImplementationOnce(() => new Promise<unknown>(() => undefined)),
    };
    const session = new BackgroundExecutionSessionController({
      agent,
      hydrate: vi.fn().mockResolvedValue(runningView),
      cancelRun: vi.fn(),
      decideApproval: vi.fn(),
      onError,
    });

    await session.hydrateAndAttach();
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });

    expect(session.getSnapshot()).toMatchObject({
      attachment: {
        status: "error",
        retryable: true,
      },
      currentRun: runningView.currentRun,
    });

    await session.hydrateAndAttach();

    expect(agent.connectAgent).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot()).toMatchObject({
      attachment: { status: "attached" },
      currentRun: runningView.currentRun,
    });
  });
});

describe("BackgroundExecutionSessionController hydration", () => {
  it("keeps a live tool call on its newly created assistant parent", async () => {
    const question = {
      id: "user-question",
      role: "user",
      content: "Why is latency up?",
    } satisfies AgUiMessage;
    const displayState = recordInAppAgentMessagesForDisplay(
      createInAppAgentDisplayState(),
      [question],
    );
    const hydrate = vi
      .fn()
      .mockResolvedValueOnce({
        messages: [question],
        displayState,
        eventCursor: 7,
        currentRun: runningView.currentRun,
        pendingToolApprovals: [],
      })
      // Keep the completed-run convergence open so this assertion observes
      // the live projection rather than a subsequently hydrated snapshot.
      .mockImplementation(() => new Promise<never>(() => undefined));

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        [
          sseFrame({
            type: "event",
            sequenceNumber: 8,
            event: {
              type: EventType.RUN_STARTED,
              runId: "run-1",
              threadId: "conversation-1",
            },
          }),
          sseFrame({
            type: "event",
            sequenceNumber: 9,
            event: {
              type: EventType.TOOL_CALL_START,
              toolCallId: "tool-call-1",
              toolCallName: "list_traces",
              parentMessageId: "assistant-tools",
            },
          }),
          sseFrame({
            type: "event",
            sequenceNumber: 10,
            event: {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: "tool-call-1",
              delta: "{}",
            },
          }),
          sseFrame({
            type: "event",
            sequenceNumber: 11,
            event: {
              type: EventType.TOOL_CALL_END,
              toolCallId: "tool-call-1",
            },
          }),
          sseFrame({
            type: "event",
            sequenceNumber: 12,
            event: {
              type: EventType.RUN_FINISHED,
              runId: "run-1",
              threadId: "conversation-1",
            },
          }),
          sseFrame({ type: "done" }),
        ].join(""),
      ),
    );

    const session = new BackgroundExecutionSessionController({
      agent: new InAppAgentBackgroundClient({
        projectId: "project-1",
        conversationId: "conversation-1",
        cursor: -1,
        startRun: vi.fn(),
      }),
      hydrate,
      cancelRun: vi.fn(),
      decideApproval: vi.fn(),
    });

    await session.hydrateAndAttach();
    await vi.waitFor(() => {
      expect(
        session
          .getSnapshot()
          .messages.find((message) => message.id === "assistant-tools"),
      ).toMatchObject({
        toolCalls: [{ id: "tool-call-1" }],
      });
    });

    const snapshot = session.getSnapshot();
    expect(
      projectInAppAgentMessagesForDisplay(
        snapshot.messages,
        snapshot.displayState,
      ).map((message) => message.id),
    ).toEqual([question.id, "assistant-tools"]);
  });

  it("continues a hydrated assistant message that already interleaved a thought", async () => {
    const question = {
      id: "user-question",
      role: "user",
      content: "Why is latency up?",
    } satisfies AgUiMessage;
    const thought = {
      id: "assistant-thought",
      role: "reasoning",
      content: "Checking the traces.",
    } satisfies AgUiMessage;
    const answerBeforeThought = {
      id: "assistant-answer",
      role: "assistant",
      content: "Initial answer.",
    } satisfies AgUiMessage;
    const answerAfterThought = {
      ...answerBeforeThought,
      content: "Initial answer. Final answer.",
    } satisfies AgUiMessage;

    // Mirrors the fold the web server runs over the persisted event log: the
    // assistant answered, a thought was placed, then the same message continued.
    let displayState = createInAppAgentDisplayState();
    displayState = recordInAppAgentMessagesForDisplay(displayState, [
      question,
      answerBeforeThought,
    ]);
    displayState = recordInAppAgentMessagesForDisplay(displayState, [
      question,
      answerBeforeThought,
      thought,
    ]);
    displayState = recordInAppAgentMessagesForDisplay(displayState, [
      question,
      answerAfterThought,
      thought,
    ]);

    const hydrate = vi
      .fn()
      .mockResolvedValueOnce({
        messages: [question, answerAfterThought, thought],
        displayState,
        eventCursor: 7,
        currentRun: runningView.currentRun,
        pendingToolApprovals: [],
      })
      // The post-execution converge would refetch the settled transcript and
      // hide any damage the live tail did, so hold it open.
      .mockImplementation(() => new Promise<never>(() => undefined));

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        [
          sseFrame({
            type: "event",
            sequenceNumber: 8,
            event: {
              type: EventType.RUN_STARTED,
              runId: "run-1",
              threadId: "conversation-1",
            },
          }),
          sseFrame({
            type: "event",
            sequenceNumber: 9,
            event: {
              type: EventType.TEXT_MESSAGE_START,
              messageId: answerAfterThought.id,
              role: "assistant",
            },
          }),
          sseFrame({
            type: "event",
            sequenceNumber: 10,
            event: {
              type: EventType.TEXT_MESSAGE_CONTENT,
              messageId: answerAfterThought.id,
              delta: " And one more.",
            },
          }),
          sseFrame({
            type: "event",
            sequenceNumber: 11,
            event: {
              type: EventType.TEXT_MESSAGE_END,
              messageId: answerAfterThought.id,
            },
          }),
          sseFrame({
            type: "event",
            sequenceNumber: 12,
            event: {
              type: EventType.RUN_FINISHED,
              runId: "run-1",
              threadId: "conversation-1",
            },
          }),
          sseFrame({ type: "done" }),
        ].join(""),
      ),
    );

    const session = new BackgroundExecutionSessionController({
      agent: new InAppAgentBackgroundClient({
        projectId: "project-1",
        conversationId: "conversation-1",
        cursor: -1,
        startRun: vi.fn(),
      }),
      hydrate,
      cancelRun: vi.fn(),
      decideApproval: vi.fn(),
    });

    await session.hydrateAndAttach();
    await vi.waitFor(() => {
      expect(
        session
          .getSnapshot()
          .messages.find((message) => message.id === answerAfterThought.id),
      ).toMatchObject({
        content: "Initial answer. Final answer. And one more.",
      });
    });

    const snapshot = session.getSnapshot();
    // The canonical transcript stays one assistant message: no synthetic
    // display-text sibling was ever seeded into the agent.
    expect(snapshot.messages.map((message) => message.id)).toEqual([
      question.id,
      answerAfterThought.id,
      thought.id,
    ]);
    expect(
      projectInAppAgentMessagesForDisplay(
        snapshot.messages,
        snapshot.displayState,
      ).map((message) => ({ id: message.id, content: message.content })),
    ).toEqual([
      { id: question.id, content: question.content },
      { id: answerAfterThought.id, content: "Initial answer." },
      { id: thought.id, content: thought.content },
      {
        id: `display-text-${answerAfterThought.id}-1`,
        content: " Final answer. And one more.",
      },
    ]);
  });
});

describe("InAppAgentBackgroundClient reconnect", () => {
  it("publishes a cancellable queued run as soon as start succeeds", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(sseFrame({ type: "done" })),
    );
    const onStatus = vi.fn();
    const client = new InAppAgentBackgroundClient({
      projectId: "project-1",
      conversationId: "conversation-1",
      cursor: -1,
      startRun: vi.fn().mockResolvedValue({ runId: "run-1" }),
      onStatus,
    });

    client.addMessage({
      id: "message-1",
      role: "user",
      content: "Investigate this project",
    });
    await client.runAgent({ context: [] });

    expect(onStatus).toHaveBeenCalledWith({
      type: "status",
      runId: "run-1",
      status: InAppAgentRunStatus.QUEUED,
      errorCode: null,
      cancelRequested: false,
    });
  });

  it("continues from its cursor and delivers each event once", async () => {
    const frames = [
      sseFrame({
        type: "event",
        sequenceNumber: 0,
        event: {
          type: EventType.RUN_STARTED,
          runId: "run-1",
          threadId: "conversation-1",
        },
      }),
      [
        sseFrame({
          type: "event",
          sequenceNumber: 1,
          event: {
            type: EventType.RUN_FINISHED,
            runId: "run-1",
            threadId: "conversation-1",
          },
        }),
        sseFrame({ type: "done" }),
      ].join(""),
    ];
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(frames.shift() ?? ""));
    const client = new InAppAgentBackgroundClient({
      projectId: "project-1",
      conversationId: "conversation-1",
      cursor: -1,
      startRun: vi.fn(),
    });
    const events: string[] = [];

    await new Promise<void>((resolve, reject) => {
      client.connect().subscribe({
        next: (event) => events.push(event.type),
        error: reject,
        complete: resolve,
      });
    });

    expect(events).toEqual([EventType.RUN_STARTED, EventType.RUN_FINISHED]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("cursor=-1");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("cursor=0");
  });

  it("backs off and stops after repeated responses make no progress", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(""));
    const client = new InAppAgentBackgroundClient({
      projectId: "project-1",
      conversationId: "conversation-1",
      cursor: -1,
      startRun: vi.fn(),
    });
    const error = new Promise<unknown>((resolve) => {
      client.connect().subscribe({ error: resolve });
    });

    await vi.runAllTimersAsync();

    await expect(error).resolves.toMatchObject({
      message: "Assistant watch closed repeatedly without progress",
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("fails visibly when the watch returns an invalid frame", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        [
          sseFrame({ type: "event", sequenceNumber: "invalid" }),
          sseFrame({ type: "done" }),
        ].join(""),
      ),
    );
    const client = new InAppAgentBackgroundClient({
      projectId: "project-1",
      conversationId: "conversation-1",
      cursor: -1,
      startRun: vi.fn(),
    });
    const result = new Promise<unknown>((resolve) => {
      client.connect().subscribe({
        error: resolve,
        complete: () => {
          resolve("completed");
        },
      });
    });

    await expect(result).resolves.toMatchObject({
      message: "Assistant watch returned an invalid frame",
      retryable: false,
    });
  });
});

function sseFrame(frame: Record<string, unknown>): string {
  return `event: ${String(frame.type)}\ndata: ${JSON.stringify(frame)}\n\n`;
}
