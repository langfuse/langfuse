import { EventType } from "@ag-ui/core";

import type { AgUiRunAgentInput } from "@/src/ee/features/in-app-agent/schema";
import { InAppAgentInstrumentation } from "@/src/ee/features/in-app-agent/server/instrumentation";

const traceId = "0123456789abcdef0123456789abcdef";

const mocks = vi.hoisted(() => {
  const toolSpan = {
    update: vi.fn(),
    end: vi.fn(),
  };
  const agentSpan = {
    observationId: "agent-span-1",
    traceId: "0123456789abcdef0123456789abcdef",
    span: vi.fn(() => toolSpan),
    update: vi.fn(),
    end: vi.fn(),
  };
  const trace = {
    span: vi.fn(() => agentSpan),
    update: vi.fn(),
  };
  const handler = {
    langfuse: {
      trace: vi.fn(() => trace),
      enqueue: vi.fn(),
    },
  };

  return {
    agentSpan,
    toolSpan,
    trace,
    handler,
    processTracedEvents: vi.fn(async () => undefined),
    getInternalTracingHandler: vi.fn(() => ({
      handler,
      processTracedEvents: vi.fn(async () => undefined),
    })),
  };
});

vi.mock("@langfuse/shared/src/server", () => ({
  getInternalTracingHandler: mocks.getInternalTracingHandler,
  redis: undefined,
  ClickHouseClientManager: {
    getInstance: vi.fn(() => ({
      closeAllConnections: vi.fn(async () => undefined),
    })),
  },
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const input: AgUiRunAgentInput = {
  threadId: "conversation-1",
  runId: "run-1",
  state: null,
  messages: [{ id: "message-1", role: "user", content: "hello" }],
  tools: [],
  context: [],
  forwardedProps: {},
};

describe("InAppAgentInstrumentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records agent output and tool calls as tool observations", () => {
    const instrumentation = createInstrumentation();

    instrumentation.recordEvents([
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: "hi ",
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: "there",
      },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tool-1",
        toolCallName: "listObservations",
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-1",
        delta: '{"limit":',
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-1",
        delta: "10}",
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: "tool-1",
      },
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: "tool-1",
        content: "tool result",
      },
      {
        type: EventType.RUN_FINISHED,
      },
    ]);

    expect(mocks.getInternalTracingHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "prod",
        metadata: { langfuse_project_id: "project-1" },
        targetProjectId: "project-1",
        traceId,
        traceName: "in-app-agent",
        userId: "user-1",
      }),
    );
    expect(mocks.handler.langfuse.trace).toHaveBeenCalledWith(
      expect.objectContaining({ id: traceId, name: "in-app-agent" }),
    );
    expect(mocks.handler.langfuse.trace.mock.calls[0][0]).not.toHaveProperty(
      "input",
    );
    expect(mocks.trace.span).toHaveBeenCalledWith(
      expect.objectContaining({ name: "agent-run", input: "hello" }),
    );
    expect(mocks.agentSpan.span).not.toHaveBeenCalled();
    expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
      "tool-create",
      expect.objectContaining({
        id: "tool-1",
        traceId,
        parentObservationId: "agent-span-1",
        name: "listObservations",
        input: { limit: 10 },
        output: "tool result",
        startTime: expect.any(Date),
        endTime: expect.any(Date),
        completionStartTime: expect.any(Date),
        metadata: expect.objectContaining({ toolCallId: "tool-1" }),
      }),
    );
    expect(mocks.agentSpan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        output: "hi there",
      }),
    );
    expect(mocks.trace.update.mock.calls[0][0]).not.toHaveProperty("output");
  });

  it("records run failures on the agent span", () => {
    const instrumentation = createInstrumentation();

    instrumentation.recordEvents([
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tool-1",
        toolCallName: "getTrace",
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-1",
        delta: '{"traceId":"trace-1"}',
      },
    ]);
    instrumentation.endWithError(new Error("agent failed"));

    expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
      "tool-create",
      expect.objectContaining({
        input: { traceId: "trace-1" },
        level: "ERROR",
        statusMessage: "agent failed",
        metadata: expect.objectContaining({ error: "agent failed" }),
      }),
    );
    expect(mocks.agentSpan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "ERROR",
        statusMessage: "agent failed",
        metadata: expect.objectContaining({ error: "agent failed" }),
      }),
    );
  });

  it("does not write trace input and output", () => {
    const instrumentation = createInstrumentation();

    instrumentation.recordEvents([
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: "second turn output",
      },
      {
        type: EventType.RUN_FINISHED,
      },
    ]);

    expect(mocks.handler.langfuse.trace.mock.calls[0][0]).not.toHaveProperty(
      "input",
    );
    expect(mocks.agentSpan.update).toHaveBeenCalledWith(
      expect.objectContaining({ output: "second turn output" }),
    );
    expect(mocks.trace.update.mock.calls[0][0]).not.toHaveProperty("output");
  });

  it("records AG-UI context in the agent span input", () => {
    createInstrumentation({
      context: [
        {
          description: "current_url",
          value:
            "https://cloud.langfuse.com/project/project-1/traces?filter=value",
        },
      ],
    });

    expect(mocks.trace.span).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "agent-run",
        input: {
          message: "hello",
          context: [
            {
              description: "current_url",
              value:
                "https://cloud.langfuse.com/project/project-1/traces?filter=value",
            },
          ],
        },
      }),
    );
    expect(mocks.handler.langfuse.trace.mock.calls[0][0]).not.toHaveProperty(
      "input",
    );
  });

  it("compacts text message chunks before recording output", () => {
    const instrumentation = createInstrumentation();

    instrumentation.recordEvents([
      {
        type: EventType.TEXT_MESSAGE_CHUNK,
        messageId: "assistant-message-1",
        role: "assistant",
        delta: "chunk ",
      },
      {
        type: EventType.TEXT_MESSAGE_CHUNK,
        messageId: "assistant-message-1",
        delta: "output",
      },
      {
        type: EventType.RUN_FINISHED,
      },
    ]);

    expect(mocks.agentSpan.update).toHaveBeenCalledWith(
      expect.objectContaining({ output: "chunk output" }),
    );
  });

  it("records reasoning text in agent span metadata", () => {
    const instrumentation = createInstrumentation();

    instrumentation.recordEvents([
      {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: "reasoning-1",
        delta: "Checking ",
      },
      {
        type: EventType.REASONING_MESSAGE_CHUNK,
        messageId: "reasoning-1",
        delta: "filters",
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: "Done",
      },
      {
        type: EventType.RUN_FINISHED,
      },
    ]);

    expect(mocks.agentSpan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        output: "Done",
        metadata: expect.objectContaining({ reasoning: "Checking filters" }),
      }),
    );
  });

  it("ignores events after instrumentation ended", () => {
    const instrumentation = createInstrumentation();

    instrumentation.end({});
    instrumentation.recordEvents([
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tool-after-end",
        toolCallName: "lateTool",
      },
    ]);

    expect(mocks.agentSpan.span).not.toHaveBeenCalled();
  });
});

function createInstrumentation(overrides?: Partial<AgUiRunAgentInput>) {
  return new InAppAgentInstrumentation({
    input: { ...input, ...overrides },
    metadata: { langfuse_project_id: "project-1" },
    userId: "user-1",
    traceId,
    targetProjectId: "project-1",
    environment: "prod",
  });
}
