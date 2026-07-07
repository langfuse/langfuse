import { EventType } from "@ag-ui/core";

import {
  getInAppAgentInstrumentationObservationId,
  getInAppAgentInstrumentationTraceId,
} from "@/src/ee/features/in-app-agent/constants";
import type { AgUiRunAgentInput } from "@/src/ee/features/in-app-agent/schema";
import { InAppAgentInstrumentation } from "@/src/ee/features/in-app-agent/server/instrumentation";

const runId = "run-1";
const traceId = getInAppAgentInstrumentationTraceId(runId);
const agentRunObservationId = getInAppAgentInstrumentationObservationId(runId);

const mocks = vi.hoisted(() => {
  const agentGeneration = {
    observationId: "run-1",
    traceId: "run-1-trace",
    update: vi.fn(),
    end: vi.fn(),
  };
  const trace = {
    generation: vi.fn(() => agentGeneration),
    update: vi.fn(),
  };
  const handler = {
    langfuse: {
      trace: vi.fn(() => trace),
      enqueue: vi.fn(),
    },
  };

  return {
    agentGeneration,
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
    expect(mocks.trace.generation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: agentRunObservationId,
        name: "agent-turn",
        input: expectedAgentRunInput,
      }),
    );
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
      mocks.handler.langfuse.enqueue.mock.calls[0]?.[1].metadata,
    ).not.toHaveProperty("toolCallApproval");
    expect(mocks.agentGeneration.update).toHaveBeenCalledWith(
      expect.objectContaining({
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
        completionStartTime: expect.any(Date),
      }),
    );
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

  it("records run failures on the agent generation", () => {
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
    expect(mocks.agentGeneration.update).toHaveBeenCalledWith(
      expect.objectContaining({
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
        completionStartTime: expect.any(Date),
        level: "ERROR",
        statusMessage: "agent failed",
        metadata: expect.objectContaining({ error: "agent failed" }),
      }),
    );
  });

  it("records available tools & skills on the agent generation input", () => {
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

    expect(mocks.agentGeneration.update).toHaveBeenCalledWith(
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

  it("marks tool observations with error outputs as error level", () => {
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

    const toolCreateBody = mocks.handler.langfuse.enqueue.mock.calls[0]?.[1];

    expect(toolCreateBody).toEqual(
      expect.objectContaining({
        input: { type: "TRACE" },
        output: {
          error: true,
          message: "Tool input validation failed",
        },
        level: "ERROR",
      }),
    );
    expect(toolCreateBody).not.toHaveProperty("statusMessage");
  });

  it("sets static prompt metadata on the trace and agent generation", () => {
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
    expect(mocks.trace.generation).toHaveBeenCalledWith({
      id: agentRunObservationId,
      name: "agent-turn",
      input: expectedAgentRunInput,
      metadata: {
        langfuse_project_id: "project-1",
        langfuse_user_email: "user@example.com",
        langfuse_user_project_role: "ADMIN",
        langfuse_user_is_admin: true,
        prompt_name: "in-app-agent-system-prompt",
        prompt_version: 3,
      },
      promptName: "in-app-agent-system-prompt",
      promptVersion: 3,
    });

    instrumentation.end();

    expect(mocks.agentGeneration.update).toHaveBeenCalledWith(
      expect.objectContaining({
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

    expect(mocks.agentGeneration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "agent-turn",
        input: expectedAgentRunInput,
        output: {
          messages: [{ role: "assistant", content: "second turn output" }],
          text: "second turn output",
        },
        completionStartTime: expect.any(Date),
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

  it("records AG-UI context in the agent generation input", () => {
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

    expect(mocks.trace.generation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "agent-turn",
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

  it("records only the current turn messages in the agent generation input", () => {
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

    expect(mocks.trace.generation).toHaveBeenCalledWith(
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

    expect(mocks.agentGeneration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "agent-turn",
        input: expectedAgentRunInput,
        output: {
          messages: [{ role: "assistant", content: "chunk output" }],
          text: "chunk output",
        },
        completionStartTime: expect.any(Date),
      }),
    );
  });

  it("records reasoning text in agent generation metadata", () => {
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

    expect(mocks.agentGeneration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "agent-turn",
        input: expectedAgentRunInput,
        output: {
          messages: [{ role: "assistant", content: "Done" }],
          text: "Done",
        },
        completionStartTime: expect.any(Date),
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

    expect(mocks.handler.langfuse.enqueue).not.toHaveBeenCalledWith(
      "tool-create",
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
  });
}
