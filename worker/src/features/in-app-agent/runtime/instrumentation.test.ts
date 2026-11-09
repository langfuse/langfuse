import { EventType } from "@ag-ui/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assembleTranscript } from "../../../../../packages/shared/src/server/transcript/transcript";
import { orderObservations } from "../../../../../packages/shared/src/server/transcript/ordering";
import type { TranscriptObservation } from "../../../../../packages/shared/src/server/transcript/types";

import {
  getInAppAgentInstrumentationObservationId,
  getInAppAgentInstrumentationTraceId,
  getInAppAgentLlmCallObservationId,
  IN_APP_AGENT_TOOL_APPROVAL_EVENT_NAME,
  IN_APP_AGENT_SILENT_MCP_OUTPUT_TYPE,
} from "@langfuse/shared/in-app-agent";
import type { AgUiRunAgentInput } from "./types";
import {
  createInAppAgentInstrumentation,
  InAppAgentInstrumentation,
} from "./instrumentation";

const runId = "run-1";
const traceId = getInAppAgentInstrumentationTraceId(runId);
const agentRunObservationId = getInAppAgentInstrumentationObservationId(runId);

const mocks = vi.hoisted(() => {
  const recordObservation = vi.fn();
  return {
    recordObservation,
    processTracedEvents: vi.fn(async () => undefined),
    getInternalTracingHandler: vi.fn(() => ({
      recordObservation,
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
        sessionId: "conversation-1",
      }),
    );
    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "TOOL",
      expect.objectContaining({
        id: "tool-1",
        traceId,
        parentObservationId: agentRunObservationId,
        name: "listObservations",
        userId: "user-1",
        sessionId: "conversation-1",
        input: { limit: 10 },
        output: {
          role: "tool",
          name: "listObservations",
          tool_call_id: "tool-1",
          content: toolOutput,
        },
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
      mocks.recordObservation.mock.calls.find(([type]) => type === "TOOL")?.[1]
        .metadata,
    ).not.toHaveProperty("toolCallApproval");
    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "AGENT",
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
              content: "Output recorded in TOOL observation tool-1.",
            },
          ],
          text: "hi there",
          tool_calls: [toolCall],
        },
      }),
    );
    const agentCreateBody = mocks.recordObservation.mock.calls.find(
      ([type]) => type === "AGENT",
    )?.[1];
    expect(agentCreateBody).not.toHaveProperty("usageDetails");
    expect(agentCreateBody).not.toHaveProperty("model");
    expect(mocks.recordObservation).not.toHaveBeenCalledWith(
      "SPAN",
      expect.anything(),
    );
  });

  it.each([false, true])(
    "retains full TOOL output while bounding root duplicates (silent: %s)",
    (silent) => {
      const instrumentation = createInstrumentation();
      const result = { data: '😀"\\'.repeat(100_000) };
      const output = silent
        ? {
            type: IN_APP_AGENT_SILENT_MCP_OUTPUT_TYPE,
            output: result,
            toolCallId: "tool-1",
            toolName: "listObservations",
          }
        : result;
      instrumentation.recordEvents([
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: "tool-1",
          toolCallName: "listObservations",
        },
        { type: EventType.TOOL_CALL_ARGS, toolCallId: "tool-1", delta: "{}" },
        { type: EventType.TOOL_CALL_END, toolCallId: "tool-1" },
        {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: "tool-1",
          content: JSON.stringify(output),
        },
        { type: EventType.TEXT_MESSAGE_CONTENT, delta: "Done" },
      ]);
      instrumentation.end({});

      const tool = mocks.recordObservation.mock.calls.find(
        ([type]) => type === "TOOL",
      )?.[1];
      const root = mocks.recordObservation.mock.calls
        .filter(([type]) => type === "AGENT")
        .at(-1)?.[1];
      expect(tool.output).toEqual({
        role: "tool",
        name: "listObservations",
        tool_call_id: tool.id,
        content: output,
      });
      expect(root.output.messages).toEqual([
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "tool-1",
              name: "listObservations",
              arguments: "{}",
              type: "function",
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "tool-1",
          content: "Output recorded in TOOL observation tool-1.",
        },
        { role: "assistant", content: "Done" },
      ]);
      expect(Buffer.byteLength(JSON.stringify(root.output))).toBeLessThan(1024);
    },
  );

  it("preserves supported media in structured tool responses", () => {
    const instrumentation = createInstrumentation();
    const content = [
      { type: "text", text: "Preview" },
      {
        type: "image_url",
        image_url: { url: "https://example.com/preview.png" },
      },
    ];
    instrumentation.recordModelCallStart({
      prompt: [{ role: "user", content: "Preview" }],
    });
    instrumentation.recordModelStreamPart({
      type: "tool-call",
      toolCallId: "media-tool",
      toolName: "preview",
      input: "{}",
    });
    instrumentation.recordModelStreamPart({
      type: "finish",
      finishReason: "tool-calls",
    });
    instrumentation.recordEvents([
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: "media-tool",
        toolCallName: "preview",
      },
      { type: EventType.TOOL_CALL_END, toolCallId: "media-tool" },
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: "media-tool",
        content: JSON.stringify(content),
      },
    ]);
    instrumentation.end({});
    const observations: TranscriptObservation[] =
      mocks.recordObservation.mock.calls
        .filter(([type]) => type === "GENERATION" || type === "TOOL")
        .map(([type, body]) => ({ ...body, type, metadata: {} }));
    expect(observations.find(({ type }) => type === "TOOL")?.output).toEqual({
      role: "tool",
      name: "preview",
      tool_call_id: "media-tool",
      content,
    });
    const transcript = assembleTranscript(orderObservations(observations));
    expect(JSON.stringify(transcript)).toContain(
      "https://example.com/preview.png",
    );
    expect(JSON.stringify(transcript)).toContain('"mediaType":"image/*"');
  });

  it("references every root tool result, including small results", () => {
    const instrumentation = createInstrumentation();
    const output = { data: "x".repeat(6000) };
    for (let index = 0; index < 40; index++) {
      const toolCallId = `tool-${index}`;
      instrumentation.recordEvents([
        {
          type: EventType.TOOL_CALL_START,
          toolCallId,
          toolCallName: "listObservations",
        },
        { type: EventType.TOOL_CALL_ARGS, toolCallId, delta: "{}" },
        { type: EventType.TOOL_CALL_END, toolCallId },
        {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId,
          content: JSON.stringify(output),
        },
      ]);
    }
    instrumentation.end({});

    const tools = mocks.recordObservation.mock.calls.filter(
      ([type]) => type === "TOOL",
    );
    expect(tools).toHaveLength(40);
    for (const [, tool] of tools) {
      expect(tool.output).toEqual({
        role: "tool",
        name: "listObservations",
        tool_call_id: tool.id,
        content: output,
      });
    }
    const root = mocks.recordObservation.mock.calls
      .filter(([type]) => type === "AGENT")
      .at(-1)?.[1];
    expect(root.output.messages).toHaveLength(80);
    expect(root.output.tool_calls).toHaveLength(40);
    expect(
      root.output.messages.filter(
        (message: { role: string }) => message.role === "tool",
      ),
    ).toEqual(
      Array.from({ length: 40 }, (_, index) => ({
        role: "tool",
        tool_call_id: `tool-${index}`,
        content: `Output recorded in TOOL observation tool-${index}.`,
      })),
    );
    expect(JSON.stringify(root.output)).not.toContain(output.data);
  });

  it("keeps transcript continuity with full TOOL outputs and referenced generation results", () => {
    const instrumentation = createInstrumentation();
    const user = { role: "user", content: [{ type: "text", text: "hello" }] };
    const call = {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "tool-1",
          toolName: "listObservations",
          input: {},
        },
      ],
    };
    const toolOutput = { type: "json", value: { data: "x".repeat(200_000) } };
    const result = {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "tool-1",
          toolName: "listObservations",
          output: toolOutput,
          providerOptions: { mastra: { modelOutput: toolOutput } },
        },
      ],
    };
    instrumentation.recordModelCallStart({ prompt: [user] });
    instrumentation.recordModelStreamPart({
      type: "tool-call",
      toolCallId: "tool-1",
      toolName: "listObservations",
      input: "{}",
    });
    instrumentation.recordModelStreamPart({
      type: "finish",
      finishReason: "tool-calls",
    });
    instrumentation.recordEvents([
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tool-1",
        toolCallName: "listObservations",
      },
      { type: EventType.TOOL_CALL_ARGS, toolCallId: "tool-1", delta: "{}" },
      { type: EventType.TOOL_CALL_END, toolCallId: "tool-1" },
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: "tool-1",
        content: JSON.stringify({ data: "x".repeat(200_000) }),
      },
    ]);
    const providerPrompt = [user, call, result];
    const originalProviderPrompt = JSON.stringify(providerPrompt);
    instrumentation.recordModelCallStart({ prompt: providerPrompt });
    expect(JSON.stringify(providerPrompt)).toBe(originalProviderPrompt);
    instrumentation.recordModelStreamPart({
      type: "text-delta",
      delta: "Done",
    });
    instrumentation.recordModelStreamPart({
      type: "finish",
      finishReason: "stop",
    });
    instrumentation.end({});

    const observations: TranscriptObservation[] =
      mocks.recordObservation.mock.calls
        .filter(([type]) => type === "GENERATION" || type === "TOOL")
        .map(([type, body]) => ({ ...body, type }));
    const generations = observations.filter(
      ({ type }) => type === "GENERATION",
    );
    const referencedResult = {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "tool-1",
          toolName: "listObservations",
          output: {
            type: "text",
            value: "Output recorded in TOOL observation tool-1.",
          },
        },
      ],
    };
    expect(generations[1]?.input).toEqual({
      messages: [user, call, referencedResult],
    });
    const nextTurn: TranscriptObservation = {
      ...generations[1]!,
      id: "next-generation",
      traceId: "next-trace",
      parentObservationId: null,
      startTime: new Date(Date.now() + 1000),
      input: {
        messages: [
          user,
          call,
          referencedResult,
          { role: "assistant", content: "Done" },
          { role: "user", content: "Thanks" },
        ],
      },
      output: { text: "Welcome" },
    };
    const transcript = assembleTranscript(
      orderObservations([...observations, nextTurn]),
    );
    expect(transcript?.threads).toHaveLength(1);
    expect(
      transcript?.threads[0]?.currentTurn.messages.map(({ role }) => role),
    ).toEqual(["user", "assistant"]);
    expect(
      transcript?.threads[0]?.conversationHistory.filter(
        ({ role }) => role === "tool",
      ),
    ).toHaveLength(1);
    expect(
      JSON.stringify(transcript?.threads[0]?.conversationHistory),
    ).toContain(toolOutput.value.data);
  });

  it("pairs parallel filter results by ID without metadata or duplicate history results", () => {
    const instrumentation = createInstrumentation();
    const name = "langfuse_getObservationFilterValues";
    const calls = ["userId", "sessionId"].map((column, index) => ({
      toolCallId: `tooluse_sanitized_${index}`,
      toolName: name,
      input: JSON.stringify({ column }),
      result: { type: "VALUES", column, values: [], meta: {} },
    }));
    const user = {
      role: "user",
      content: "List available user and session IDs",
    };
    instrumentation.recordModelCallStart({ prompt: [user] });
    for (const call of calls) {
      instrumentation.recordModelStreamPart({ type: "tool-call", ...call });
      instrumentation.recordEvents([
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: call.toolCallId,
          toolCallName: name,
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: call.toolCallId,
          delta: call.input,
        },
        { type: EventType.TOOL_CALL_END, toolCallId: call.toolCallId },
      ]);
    }
    instrumentation.recordModelStreamPart({
      type: "finish",
      finishReason: "tool-calls",
    });
    // Name-based FIFO matching would swap these responses.
    for (const call of [...calls].reverse()) {
      instrumentation.recordEvents([
        {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: call.toolCallId,
          content: JSON.stringify(call.result),
        },
      ]);
    }
    instrumentation.recordModelCallStart({
      prompt: [
        user,
        {
          role: "assistant",
          content: calls.map((call) => ({
            type: "tool-call",
            toolCallId: call.toolCallId,
            toolName: name,
            input: JSON.parse(call.input),
          })),
        },
        {
          role: "tool",
          content: calls.map((call) => ({
            type: "tool-result",
            toolCallId: call.toolCallId,
            toolName: name,
            output: { type: "json", value: call.result },
          })),
        },
      ],
    });
    instrumentation.recordModelStreamPart({
      type: "text-delta",
      delta: "No values found",
    });
    instrumentation.recordModelStreamPart({
      type: "finish",
      finishReason: "stop",
    });
    instrumentation.end({});

    const observations: TranscriptObservation[] =
      mocks.recordObservation.mock.calls
        .filter(([type]) => type === "GENERATION" || type === "TOOL")
        .map(([type, body]) => ({ ...body, type, metadata: {} }));
    for (const call of calls) {
      expect(
        observations.find(({ id }) => id === call.toolCallId)?.output,
      ).toEqual({
        role: "tool",
        name,
        tool_call_id: call.toolCallId,
        content: call.result,
      });
    }
    const transcript = assembleTranscript(orderObservations(observations));
    expect(transcript?.threads).toHaveLength(1);
    const messages = transcript!.threads[0]!.currentTurn.messages;
    const results = messages
      .flatMap(({ parts }) => parts)
      .filter((part) => part.type === "tool-result");
    expect(results).toHaveLength(2);
    for (const call of calls) {
      expect(
        results.find((part) => part.toolCallId === call.toolCallId),
      ).toMatchObject({
        toolName: name,
        output: { type: "json", value: call.result },
      });
    }
  });

  it("keeps batched tool-result identities but omits their payloads from generation telemetry", () => {
    const instrumentation = createInstrumentation();
    const results = ["tool-1", "tool-2"].map((toolCallId) => ({
      type: "tool-result",
      toolCallId,
      toolName: "listObservations",
      output: { type: "json", value: { privatePayload: toolCallId } },
      providerOptions: {
        mastra: { modelOutput: { privatePayload: toolCallId } },
      },
    }));
    const prompt = [
      { role: "user", content: [{ type: "text", text: "hello" }] },
      { role: "tool", content: results },
    ];
    const originalPrompt = JSON.stringify(prompt);
    instrumentation.recordModelCallStart({ prompt });
    instrumentation.recordModelStreamPart({
      type: "finish",
      finishReason: "stop",
    });

    const generation = mocks.recordObservation.mock.calls.find(
      ([type]) => type === "GENERATION",
    )?.[1];
    expect(generation.input.messages).toEqual([
      prompt[0],
      {
        role: "tool",
        content: ["tool-1", "tool-2"].map((toolCallId) => ({
          type: "tool-result",
          toolCallId,
          toolName: "listObservations",
          output: {
            type: "text",
            value: `Output recorded in TOOL observation ${toolCallId}.`,
          },
        })),
      },
    ]);
    expect(JSON.stringify(generation.input)).not.toContain("privatePayload");
    expect(JSON.stringify(prompt)).toBe(originalPrompt);
  });

  it("records approved manual tool approval metadata", () => {
    const instrumentation = createInstrumentation();

    instrumentation.recordToolCallApproval({
      toolCallId: "tool-1",
      status: "approved",
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

    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "TOOL",
      expect.objectContaining({
        metadata: expect.objectContaining({
          toolCallId: "tool-1",
          parentMessageId: "tool-1-approval-tool-call",
          toolCallApproval: "approved",
        }),
      }),
    );
  });

  it("copies langfuse_tool_approval source onto the TOOL observation", () => {
    const instrumentation = createInstrumentation();

    instrumentation.recordEvents([
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tool-1",
        toolCallName: "read",
        parentMessageId: "assistant-message-1",
      },
      {
        type: EventType.CUSTOM,
        name: IN_APP_AGENT_TOOL_APPROVAL_EVENT_NAME,
        value: {
          toolCallId: "tool-1",
          toolName: "read",
          source: "auto",
        },
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-1",
        delta: '{"path":"README.md"}',
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

    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "TOOL",
      expect.objectContaining({
        metadata: expect.objectContaining({
          toolCallId: "tool-1",
          toolCallApprovalSource: "auto",
        }),
      }),
    );
  });

  it("records rejected approvals without fabricating tool execution duration", () => {
    vi.useFakeTimers();
    try {
      const instrumentation = createInstrumentation();
      const rejectedAt = new Date("2026-01-01T00:00:01.000Z");

      instrumentation.recordToolCallApproval({
        toolCallId: "tool-1",
        status: "rejected",
      });
      vi.setSystemTime(rejectedAt);
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
      ]);
      vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));
      instrumentation.recordEvents([
        {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: "tool-1",
          content: "rejected",
        },
      ]);

      expect(mocks.recordObservation).toHaveBeenCalledWith(
        "TOOL",
        expect.objectContaining({
          startTime: rejectedAt,
          endTime: rejectedAt,
          metadata: expect.objectContaining({
            toolCallId: "tool-1",
            parentMessageId: "tool-1-approval-tool-call",
            toolCallApproval: "rejected",
          }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

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

    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "TOOL",
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
    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "AGENT",
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

    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "AGENT",
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

    const toolCreateBody = mocks.recordObservation.mock.calls.find(
      ([type]) => type === "TOOL",
    )?.[1];

    expect(toolCreateBody).toEqual(
      expect.objectContaining({
        input: { type: "TRACE" },
        output: {
          role: "tool",
          name: "listObservations",
          tool_call_id: "tool-1",
          content: { error: true, message: "Tool input validation failed" },
        },
        level: "ERROR",
        statusMessage: "Tool input validation failed",
      }),
    );
  });

  it("preserves the root replacement key across approval continuations", () => {
    const runStartedAt = new Date("2026-08-14T10:00:00.123Z");
    const tracing = {
      runId,
      runStartedAt,
      targetProjectId: "project-1",
      environment: "production",
      metadata: {},
      user: { id: "user-1", isAdmin: false },
    };
    const initial = createInAppAgentInstrumentation({ input, tracing });
    expect(initial).toBeDefined();
    initial!.end();

    const continuationRunId = "continuation-run-1";
    const continuation = createInAppAgentInstrumentation({
      input: {
        ...input,
        runId: continuationRunId,
        forwardedProps: {
          command: {
            resume: {
              approved: true,
              rootRunId: runId,
              traceStartedAt: runStartedAt.toISOString(),
              approvalRequest: {
                type: "tool_approval_request",
                toolCallId: "tool-1",
                toolName: "langfuse_createTextPrompt",
                runId,
              },
            },
          },
        },
      },
      tracing: {
        ...tracing,
        runId: continuationRunId,
        runStartedAt: new Date("2026-08-14T10:02:00.456Z"),
      },
    });
    expect(continuation).toBeDefined();
    continuation!.end();

    const roots = mocks.recordObservation.mock.calls.filter(
      ([type]) => type === "AGENT",
    );
    expect(roots).toHaveLength(4);
    for (const [, root] of roots) {
      expect(root).toMatchObject({
        id: agentRunObservationId,
        traceId,
        startTime: runStartedAt,
      });
    }
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
      // The `isError` marker sits on the envelope and the text is not JSON, so
      // the unwrapped content carries no marker of its own.
      name: "isError envelopes wrapping plain text",
      content: JSON.stringify({
        isError: true,
        content: [
          {
            type: "text",
            text: "Error fetching docs page markdown: Failed to fetch https://langfuse.com/not-a-real-page.md: 404",
          },
        ],
      }),
      expectedOutput:
        "Error fetching docs page markdown: Failed to fetch https://langfuse.com/not-a-real-page.md: 404",
      expectedMessage:
        "Error fetching docs page markdown: Failed to fetch https://langfuse.com/not-a-real-page.md: 404",
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

      expect(mocks.recordObservation).toHaveBeenCalledWith(
        "TOOL",
        expect.objectContaining({
          output: {
            role: "tool",
            name: "createScoreConfig",
            tool_call_id: "tool-1",
            content: expectedOutput,
          },
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

      const toolCreateBody = mocks.recordObservation.mock.calls.find(
        ([type]) => type === "TOOL",
      )?.[1];
      expect(toolCreateBody).toEqual(
        expect.objectContaining({
          output: {
            role: "tool",
            name: "search",
            tool_call_id: "tool-1",
            content: expectedOutput,
          },
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

    instrumentation.end();

    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "AGENT",
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

    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "AGENT",
      expect.objectContaining({
        name: "agent-turn",
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

    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "AGENT",
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

    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "AGENT",
      expect.objectContaining({
        input: {
          messages: [{ role: "user", content: "hello" }],
        },
      }),
    );
  });

  it.each([
    { approved: true, status: "approved" as const },
    { approved: false, status: "rejected" as const },
  ])(
    "appends a $status approval continuation to the parent trace with a wait span",
    ({ approved, status }) => {
      const traceStartedAt = "2026-08-14T10:00:00.000Z";
      const approvalRequestedAt = "2026-08-14T10:00:05.000Z";
      const approvalDecidedAt = "2026-08-14T10:02:05.000Z";
      const instrumentation = createInstrumentation({
        forwardedProps: {
          command: {
            resume: {
              approved,
              continuationNumber: 2,
              rootRunId: "root-run-1",
              traceStartedAt,
              approvalRequestedAt,
              approvalDecidedAt,
              approvalRequest: {
                type: "tool_approval_request",
                toolCallId: "tool-1",
                toolName: "langfuse_createTextPrompt",
                args: { name: "FOO" },
                runId: "parent-run-1",
              },
            },
          },
        },
      });

      instrumentation.recordToolCallApproval({
        toolCallId: "tool-1",
        status,
      });
      instrumentation.recordEvents([
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: "tool-1",
          toolCallName: "langfuse_createTextPrompt",
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: "tool-1",
          delta: '{"name":"FOO"}',
        },
        {
          type: EventType.TOOL_CALL_END,
          toolCallId: "tool-1",
        },
        {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: "tool-1",
          content: '{"name":"FOO","version":1}',
        },
      ]);
      instrumentation.recordModelCallStart({
        prompt: [
          { role: "user", content: "hello" },
          {
            role: "assistant",
            tool_calls: [
              {
                id: "tool-1",
                name: "langfuse_createTextPrompt",
                arguments: '{"name":"FOO"}',
                type: "function",
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "tool-1",
            content: "Output recorded in the corresponding TOOL observation.",
          },
        ],
      });
      instrumentation.recordModelStreamPart({
        type: "finish",
        usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 },
      });
      instrumentation.end({});

      for (const [, observation] of mocks.recordObservation.mock.calls) {
        expect(observation).toMatchObject({
          userId: "user-1",
          sessionId: "conversation-1",
          metadata: {
            langfuse_project_id: "project-1",
            langfuse_user_email: "user@example.com",
            langfuse_user_project_role: "ADMIN",
            langfuse_user_is_admin: true,
            approval_continuation_count: 2,
          },
        });
      }

      const parentTraceId = getInAppAgentInstrumentationTraceId("root-run-1");
      const parentObservationId =
        getInAppAgentInstrumentationObservationId("root-run-1");
      const approvalMetadata = {
        continuation_type: "tool_approval",
        continuation_number: 2,
        parent_run_id: "parent-run-1",
        approval_status: status,
        approval_tool_call_id: "tool-1",
        approval_tool_name: "langfuse_createTextPrompt",
        approval_requested_at: approvalRequestedAt,
        approval_decided_at: approvalDecidedAt,
      };

      expect(mocks.recordObservation).toHaveBeenCalledWith(
        "AGENT",
        expect.objectContaining({
          id: parentObservationId,
          traceId: parentTraceId,
          name: "agent-turn",
          startTime: new Date(traceStartedAt),
          input: expectedAgentRunInput,
          metadata: expect.objectContaining({
            approval_continuation_count: 2,
          }),
        }),
      );
      expect(mocks.recordObservation).toHaveBeenCalledWith(
        "SPAN",
        expect.objectContaining({
          id: `${runId}-approval-wait`,
          traceId: parentTraceId,
          parentObservationId,
          name: "waiting for user approval for tool langfuse_createTextPrompt",
          startTime: new Date(approvalRequestedAt),
          endTime: new Date(approvalDecidedAt),
          output: `User ${status} tool langfuse_createTextPrompt`,
          metadata: expect.objectContaining(approvalMetadata),
        }),
      );
      expect(mocks.recordObservation).toHaveBeenCalledWith(
        "GENERATION",
        expect.objectContaining({
          traceId: parentTraceId,
          parentObservationId,
          input: expect.objectContaining({
            messages: [
              { role: "user", content: "hello" },
              expect.objectContaining({
                role: "assistant",
                tool_calls: [
                  expect.objectContaining({
                    id: "tool-1",
                    name: "langfuse_createTextPrompt",
                  }),
                ],
              }),
              {
                role: "tool",
                tool_call_id: "tool-1",
                content:
                  "Output recorded in the corresponding TOOL observation.",
              },
            ],
          }),
        }),
      );
    },
  );

  it("preserves earlier assistant output when a continuation updates the root trace", () => {
    const instrumentation = createInstrumentation({
      messages: [
        { id: "message-1", role: "user", content: "hello" },
        {
          id: "assistant-before-approval",
          role: "assistant",
          content: "I need your approval.",
        },
      ],
      forwardedProps: {
        command: {
          resume: {
            approved: true,
            rootRunId: "root-run-1",
            traceStartedAt: "2026-08-14T10:00:00.000Z",
            approvalRequestedAt: "2026-08-14T10:00:05.000Z",
            approvalDecidedAt: "2026-08-14T10:02:05.000Z",
            approvalRequest: {
              type: "tool_approval_request",
              toolCallId: "tool-1",
              toolName: "langfuse_createTextPrompt",
              runId: "parent-run-1",
            },
          },
        },
      },
    });

    instrumentation.recordEvents([
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: "The tool completed.",
      },
    ]);
    instrumentation.end({});

    const finalRootObservation = mocks.recordObservation.mock.calls
      .filter(([type]) => type === "AGENT")
      .at(-1)?.[1];
    expect(finalRootObservation).toEqual(
      expect.objectContaining({
        input: expectedAgentRunInput,
        output: expect.objectContaining({
          messages: [
            { role: "assistant", content: "I need your approval." },
            { role: "assistant", content: "The tool completed." },
          ],
        }),
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

    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "AGENT",
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

    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "AGENT",
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
            {
              role: "tool",
              tool_call_id: "tool-1",
              content: "Output recorded in TOOL observation tool-1.",
            },
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
    const agentCreateBody = mocks.recordObservation.mock.calls.find(
      ([type]) => type === "AGENT",
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

    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "AGENT",
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

    expect(mocks.recordObservation).not.toHaveBeenCalledWith(
      "TOOL",
      expect.anything(),
    );
  });

  it("emits one generation per model call with usage on children only", () => {
    const instrumentation = createInstrumentation();
    const modelName = "eu.anthropic.claude-sonnet-4-5-20250929-v1:0";

    // Root agent observation must exist before children so tools/generations
    // do not orphan onto the trace.
    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "AGENT",
      expect.objectContaining({
        id: agentRunObservationId,
        name: "agent-turn",
      }),
    );

    instrumentation.recordModelCallStart({
      prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    });
    instrumentation.recordModelStreamPart({
      type: "tool-call",
      toolCallId: "tool-1",
      toolName: "listObservations",
      input: '{"limit":10}',
    });
    instrumentation.recordModelStreamPart({
      type: "finish",
      usage: {
        inputTokens: 1100,
        outputTokens: 50,
        totalTokens: 1150,
        cachedInputTokens: 800,
        cacheCreationInputTokens: 100,
      },
      finishReason: "tool-calls",
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

    instrumentation.recordModelCallStart({
      prompt: [
        { role: "user", content: [{ type: "text", text: "hello" }] },
        { role: "tool", content: [{ type: "tool-result" }] },
      ],
    });
    instrumentation.recordModelStreamPart({
      type: "text-delta",
      delta: "Done",
    });
    instrumentation.recordEvents([
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: "Done",
      },
    ]);
    instrumentation.recordModelStreamPart({
      type: "finish",
      usage: {
        inputTokens: 1200,
        outputTokens: 30,
        totalTokens: 1230,
        cachedInputTokens: 1000,
      },
      finishReason: "stop",
    });
    instrumentation.end({});

    const generationCreates = mocks.recordObservation.mock.calls.filter(
      ([type]) => type === "GENERATION",
    );
    expect(generationCreates).toHaveLength(2);

    expect(generationCreates[0]?.[1]).toEqual(
      expect.objectContaining({
        id: getInAppAgentLlmCallObservationId(runId, 1),
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
    expect(generationCreates[0]?.[1].output).toEqual({
      tool_calls: [
        {
          toolCallId: "tool-1",
          toolName: "listObservations",
          args: { limit: 10 },
        },
      ],
    });

    expect(generationCreates[1]?.[1]).toEqual(
      expect.objectContaining({
        id: getInAppAgentLlmCallObservationId(runId, 2),
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

    const agentCreates = mocks.recordObservation.mock.calls.filter(
      ([type]) => type === "AGENT",
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

  it("drops circular provider options from model call input", () => {
    const instrumentation = createInstrumentation();
    const providerOptions: Record<string, unknown> = {};
    providerOptions.circular = providerOptions;

    instrumentation.recordModelCallStart({
      prompt: [{ role: "user", content: "hello" }],
      providerOptions,
    });
    instrumentation.recordModelStreamPart({
      type: "finish",
      usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 },
      finishReason: "stop",
    });

    const generation = mocks.recordObservation.mock.calls.find(
      ([type]) => type === "GENERATION",
    )?.[1];
    expect(generation?.input).toEqual({
      messages: [{ role: "user", content: "hello" }],
    });
  });

  it("emits tools after the generation using actual execution timing", () => {
    const instrumentation = createInstrumentation();
    const modelCallStart = new Date("2026-01-01T00:00:00.000Z");
    const agUiToolAStart = new Date("2026-01-01T00:00:01.500Z");
    const agUiToolBStart = new Date("2026-01-01T00:00:02.500Z");
    const toolAStart = new Date("2026-01-01T00:00:02.900Z");
    const toolBStart = new Date("2026-01-01T00:00:03.200Z");
    const toolAEnd = new Date("2026-01-01T00:00:03.000Z");
    const toolBEnd = new Date("2026-01-01T00:00:04.000Z");
    const providerFinish = new Date("2026-01-01T00:00:02.800Z");

    vi.setSystemTime(modelCallStart);
    instrumentation.recordModelCallStart({ prompt: [] });

    instrumentation.recordModelStreamPart({
      type: "tool-call",
      toolCallId: "tool-a",
      toolName: "listObservations",
      input: "{}",
    });
    instrumentation.recordModelStreamPart({
      type: "tool-call",
      toolCallId: "tool-b",
      toolName: "getTrace",
      input: "{}",
    });

    vi.setSystemTime(agUiToolAStart);
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
    ]);
    vi.setSystemTime(agUiToolBStart);
    instrumentation.recordEvents([
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

    vi.setSystemTime(providerFinish);
    instrumentation.recordModelStreamPart({
      type: "finish",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      finishReason: { unified: "tool-calls", raw: "tool_use" },
    });

    vi.setSystemTime(toolAStart);
    instrumentation.recordToolExecutionStart("tool-a");
    vi.setSystemTime(toolAEnd);
    instrumentation.recordToolExecutionEnd("tool-a");
    instrumentation.recordEvents([
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: "tool-a",
        content: '{"a":1}',
      },
    ]);

    vi.setSystemTime(toolBStart);
    instrumentation.recordToolExecutionStart("tool-b");
    vi.setSystemTime(toolBEnd);
    instrumentation.recordToolExecutionEnd("tool-b");
    instrumentation.recordEvents([
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: "tool-b",
        content: '{"b":2}',
      },
    ]);

    const enqueueOrder = mocks.recordObservation.mock.calls
      .filter(([type]) => type === "GENERATION" || type === "TOOL")
      .map(([type, body]) => ({ type, id: body.id }));
    expect(enqueueOrder.map((entry) => entry.type)).toEqual([
      "GENERATION",
      "TOOL",
      "TOOL",
    ]);

    const generationCreate = mocks.recordObservation.mock.calls.find(
      ([type]) => type === "GENERATION",
    )?.[1];
    expect(generationCreate).toEqual(
      expect.objectContaining({ endTime: providerFinish }),
    );

    const toolCreates = mocks.recordObservation.mock.calls.filter(
      ([type]) => type === "TOOL",
    );
    expect(toolCreates).toHaveLength(2);
    // Actual execute() timing wins over the delayed AG-UI event timestamps.
    expect(toolCreates[0]?.[1]).toEqual(
      expect.objectContaining({
        id: "tool-a",
        parentObservationId: getInAppAgentLlmCallObservationId(runId, 1),
        startTime: toolAStart,
        endTime: toolAEnd,
      }),
    );
    expect(toolCreates[1]?.[1]).toEqual(
      expect.objectContaining({
        id: "tool-b",
        parentObservationId: getInAppAgentLlmCallObservationId(runId, 1),
        startTime: toolBStart,
        endTime: toolBEnd,
      }),
    );

    vi.useRealTimers();
  });

  it("does not force-close incomplete tools on a normal end (approval interrupt)", () => {
    const instrumentation = createInstrumentation();

    instrumentation.recordEvents([
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tool-awaiting-approval",
        toolCallName: "createAnnotationQueueItem",
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-awaiting-approval",
        delta: '{"queueId":"q1"}',
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: "tool-awaiting-approval",
      },
    ]);
    instrumentation.end({});

    expect(mocks.recordObservation).not.toHaveBeenCalledWith(
      "TOOL",
      expect.objectContaining({ id: "tool-awaiting-approval" }),
    );
  });

  it("closes an open model call as ERROR when the run is aborted", () => {
    const instrumentation = createInstrumentation();

    instrumentation.recordModelCallStart({ prompt: [] });
    instrumentation.end({ aborted: true });

    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "GENERATION",
      expect.objectContaining({
        id: getInAppAgentLlmCallObservationId(runId, 1),
        parentObservationId: agentRunObservationId,
        level: "ERROR",
        statusMessage: "aborted",
      }),
    );
    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "AGENT",
      expect.objectContaining({
        id: agentRunObservationId,
        metadata: expect.objectContaining({ aborted: true }),
      }),
    );
  });

  it("keeps a provider-finished generation successful when the run later fails", () => {
    const instrumentation = createInstrumentation();

    instrumentation.recordModelCallStart({ prompt: [] });
    instrumentation.recordModelStreamPart({
      type: "text-delta",
      delta: "Calling the tool",
    });
    instrumentation.recordEvents([
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: "Calling the tool",
      },
    ]);
    instrumentation.recordModelStreamPart({
      type: "finish",
      usage: {
        inputTokens: {
          total: 1_100,
          noCache: 200,
          cacheRead: 800,
          cacheWrite: 100,
        },
        outputTokens: { total: 50, text: 50, reasoning: 0 },
      },
      finishReason: { unified: "tool-calls", raw: "tool_use" },
    });
    instrumentation.endWithError(new Error("tool execution failed"));

    const generation = mocks.recordObservation.mock.calls.find(
      ([type]) => type === "GENERATION",
    )?.[1];
    expect(generation).toEqual(
      expect.objectContaining({
        id: getInAppAgentLlmCallObservationId(runId, 1),
        model: "eu.anthropic.claude-sonnet-4-5-20250929-v1:0",
        usageDetails: expect.objectContaining({
          input: 200,
          output: 50,
          total: 1_150,
        }),
        output: { text: "Calling the tool" },
      }),
    );
    expect(generation).not.toHaveProperty("level");
    expect(generation).not.toHaveProperty("statusMessage");
    expect(mocks.recordObservation).toHaveBeenCalledWith(
      "AGENT",
      expect.objectContaining({
        id: agentRunObservationId,
        level: "ERROR",
        statusMessage: "tool execution failed",
      }),
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
    runStartedAt: new Date(),
    targetProjectId: "project-1",
    environment: "prod",
    prompt,
    model: "eu.anthropic.claude-sonnet-4-5-20250929-v1:0",
  });
}
