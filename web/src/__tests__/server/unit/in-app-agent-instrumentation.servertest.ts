import { EventType } from "@ag-ui/core";
import type * as LangfuseTracing from "@langfuse/tracing";

import type { AgUiRunAgentInput } from "@/src/features/in-app-agent/schema";
import { InAppAgentInstrumentation } from "@/src/features/in-app-agent/server/instrumentation";

const traceId = "0123456789abcdef0123456789abcdef";

const mocks = vi.hoisted(() => {
  const toolSpan = {
    update: vi.fn(),
    end: vi.fn(),
  };
  const rootSpan = {
    otelSpan: {
      setAttributes: vi.fn(),
      spanContext: vi.fn(() => ({
        traceId: "0123456789abcdef0123456789abcdef",
        spanId: "observation-1",
        traceFlags: 1,
      })),
    },
    startObservation: vi.fn(() => toolSpan),
    setTraceIO: vi.fn(),
    update: vi.fn(),
    end: vi.fn(),
  };
  return {
    rootSpan,
    toolSpan,
    setLangfuseTracerProvider: vi.fn(),
    startObservation: vi.fn(() => rootSpan),
  };
});

vi.mock("@langfuse/tracing", async (importOriginal) => ({
  ...(await importOriginal<typeof LangfuseTracing>()),
  setLangfuseTracerProvider: mocks.setLangfuseTracerProvider,
  startObservation: mocks.startObservation,
}));

const input: AgUiRunAgentInput = {
  threadId: "thread-1",
  runId: "run-1",
  state: null,
  messages: [{ id: "message-1", role: "user", content: "hello" }],
  tools: [],
  context: [],
  forwardedProps: {},
};

function createMockTracerProvider() {
  return {
    forceFlush: vi.fn(async () => undefined),
    getTracer: vi.fn(),
  };
}

describe("InAppAgentInstrumentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records agent output and tool calls as child observations", () => {
    const instrumentation = new InAppAgentInstrumentation({
      tracerProvider: createMockTracerProvider(),
      input,
      metadata: { langfuse_project_id: "project-1" },
      userId: "user-1",
      traceId,
    });

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

    expect(mocks.startObservation).toHaveBeenCalledWith(
      "claude-agent-run",
      expect.objectContaining({
        input: "hello",
      }),
      expect.objectContaining({
        asType: "agent",
        parentSpanContext: expect.objectContaining({ traceId }),
      }),
    );
    expect(mocks.rootSpan.otelSpan.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "langfuse.trace.name": "in-app-agent",
        "session.id": "thread-1",
        "user.id": "user-1",
      }),
    );
    expect(mocks.rootSpan.startObservation).toHaveBeenCalledWith(
      "tool:listObservations",
      expect.any(Object),
      { asType: "tool" },
    );
    expect(mocks.toolSpan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { limit: 10 },
        output: "tool result",
      }),
    );
    expect(mocks.rootSpan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        output: "hi there",
      }),
    );
    expect(mocks.rootSpan.otelSpan.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "langfuse.trace.output": "hi there",
      }),
    );
  });

  it("records run failures on the agent span", () => {
    const instrumentation = new InAppAgentInstrumentation({
      tracerProvider: createMockTracerProvider(),
      input,
      metadata: { langfuse_project_id: "project-1" },
      userId: "user-1",
      traceId,
    });

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

    expect(mocks.toolSpan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { traceId: "trace-1" },
        metadata: expect.objectContaining({ error: "agent failed" }),
      }),
    );

    expect(mocks.rootSpan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ error: "agent failed" }),
      }),
    );
  });
});
