import { EventType } from "@ag-ui/core";

import {
  getInAppAgentInstrumentationObservationId,
  getInAppAgentInstrumentationTraceId,
  getInAppAgentLlmCallName,
  getInAppAgentLlmCallObservationId,
} from "@langfuse/shared/in-app-agent";
import type { AgUiRunAgentInput } from "@langfuse/shared/in-app-agent";
import { InAppAgentInstrumentation } from "@langfuse/shared/in-app-agent/server/instrumentation";

const runId = "run-1";
const traceId = getInAppAgentInstrumentationTraceId(runId);
const agentRunObservationId = getInAppAgentInstrumentationObservationId(runId);

const mocks = vi.hoisted(() => {
  const trace = {
    generation: vi.fn(),
    update: vi.fn(),
  };
  const handler = {
    langfuse: {
      trace: vi.fn(() => trace),
      enqueue: vi.fn(),
    },
  };

  return {
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
  runId,
  state: null,
  messages: [{ id: "message-1", role: "user", content: "hello" }],
  tools: [],
  context: [],
  forwardedProps: {},
};
const expectedAgentRunInput = {
  messages: [{ role: "user", content: "hello" }],
};

describe("InAppAgentInstrumentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records agent output and tool calls as tool observations", () => {
    const instrumentation = createInstrumentation();
    const toolCall = {
      id: "tool-1",
      name: "listObservations",
      arguments: '{"limit":10}',
      type: "function",
    };
    const toolOutput = { traces: [{ id: "trace-1" }] };

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
        parentMessageId: "assistant-message-1",
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
        content: JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify(toolOutput),
            },
          ],
        }),
      },
      {
        type: EventType.RUN_FINISHED,
      },
    ]);

    expect(mocks.getInternalTracingHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "prod",
        metadata: {
          langfuse_project_id: "project-1",
          langfuse_user_email: "user@example.com",
          langfuse_user_project_role: "ADMIN",
          langfuse_user_is_admin: true,
        },
        targetProjectId: "project-1",
        traceId,
        traceName: "agent-turn",
        userId: "user-1",
      }),
    );
    expect(mocks.handler.langfuse.trace).toHaveBeenCalledWith(
      expect.objectContaining({ id: traceId, name: "agent-turn" }),
    );
    expect(mocks.handler.langfuse.trace).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expectedAgentRunInput,
      }),
    );
    expect(mocks.trace.generation).not.toHaveBeenCalled();
    expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
      "tool-create",
      expect.objectContaining({
        id: "tool-1",
        traceId,
        parentObservationId: agentRunObservationId,
        name: "listObservations",
        input: { limit: 10 },
        output: toolOutput,
        startTime: expect.any(Date),
        endTime: expect.any(Date),
        completionStartTime: expect.any(Date),
        metadata: expect.objectContaining({
          toolCallId: "tool-1",
          parentMessageId: "assistant-message-1",
        }),
      }),
    );
    expect(
      mocks.handler.langfuse.enqueue.mock.calls.find(
        ([type]) => type === "tool-create",
      )?.[1].metadata,
    ).not.toHaveProperty("toolCallApproval");
    expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
      "agent-create",
      expect.objectContaining({
        id: agentRunObservationId,
        traceId,
        name: "agent-turn",
        input: expectedAgentRunInput,
        output: {
          messages: [
            { role: "assistant", content: "hi there" },
            {
              role: "assistant",
              content: "",
              tool_calls: [toolCall],
            },
            {
              role: "tool",
              tool_call_id: "tool-1",
              content: toolOutput,
            },
          ],
          text: "hi there",
          tool_calls: [toolCall],
        },
      }),
    );
    const agentCreateBody = mocks.handler.langfuse.enqueue.mock.calls.find(
      ([type]) => type === "agent-create",
    )?.[1];
    expect(agentCreateBody).not.toHaveProperty("usageDetails");
    expect(agentCreateBody).not.toHaveProperty("model");
    expect(mocks.handler.langfuse.enqueue).not.toHaveBeenCalledWith(
      "span-create",
      expect.anything(),
    );
    expect(mocks.trace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expectedAgentRunInput,
        output: {
          messages: [
            { role: "assistant", content: "hi there" },
            {
              role: "assistant",
              content: "",
              tool_calls: [toolCall],
            },
            {
              role: "tool",
              tool_call_id: "tool-1",
              content: toolOutput,
            },
          ],
          text: "hi there",
          tool_calls: [toolCall],
        },
      }),
    );
  });

  it.each(["approved", "rejected"] as const)(
    "records manual tool approval metadata as %s",
    (status) => {
      const instrumentation = createInstrumentation();

      instrumentation.recordToolCallApproval({
        toolCallId: "tool-1",
        status,
      });
      instrumentation.recordEvents([
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: "tool-1",
          toolCallName: "createScoreConfig",
          parentMessageId: "tool-1-approval-tool-call",
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: "tool-1",
          delta: '{"name":"readiness"}',
        },
        {
          type: EventType.TOOL_CALL_END,
          toolCallId: "tool-1",
        },
        {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: "tool-1",
          content: "ok",
        },
      ]);

      expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
        "tool-create",
        expect.objectContaining({
          metadata: expect.objectContaining({
            toolCallId: "tool-1",
            parentMessageId: "tool-1-approval-tool-call",
            toolCallApproval: status,
          }),
        }),
      );
    },
  );

  it("records run failures on the root agent observation", () => {
    const instrumentation = createInstrumentation();
    const toolCall = {
      id: "tool-1",
      name: "getTrace",
      arguments: '{"traceId":',
      type: "function",
    };

    instrumentation.recordEvents([
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tool-1",
        toolCallName: "getTrace",
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-1",
        delta: '{"traceId":',
      },
    ]);
    instrumentation.endWithError(new Error("agent failed"));

    expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
      "tool-create",
      expect.objectContaining({
        input: '{"traceId":',
        level: "ERROR",
        statusMessage: "agent failed",
        metadata: expect.objectContaining({
          argsComplete: false,
          error: "agent failed",
        }),
      }),
    );
    expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
      "agent-create",
      expect.objectContaining({
        id: agentRunObservationId,
        name: "agent-turn",
        input: expectedAgentRunInput,
        output: {
          messages: [
            {
              role: "assistant",
              content: "",
              tool_calls: [toolCall],
            },
          ],
          tool_calls: [toolCall],
        },
        level: "ERROR",
        statusMessage: "agent failed",
        metadata: expect.objectContaining({ error: "agent failed" }),
      }),
    );
  });

  it("records available tools & skills on the agent observation input", () => {
    const instrumentation = createInstrumentation();

    instrumentation.recordAvailableTools({
      langfuse_listObservations: {
        description: "List observations in a project.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            includeErrors: { type: "boolean", nullable: true },
            limit: { type: "number", required: false },
          },
        },
      },
      langfuse_redirect: {
        description: "Redirect the user to a Langfuse page.",
        inputSchema: {
          parse: vi.fn(),
        },
      },
    });
    instrumentation.recordAvailableSkills([
      {
        name: "error-analysis",
        description: "Investigate errors in the current trace.",
      },
      {
        description: "Missing skill name should be ignored.",
      },
    ]);
    instrumentation.end();

    expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
      "agent-create",
      expect.objectContaining({
        name: "agent-turn",
        input: {
          messages: [{ role: "user", content: "hello" }],
          tools: [
            {
              type: "function",
              function: {
                name: "langfuse_listObservations",
                description: "List observations in a project.",
                parameters: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    includeErrors: { type: "boolean", nullable: true },
                    limit: { type: "number", required: false },
                  },
                },
              },
            },
            {
              type: "function",
              function: {
                name: "langfuse_redirect",
                description: "Redirect the user to a Langfuse page.",
              },
            },
          ],
          skills: [
            {
              name: "error-analysis",
              description: "Investigate errors in the current trace.",
            },
          ],
        },
      }),
    );
  });

  it("marks tool observations with structured error outputs as error level", () => {
    const instrumentation = createInstrumentation();

    instrumentation.recordEvents([
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tool-1",
        toolCallName: "listObservations",
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-1",
        delta: '{"type":"TRACE"}',
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: "tool-1",
      },
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: "tool-1",
        content: JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: "Tool input validation failed",
              }),
            },
          ],
        }),
      },
    ]);

    const toolCreateBody = mocks.handler.langfuse.enqueue.mock.calls.find(
      ([type]) => type === "tool-create",
    )?.[1];

    expect(toolCreateBody).toEqual(
      expect.objectContaining({
        input: { type: "TRACE" },
        output: {
          error: true,
          message: "Tool input validation failed",
        },
        level: "ERROR",
        statusMessage: "Tool input validation failed",
      }),
    );
  });

  it.each([
    {
      name: "top-level event errors",
      content: "Tool execution failed",
      error: "Tool execution failed",
      expectedOutput: "Tool execution failed",
      expectedMessage: "Tool execution failed",
    },
    {
      name: "boolean isError payloads",
      content: JSON.stringify({
        isError: true,
        message: "Tool returned an error",
      }),
      expectedOutput: {
        isError: true,
        message: "Tool returned an error",
      },
      expectedMessage: "Tool returned an error",
    },
    {
      name: "JSON-encoded approval rejection errors",
      content: "Tool call was not approved by the user.",
      error: JSON.stringify({
        code: "tool_call_rejected",
        message: "Tool call was not approved by the user.",
      }),
      expectedOutput: "Tool call was not approved by the user.",
      expectedMessage: "Tool call was not approved by the user.",
    },
  ])(
    "marks $name as failed with statusMessage",
    ({ content, error, expectedOutput, expectedMessage }) => {
      const instrumentation = createInstrumentation();

      instrumentation.recordEvents([
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: "tool-1",
          toolCallName: "createScoreConfig",
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: "tool-1",
          delta: "{}",
        },
        {
          type: EventType.TOOL_CALL_END,
          toolCallId: "tool-1",
        },
        {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: "tool-1",
          content,
          ...(error ? { error } : {}),
        },
      ]);

      expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
        "tool-create",
        expect.objectContaining({
          output: expectedOutput,
          level: "ERROR",
          statusMessage: expectedMessage,
        }),
      );
    },
  );

  it.each([
    {
      name: "benign content mentioning error",
      content: JSON.stringify({
        message: "This record describes an error handling policy",
      }),
      expectedOutput: {
        message: "This record describes an error handling policy",
      },
    },
    {
      name: "string-valued error fields",
      content: JSON.stringify({
        error: "McpError: MCP error -32602: invalid score config",
      }),
      expectedOutput: {
        error: "McpError: MCP error -32602: invalid score config",
      },
    },
    {
      name: "bare MCP error strings",
      content: "MCP error -32600: Invalid Request",
      expectedOutput: "MCP error -32600: Invalid Request",
    },
  ])(
    "does not classify $name as a structured tool failure",
    ({ content, expectedOutput }) => {
      const instrumentation = createInstrumentation();

      instrumentation.recordEvents([
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: "tool-1",
          toolCallName: "search",
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: "tool-1",
          delta: "{}",
        },
        {
          type: EventType.TOOL_CALL_END,
          toolCallId: "tool-1",
        },
        {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: "tool-1",
          content,
        },
      ]);

      const toolCreateBody = mocks.handler.langfuse.enqueue.mock.calls.find(
        ([type]) => type === "tool-create",
      )?.[1];
      expect(toolCreateBody).toEqual(
        expect.objectContaining({
          output: expectedOutput,
        }),
      );
      expect(toolCreateBody).not.toHaveProperty("level");
      expect(toolCreateBody).not.toHaveProperty("statusMessage");
    },
  );

  it("sets static prompt metadata on the trace and root agent observation", () => {
    const instrumentation = createInstrumentation(undefined, {
      name: "in-app-agent-system-prompt",
      version: 3,
    });

    expect(mocks.getInternalTracingHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: {
          name: "in-app-agent-system-prompt",
          version: 3,
        },
        metadata: {
          langfuse_project_id: "project-1",
          langfuse_user_email: "user@example.com",
          langfuse_user_project_role: "ADMIN",
          langfuse_user_is_admin: true,
          prompt_name: "in-app-agent-system-prompt",
          prompt_version: 3,
        },
      }),
    );
    expect(mocks.handler.langfuse.trace).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          langfuse_project_id: "project-1",
          langfuse_user_email: "user@example.com",
          langfuse_user_project_role: "ADMIN",
          langfuse_user_is_admin: true,
          prompt_name: "in-app-agent-system-prompt",
          prompt_version: 3,
        },
      }),
    );
    expect(mocks.trace.generation).not.toHaveBeenCalled();

    instrumentation.end();

    expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
      "agent-create",
      expect.objectContaining({
        id: agentRunObservationId,
        name: "agent-turn",
        input: expectedAgentRunInput,
        promptName: "in-app-agent-system-prompt",
        promptVersion: 3,
      }),
    );
  });

  it("writes trace input and output", () => {
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

    expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
      "agent-create",
      expect.objectContaining({
        name: "agent-turn",
        input: expectedAgentRunInput,
        output: {
          messages: [{ role: "assistant", content: "second turn output" }],
          text: "second turn output",
        },
      }),
    );
    expect(mocks.trace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expectedAgentRunInput,
        output: {
          messages: [{ role: "assistant", content: "second turn output" }],
          text: "second turn output",
        },
      }),
    );
  });

  it("records AG-UI context in the agent turn input", () => {
    createInstrumentation({
      context: [
        {
          description: "current_url",
          value:
            "https://cloud.langfuse.com/project/project-1/traces?filter=value",
        },
        {
          description: "browser_languages",
          value: "en-US, en, de",
        },
        {
          description: "current_trace",
          value: JSON.stringify({ id: "trace-1" }),
        },
      ],
    });

    expect(mocks.trace.generation).not.toHaveBeenCalled();
    expect(mocks.handler.langfuse.trace).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          messages: [{ role: "user", content: "hello" }],
          context: {
            current_url:
              "https://cloud.langfuse.com/project/project-1/traces?filter=value",
            browser_languages: ["en-US", "en", "de"],
            current_trace: { id: "trace-1" },
          },
        },
      }),
    );
  });

  it("records only the current turn messages in the agent turn input", () => {
    createInstrumentation({
      messages: [
        {
          id: "message-previous-user",
          role: "user",
          content: "previous question",
        },
        {
          id: "message-previous-assistant",
          role: "assistant",
          content: "previous answer",
          toolCalls: [
            {
              id: "tool-previous",
              type: "function",
              function: {
                name: "getTrace",
                arguments: '{"traceId":"trace-1"}',
              },
            },
          ],
        },
        {
          id: "message-previous-tool",
          role: "tool",
          toolCallId: "tool-previous",
          content: '{"found":true}',
        },
        {
          id: "message-activity",
          role: "activity",
          activityType: "loading",
          content: { label: "Loading" },
        },
        {
          id: "message-1",
          role: "user",
          content: "hello",
        },
      ],
    });

    expect(mocks.handler.langfuse.trace).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "agent-turn",
        input: {
          messages: [{ role: "user", content: "hello" }],
        },
      }),
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

    expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
      "agent-create",
      expect.objectContaining({
        name: "agent-turn",
        input: expectedAgentRunInput,
        output: {
          messages: [{ role: "assistant", content: "chunk output" }],
          text: "chunk output",
        },
      }),
    );
  });

  it("records reasoning as thinking parts on the assistant output messages", () => {
    const instrumentation = createInstrumentation();
    const toolCall = {
      id: "tool-1",
      name: "listObservations",
      arguments: '{"limit":10}',
      type: "function",
    };
    const toolOutput = { traces: [{ id: "trace-1" }] };

    instrumentation.recordEvents([
      {
        type: EventType.REASONING_MESSAGE_START,
        messageId: "reasoning-1",
      },
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
        type: EventType.REASONING_MESSAGE_END,
        messageId: "reasoning-1",
      },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tool-1",
        toolCallName: "listObservations",
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-1",
        delta: '{"limit":10}',
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: "tool-1",
      },
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: "tool-1",
        content: JSON.stringify(toolOutput),
      },
      {
        type: EventType.REASONING_MESSAGE_START,
        messageId: "reasoning-2",
      },
      {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: "reasoning-2",
        delta: "Drafting the answer",
      },
      {
        type: EventType.REASONING_MESSAGE_END,
        messageId: "reasoning-2",
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: "Done",
      },
      {
        type: EventType.RUN_FINISHED,
      },
    ]);

    expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
      "agent-create",
      expect.objectContaining({
        name: "agent-turn",
        input: expectedAgentRunInput,
        output: {
          messages: [
            {
              role: "assistant",
              content: "",
              thinking: [{ type: "thinking", content: "Checking filters" }],
              tool_calls: [toolCall],
            },
            { role: "tool", tool_call_id: "tool-1", content: toolOutput },
            {
              role: "assistant",
              content: "Done",
              thinking: [{ type: "thinking", content: "Drafting the answer" }],
            },
          ],
          text: "Done",
          tool_calls: [toolCall],
        },
      }),
    );
    const agentCreateBody = mocks.handler.langfuse.enqueue.mock.calls.find(
      ([type]) => type === "agent-create",
    )?.[1] as { metadata?: Record<string, unknown> };
    expect(agentCreateBody.metadata).not.toHaveProperty("reasoning");
  });

  it("records reasoning without a following assistant message as its own thinking message", () => {
    const instrumentation = createInstrumentation();

    instrumentation.recordEvents([
      {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: "reasoning-1",
        delta: "Checking filters",
      },
      {
        type: EventType.RUN_FINISHED,
      },
    ]);

    expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
      "agent-create",
      expect.objectContaining({
        name: "agent-turn",
        output: {
          messages: [
            {
              role: "assistant",
              content: "",
              thinking: [{ type: "thinking", content: "Checking filters" }],
            },
          ],
        },
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

    expect(mocks.handler.langfuse.enqueue).not.toHaveBeenCalledWith(
      "tool-create",
      expect.anything(),
    );
  });

  it("emits one generation per LLM step with usage on children only", () => {
    const instrumentation = createInstrumentation();
    const modelName = "eu.anthropic.claude-sonnet-4-5-20250929-v1:0";

    // Root agent observation must exist before children so tools/generations
    // do not orphan onto the trace.
    expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
      "agent-create",
      expect.objectContaining({
        id: agentRunObservationId,
        name: "agent-turn",
      }),
    );

    instrumentation.recordStreamChunk({
      type: "step-start",
      payload: {},
    });
    instrumentation.recordStreamChunk({
      type: "tool-call",
      payload: { toolCallId: "tool-1", toolName: "listObservations" },
    });
    instrumentation.recordEvents([
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tool-1",
        toolCallName: "listObservations",
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-1",
        delta: '{"limit":10}',
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: "tool-1",
      },
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: "tool-1",
        content: '{"ok":true}',
      },
    ]);
    instrumentation.recordStreamChunk({
      type: "tool-result",
      payload: { toolCallId: "tool-1", toolName: "listObservations" },
    });
    instrumentation.recordStepFinish({
      usage: {
        inputTokens: 1100,
        outputTokens: 50,
        totalTokens: 1150,
        cachedInputTokens: 800,
        cacheCreationInputTokens: 100,
      },
      finishReason: "tool-calls",
      text: "",
      response: {
        messages: [
          {
            role: "assistant",
            content: "",
            tool_calls: [{ id: "tool-1" }],
          },
        ],
      },
    });

    instrumentation.recordStreamChunk({ type: "step-start", payload: {} });
    instrumentation.recordStreamChunk({
      type: "text-delta",
      payload: { text: "Done" },
    });
    instrumentation.recordEvents([
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: "Done",
      },
    ]);
    instrumentation.recordStepFinish({
      usage: {
        inputTokens: 1200,
        outputTokens: 30,
        totalTokens: 1230,
        cachedInputTokens: 1000,
      },
      finishReason: "stop",
      text: "Done",
    });
    instrumentation.end({});

    const generationCreates = mocks.handler.langfuse.enqueue.mock.calls.filter(
      ([type]) => type === "generation-create",
    );
    expect(generationCreates).toHaveLength(2);

    expect(generationCreates[0]?.[1]).toEqual(
      expect.objectContaining({
        id: getInAppAgentLlmCallObservationId(runId, 1),
        name: getInAppAgentLlmCallName(modelName),
        parentObservationId: agentRunObservationId,
        model: modelName,
        usageDetails: {
          input: 200,
          output: 50,
          cache_read_input_tokens: 800,
          cache_creation_input_tokens: 100,
          total: 1150,
        },
        metadata: expect.objectContaining({
          finish_reason: "tool-calls",
        }),
      }),
    );
    expect(generationCreates[0]?.[1].input.messages).toHaveLength(1);

    expect(generationCreates[1]?.[1]).toEqual(
      expect.objectContaining({
        id: getInAppAgentLlmCallObservationId(runId, 2),
        name: getInAppAgentLlmCallName(modelName),
        parentObservationId: agentRunObservationId,
        model: modelName,
        usageDetails: {
          input: 200,
          output: 30,
          cache_read_input_tokens: 1000,
          cache_creation_input_tokens: 0,
          total: 1230,
        },
        metadata: expect.objectContaining({
          finish_reason: "stop",
        }),
      }),
    );
    expect(generationCreates[1]?.[1].input.messages.length).toBeGreaterThan(
      generationCreates[0]?.[1].input.messages.length,
    );

    const agentCreates = mocks.handler.langfuse.enqueue.mock.calls.filter(
      ([type]) => type === "agent-create",
    );
    const finalAgentCreate = agentCreates.at(-1)?.[1];
    expect(finalAgentCreate).toEqual(
      expect.objectContaining({
        id: agentRunObservationId,
        name: "agent-turn",
      }),
    );
    expect(finalAgentCreate).not.toHaveProperty("usageDetails");
    expect(finalAgentCreate).not.toHaveProperty("model");
  });

  it("uses stream chunk timestamps for parallel tool observations under the root", () => {
    const instrumentation = createInstrumentation();
    const toolAStart = new Date("2026-01-01T00:00:01.000Z");
    const toolBStart = new Date("2026-01-01T00:00:02.000Z");
    const toolAEnd = new Date("2026-01-01T00:00:03.000Z");
    const toolBEnd = new Date("2026-01-01T00:00:04.000Z");

    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    instrumentation.recordStreamChunk({ type: "step-start", payload: {} });

    vi.setSystemTime(toolAStart);
    instrumentation.recordStreamChunk({
      type: "tool-call",
      payload: { toolCallId: "tool-a", toolName: "listObservations" },
    });
    vi.setSystemTime(toolBStart);
    instrumentation.recordStreamChunk({
      type: "tool-call",
      payload: { toolCallId: "tool-b", toolName: "getTrace" },
    });

    instrumentation.recordEvents([
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tool-a",
        toolCallName: "listObservations",
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-a",
        delta: "{}",
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: "tool-a",
      },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tool-b",
        toolCallName: "getTrace",
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-b",
        delta: "{}",
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: "tool-b",
      },
    ]);

    vi.setSystemTime(toolAEnd);
    instrumentation.recordStreamChunk({
      type: "tool-result",
      payload: { toolCallId: "tool-a", toolName: "listObservations" },
    });
    instrumentation.recordEvents([
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: "tool-a",
        content: '{"a":1}',
      },
    ]);

    vi.setSystemTime(toolBEnd);
    instrumentation.recordStreamChunk({
      type: "tool-result",
      payload: { toolCallId: "tool-b", toolName: "getTrace" },
    });
    instrumentation.recordEvents([
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: "tool-b",
        content: '{"b":2}',
      },
    ]);

    instrumentation.recordStepFinish({
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      finishReason: "tool-calls",
    });

    const toolCreates = mocks.handler.langfuse.enqueue.mock.calls.filter(
      ([type]) => type === "tool-create",
    );
    expect(toolCreates).toHaveLength(2);
    expect(toolCreates[0]?.[1]).toEqual(
      expect.objectContaining({
        id: "tool-a",
        parentObservationId: agentRunObservationId,
        startTime: toolAStart,
        endTime: toolAEnd,
      }),
    );
    expect(toolCreates[1]?.[1]).toEqual(
      expect.objectContaining({
        id: "tool-b",
        parentObservationId: agentRunObservationId,
        startTime: toolBStart,
        endTime: toolBEnd,
      }),
    );

    vi.useRealTimers();
  });

  it("closes an open LLM step as ERROR when the run is aborted", () => {
    const instrumentation = createInstrumentation();
    const modelName = "eu.anthropic.claude-sonnet-4-5-20250929-v1:0";

    instrumentation.recordStreamChunk({ type: "step-start", payload: {} });
    instrumentation.end({ aborted: true });

    expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
      "generation-create",
      expect.objectContaining({
        id: getInAppAgentLlmCallObservationId(runId, 1),
        name: getInAppAgentLlmCallName(modelName),
        parentObservationId: agentRunObservationId,
        level: "ERROR",
        statusMessage: "aborted",
      }),
    );
    expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
      "agent-create",
      expect.objectContaining({
        id: agentRunObservationId,
        metadata: expect.objectContaining({ aborted: true }),
      }),
    );
  });

  it("emits a generation when step finish arrives without a prior step-start", () => {
    const instrumentation = createInstrumentation();

    instrumentation.recordStepFinish({
      usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 },
      finishReason: "stop",
    });
    instrumentation.end({});

    expect(mocks.handler.langfuse.enqueue).toHaveBeenCalledWith(
      "generation-create",
      expect.objectContaining({
        id: getInAppAgentLlmCallObservationId(runId, 1),
        usageDetails: {
          input: 100,
          output: 10,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          total: 110,
        },
        model: "eu.anthropic.claude-sonnet-4-5-20250929-v1:0",
      }),
    );
  });

  it("names generations with the configured model even when usage is missing", () => {
    const instrumentation = createInstrumentation();
    const modelName = "eu.anthropic.claude-sonnet-4-5-20250929-v1:0";

    instrumentation.recordStreamChunk({ type: "step-start", payload: {} });
    instrumentation.recordStepFinish(undefined);
    instrumentation.end({});

    const generationBody = mocks.handler.langfuse.enqueue.mock.calls.find(
      ([type]) => type === "generation-create",
    )?.[1];
    expect(generationBody).toEqual(
      expect.objectContaining({
        name: getInAppAgentLlmCallName(modelName),
      }),
    );
    // Without usage, do not attach model to the body (avoids tokenizer cost estimates).
    expect(generationBody).not.toHaveProperty("usageDetails");
    expect(generationBody).not.toHaveProperty("model");

    const finalAgentCreate = mocks.handler.langfuse.enqueue.mock.calls
      .filter(([type]) => type === "agent-create")
      .at(-1)?.[1];
    expect(finalAgentCreate).not.toHaveProperty("usageDetails");
    expect(finalAgentCreate).not.toHaveProperty("model");
  });

  it("ignores step finish events after instrumentation ended", () => {
    const instrumentation = createInstrumentation();

    instrumentation.end({});
    instrumentation.recordStepFinish({
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });

    expect(mocks.handler.langfuse.enqueue).not.toHaveBeenCalledWith(
      "generation-create",
      expect.anything(),
    );
  });
});

function createInstrumentation(
  overrides?: Partial<AgUiRunAgentInput>,
  prompt?: { name: string; version: number },
) {
  return new InAppAgentInstrumentation({
    input: { ...input, ...overrides },
    metadata: { langfuse_project_id: "project-1" },
    userId: "user-1",
    userEmail: "user@example.com",
    userProjectRole: "ADMIN",
    userIsAdmin: true,
    runId: input.runId,
    targetProjectId: "project-1",
    environment: "prod",
    prompt,
    model: "eu.anthropic.claude-sonnet-4-5-20250929-v1:0",
  });
}
