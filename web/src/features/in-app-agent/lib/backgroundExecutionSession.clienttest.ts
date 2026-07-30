import { EventType } from "@ag-ui/core";
import type { AgentSubscriber } from "@ag-ui/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InAppAgentRunStatus } from "@langfuse/shared";
import type { AgUiMessage } from "@langfuse/shared/in-app-agent";

import { InAppAgentBackgroundClient } from "./backgroundAgentClient";
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
  eventCursor: 7,
  currentRun: {
    id: "run-1",
    status: InAppAgentRunStatus.RUNNING,
    errorCode: null,
    cancelRequested: false,
  },
  pendingToolApprovals: [],
} satisfies Omit<BackgroundExecutionView, "attachment" | "liveMessageRevision">;

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
    expect(session.getSnapshot()).toMatchObject({
      attachment: { status: "attached" },
      currentRun: runningView.currentRun,
    });
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

  it("rehydrates an approval continuation before attaching", async () => {
    const order: string[] = [];
    const agent = {
      ...createAgent(),
      setMessages: vi.fn(() => order.push("messages")),
      setCursor: vi.fn(() => order.push("cursor")),
      connectAgent: vi.fn(async () => {
        order.push("attach");
      }),
    };
    const session = new BackgroundExecutionSessionController({
      agent,
      hydrate: vi.fn(async () => {
        order.push("hydrate");
        return runningView;
      }),
      cancelRun: vi.fn(),
      decideApproval: vi.fn(async () => {
        order.push("decide");
      }),
    });

    await session.decide({
      runId: "parked-run",
      toolCallId: "tool-call-1",
      approved: true,
    });

    expect(order).toEqual([
      "decide",
      "hydrate",
      "messages",
      "cursor",
      "attach",
    ]);
  });

  it("restarts attachment after deciding while the parked run is attached", async () => {
    const order: string[] = [];
    const agent = {
      ...createAgent(),
      setMessages: vi.fn(() => order.push("messages")),
      setCursor: vi.fn(() => order.push("cursor")),
      connectAgent: vi.fn(() => {
        order.push("attach");
        return new Promise<unknown>(() => undefined);
      }),
      abortRun: vi.fn(() => order.push("detach")),
    };
    const session = new BackgroundExecutionSessionController({
      agent,
      hydrate: vi.fn(async () => {
        order.push("hydrate");
        return runningView;
      }),
      cancelRun: vi.fn(),
      decideApproval: vi.fn(async () => {
        order.push("decide");
      }),
    });

    await session.hydrateAndAttach();
    await session.decide({
      runId: "parked-run",
      toolCallId: "tool-call-1",
      approved: true,
    });

    expect(order).toEqual([
      "hydrate",
      "messages",
      "cursor",
      "attach",
      "decide",
      "detach",
      "hydrate",
      "messages",
      "cursor",
      "attach",
    ]);
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
