import { EventType } from "@ag-ui/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InAppAgentRunStatus } from "@langfuse/shared";
import type { AgUiMessage } from "@langfuse/shared/in-app-agent";

import { InAppAgentBackgroundClient } from "./backgroundAgentClient";
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
} satisfies Omit<BackgroundExecutionView, "isAttached">;

function createAgent() {
  return {
    setMessages: vi.fn(),
    setCursor: vi.fn(),
    runAgent: vi.fn().mockResolvedValue(undefined),
    connectAgent: vi.fn().mockResolvedValue(undefined),
    abortRun: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("BackgroundExecutionSessionController", () => {
  it("hydrates messages and cursor before attaching", async () => {
    const agent = {
      ...createAgent(),
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
  });

  it("detaches observation without cancelling the server run", async () => {
    const agent = createAgent();
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
    expect(session.getSnapshot().isAttached).toBe(false);
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

  it("keeps the server run active when observation fails", async () => {
    const onError = vi.fn();
    const session = new BackgroundExecutionSessionController({
      agent: {
        ...createAgent(),
        connectAgent: vi.fn().mockRejectedValue(new Error("watch failed")),
      },
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
      isAttached: false,
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

    await expect(error).resolves.toEqual(
      new Error("Assistant watch closed repeatedly without progress"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

function sseFrame(frame: Record<string, unknown>): string {
  return `event: ${String(frame.type)}\ndata: ${JSON.stringify(frame)}\n\n`;
}
