import { EventType } from "@ag-ui/core";
import { HttpAgent } from "@ag-ui/client";
import { Agent } from "@mastra/core/agent";
import { describe, expect, it, vi } from "vitest";

import type { AgUiEvent } from "@/src/ee/features/in-app-agent/schema";
import { IN_APP_AGENT_REDIRECT_TOOL_NAME } from "@/src/ee/features/in-app-agent/constants";
import { patchMastraToolCallInputStreaming } from "@/src/ee/features/in-app-agent/server/agent";
import { IN_APP_AGENT_LANGFUSE_MCP_TOOL_APPROVALS } from "@/src/ee/features/in-app-agent/server/tools";
import { DEFAULT_SIDEBAR_HIDDEN_ENVIRONMENTS } from "@/src/features/filters/constants/internal-environments";
import { decodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import "@/src/features/mcp/server/bootstrap";
import { toolRegistry } from "@/src/features/mcp/server/registry";
import type { MastraAgent } from "@ag-ui/mastra";

const adapterEvents = vi.hoisted(() => ({
  items: [] as AgUiEvent[],
  cleanup: vi.fn().mockResolvedValue(undefined),
  inputs: [] as unknown[],
  createScoreConfigExecute: vi.fn().mockResolvedValue({
    id: "score-config-1",
    name: "readiness",
    dataType: "NUMERIC",
  }),
}));

const instrumentationMocks = vi.hoisted(() => {
  const instrumentation = {
    recordEvents: vi.fn(),
    end: vi.fn(),
    endWithError: vi.fn(),
    flush: vi.fn(),
  };

  return {
    instrumentation,
    createInAppAgentInstrumentation: vi.fn(({ tracing }) =>
      tracing ? instrumentation : undefined,
    ),
  };
});

const promptMocks = vi.hoisted(() => ({
  compile: vi.fn(() => "Prompt-managed assistant instructions"),
  getPrompt: vi.fn(),
}));

vi.mock("@ag-ui/mastra", () => ({
  MastraAgent: vi.fn().mockImplementation(function () {
    return {
      run: (input: unknown) => ({
        subscribe: (subscriber: {
          next: (event: AgUiEvent) => void;
          complete: () => void;
        }) => {
          adapterEvents.inputs.push(input);
          for (const event of adapterEvents.items) {
            subscriber.next(event);
          }
          subscriber.complete();
          return { unsubscribe: vi.fn() };
        },
      }),
    };
  }),
}));

vi.mock("@ai-sdk/amazon-bedrock", () => ({
  createAmazonBedrock: vi.fn(() => vi.fn(() => ({}))),
}));

vi.mock("@aws-sdk/credential-providers", () => ({
  fromNodeProviderChain: vi.fn(() => vi.fn()),
}));

vi.mock("@mastra/core/agent", () => ({
  Agent: vi.fn().mockImplementation(function () {
    return { abortRunStream: vi.fn() };
  }),
}));

vi.mock("@mastra/mcp", () => ({
  MCPClient: vi.fn().mockImplementation(function () {
    return {
      listTools: vi.fn().mockResolvedValue({}),
      listToolsetsWithErrors: vi.fn().mockResolvedValue({
        toolsets: {
          langfuse: {
            getHealth: {
              server: "langfuse",
              annotations: { destructiveHint: true },
            },
            search: { server: "langfuse" },
            upsertDataset: {
              server: "langfuse",
              annotations: { destructiveHint: false },
            },
            createScoreConfig: {
              server: "langfuse",
              execute: adapterEvents.createScoreConfigExecute,
            },
          },
          langfuseDocs: {
            search: {
              server: "langfuseDocs",
              execute: vi.fn().mockResolvedValue({
                _meta: {
                  choices: [
                    {
                      message: {
                        content: JSON.stringify({
                          content: [
                            {
                              type: "document",
                              title: "Invite Co-workers",
                              url: "https://langfuse.com/faq/all/inviting-in-langfuse",
                            },
                            {
                              type: "document",
                              title:
                                "SCIM & Organization-Key Scoped API Routes",
                              url: "https://langfuse.com/docs/administration/scim-and-org-api",
                            },
                            {
                              type: "document",
                              title: "Members Router",
                              url: "https://github.com/langfuse/langfuse/blob/main/web/src/features/rbac/server/membersRouter.ts",
                            },
                          ],
                        }),
                      },
                    },
                  ],
                },
              }),
            },
            fetch: {
              server: "langfuseDocs",
              execute: vi.fn().mockResolvedValue({
                content: "Langfuse docs content",
              }),
            },
          },
        },
        errors: {},
      }),
      disconnect: adapterEvents.cleanup,
    };
  }),
}));

vi.mock("@/src/ee/features/in-app-agent/server/instrumentation", () => ({
  createInAppAgentInstrumentation:
    instrumentationMocks.createInAppAgentInstrumentation,
}));

const createPatchedChunkProcessor = () => {
  const forwardedChunks: unknown[] = [];
  const onError = vi.fn();
  const flush = vi.fn();
  const adapter = {
    createChunkProcessor: vi.fn(() => ({
      handleChunk: (chunk: unknown) => {
        forwardedChunks.push(chunk);
        return false;
      },
      flush,
    })),
  };

  patchMastraToolCallInputStreaming(adapter as unknown as MastraAgent);

  const processor = adapter.createChunkProcessor({ onError });

  return { forwardedChunks, onError, processor, flush };
};

describe("patchMastraToolCallInputStreaming", () => {
  it("converts streamed tool-call input chunks to one native tool-call", () => {
    const { forwardedChunks, onError, processor } =
      createPatchedChunkProcessor();

    processor.handleChunk({
      type: "tool-call-input-streaming-start",
      payload: {
        toolCallId: "tool-call-1",
        toolName: "langfuseDocs_search",
      },
    });
    processor.handleChunk({
      type: "tool-call-delta",
      payload: {
        toolCallId: "tool-call-1",
        argsTextDelta: '{"query":"invite',
      },
    });
    processor.handleChunk({
      type: "tool-call-delta",
      payload: {
        toolCallId: "tool-call-1",
        argsTextDelta: ' users"}',
      },
    });
    processor.handleChunk({
      type: "tool-call-input-streaming-end",
      payload: { toolCallId: "tool-call-1" },
    });

    expect(onError).not.toHaveBeenCalled();
    expect(forwardedChunks).toEqual([
      {
        type: "tool-call",
        payload: {
          toolCallId: "tool-call-1",
          toolName: "langfuseDocs_search",
          args: { query: "invite users" },
        },
      },
    ]);
  });

  it("uses empty args when streamed tool-call input is malformed JSON", () => {
    const { forwardedChunks, onError, processor } =
      createPatchedChunkProcessor();

    processor.handleChunk({
      type: "tool-call-input-streaming-start",
      payload: {
        toolCallId: "tool-call-1",
        toolName: "langfuseDocs_search",
      },
    });
    processor.handleChunk({
      type: "tool-call-delta",
      payload: {
        toolCallId: "tool-call-1",
        argsTextDelta: '{"query":"invite users"',
      },
    });
    processor.handleChunk({
      type: "tool-call-input-streaming-end",
      payload: { toolCallId: "tool-call-1" },
    });

    expect(onError).not.toHaveBeenCalled();
    expect(forwardedChunks).toEqual([
      {
        type: "tool-call",
        payload: {
          toolCallId: "tool-call-1",
          toolName: "langfuseDocs_search",
          args: {},
        },
      },
    ]);
  });

  it("suppresses one duplicate native tool-call after synthesizing it", () => {
    const { forwardedChunks, processor } = createPatchedChunkProcessor();

    processor.handleChunk({
      type: "tool-call-input-streaming-start",
      payload: {
        toolCallId: "tool-call-1",
        toolName: "langfuseDocs_search",
      },
    });
    processor.handleChunk({
      type: "tool-call-delta",
      payload: {
        toolCallId: "tool-call-1",
        argsTextDelta: '{"query":"invite users"}',
      },
    });
    processor.handleChunk({
      type: "tool-call-input-streaming-end",
      payload: { toolCallId: "tool-call-1" },
    });
    processor.handleChunk({
      type: "tool-call",
      payload: {
        toolCallId: "tool-call-1",
        toolName: "langfuseDocs_search",
        args: { query: "invite users" },
      },
    });
    processor.handleChunk({
      type: "tool-call",
      payload: {
        toolCallId: "tool-call-2",
        toolName: "langfuse_search",
        args: { traceId: "trace-1" },
      },
    });

    expect(forwardedChunks).toEqual([
      {
        type: "tool-call",
        payload: {
          toolCallId: "tool-call-1",
          toolName: "langfuseDocs_search",
          args: { query: "invite users" },
        },
      },
      {
        type: "tool-call",
        payload: {
          toolCallId: "tool-call-2",
          toolName: "langfuse_search",
          args: { traceId: "trace-1" },
        },
      },
    ]);
  });

  it("passes through native tool-calls that were not synthesized", () => {
    const { forwardedChunks, processor } = createPatchedChunkProcessor();

    processor.handleChunk({
      type: "tool-call",
      payload: {
        toolCallId: "tool-call-1",
        toolName: "langfuse_search",
        args: { query: "errors" },
      },
    });

    expect(forwardedChunks).toEqual([
      {
        type: "tool-call",
        payload: {
          toolCallId: "tool-call-1",
          toolName: "langfuse_search",
          args: { query: "errors" },
        },
      },
    ]);
  });

  it("converts tool-call approval chunks to suspended tool calls", () => {
    const { forwardedChunks, onError, processor } =
      createPatchedChunkProcessor();

    processor.handleChunk({
      type: "tool-call-approval",
      payload: {
        toolCallId: "tool-call-1",
        toolName: "langfuse_createScoreConfig",
        args: {
          name: "readiness",
          dataType: "NUMERIC",
          numericMinValue: 0,
          numericMaxValue: 1,
        },
        resumeSchema: { type: "object" },
      },
    });

    expect(onError).not.toHaveBeenCalled();
    expect(forwardedChunks).toEqual([
      {
        type: "tool-call-suspended",
        payload: {
          toolCallId: "tool-call-1",
          toolName: "langfuse_createScoreConfig",
          args: {
            name: "readiness",
            dataType: "NUMERIC",
            numericMinValue: 0,
            numericMaxValue: 1,
          },
          resumeSchema: { type: "object" },
          suspendPayload: {
            type: "approval",
            toolCallId: "tool-call-1",
            toolName: "langfuse_createScoreConfig",
            args: {
              name: "readiness",
              dataType: "NUMERIC",
              numericMinValue: 0,
              numericMaxValue: 1,
            },
          },
        },
      },
    ]);
  });

  it("drops streamed tool-call args when the tool call becomes an approval", () => {
    const { forwardedChunks, onError, processor } =
      createPatchedChunkProcessor();

    processor.handleChunk({
      type: "tool-call-input-streaming-start",
      payload: {
        toolCallId: "tool-call-1",
        toolName: "langfuse_createScoreConfig",
      },
    });
    processor.handleChunk({
      type: "tool-call-delta",
      payload: {
        toolCallId: "tool-call-1",
        argsTextDelta:
          '{"name":"readiness","dataType":"NUMERIC","numericMinValue":0,"numericMaxValue":1}',
      },
    });
    processor.handleChunk({
      type: "tool-call-approval",
      payload: {
        toolCallId: "tool-call-1",
        toolName: "langfuse_createScoreConfig",
        args: {
          name: "readiness",
          dataType: "NUMERIC",
          numericMinValue: 0,
          numericMaxValue: 1,
        },
      },
    });
    processor.handleChunk({
      type: "tool-call-input-streaming-end",
      payload: { toolCallId: "tool-call-1" },
    });

    expect(onError).not.toHaveBeenCalled();
    expect(forwardedChunks).toEqual([
      {
        type: "tool-call-suspended",
        payload: expect.objectContaining({
          toolCallId: "tool-call-1",
          toolName: "langfuse_createScoreConfig",
          args: {
            name: "readiness",
            dataType: "NUMERIC",
            numericMinValue: 0,
            numericMaxValue: 1,
          },
        }),
      },
    ]);
  });

  it("reports malformed tool-call approvals", () => {
    const { forwardedChunks, onError, processor } =
      createPatchedChunkProcessor();

    const shouldStop = processor.handleChunk({
      type: "tool-call-approval",
      payload: {
        toolCallId: "tool-call-1",
        args: { name: "readiness" },
      },
    });

    expect(shouldStop).toBe(true);
    expect(onError).toHaveBeenCalledWith(
      new Error(
        "Malformed tool-call-approval: missing toolCallId or toolName in payload",
      ),
    );
    expect(forwardedChunks).toEqual([]);
  });

  it("reports malformed tool-call deltas with no known tool name", () => {
    const { forwardedChunks, onError, processor } =
      createPatchedChunkProcessor();

    const shouldStop = processor.handleChunk({
      type: "tool-call-delta",
      payload: {
        toolCallId: "tool-call-1",
        argsTextDelta: '{"query":"invite users"}',
      },
    });

    expect(shouldStop).toBe(true);
    expect(onError).toHaveBeenCalledWith(
      new Error(
        "Malformed tool-call-delta: missing toolName for unknown toolCallId in payload",
      ),
    );
    expect(forwardedChunks).toEqual([]);
  });
});

describe("IN_APP_AGENT_LANGFUSE_MCP_TOOL_APPROVALS", () => {
  const getRegisteredLangfuseMcpTools = () =>
    toolRegistry
      .getFeatures()
      .flatMap((feature) => feature.tools.map((tool) => tool.definition));

  it("classifies every Langfuse MCP tool exactly once", () => {
    const tools = getRegisteredLangfuseMcpTools();
    const registeredToolNames = tools.map((tool) => tool.name).sort();
    const classifiedToolNames = Object.keys(
      IN_APP_AGENT_LANGFUSE_MCP_TOOL_APPROVALS,
    ).sort();

    expect(classifiedToolNames).toEqual(registeredToolNames);
  });
});

describe("createAgUiStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    promptMocks.getPrompt.mockResolvedValue({
      name: "in-app-agent-system-prompt",
      version: 2,
      compile: promptMocks.compile,
    });
  });

  it("serializes valid events including adapter message snapshots", async () => {
    const { createAgUiStream } =
      await import("@/src/ee/features/in-app-agent/server/agent");
    const input = {
      threadId: "conversation-1",
      runId: "run-1",
      messages: [
        {
          id: "user-message-1",
          role: "user" as const,
          content: "hello",
        },
      ],
      tools: [],
      context: [],
      state: {
        type: "existingConversation",
        projectId: "project-1",
        conversationId: "conversation-1",
      },
      forwardedProps: {},
    };
    const persistedEvents: AgUiEvent[] = [];
    const eventOrder: string[] = [];
    const langfuseClient = {
      getPrompt: promptMocks.getPrompt,
    };
    adapterEvents.inputs = [];

    adapterEvents.items = [
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
      {
        type: EventType.MESSAGES_SNAPSHOT,
        messages: [
          {
            id: "user-message-1",
            role: "user",
            content: "hello",
          },
        ],
      },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: "assistant-message-1",
        role: "assistant",
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: "assistant-message-1",
        delta: "hi",
      },
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: "assistant-message-1",
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
      },
    ];

    const stream = await createAgUiStream({
      input,
      signal: new AbortController().signal,
      options: {
        onEvent: async (event) => {
          persistedEvents.push(event);
          eventOrder.push(`persist:${event.type}`);
          await Promise.resolve();
        },
        awsBedrock: { modelId: "test-model" },
        langfuseMcp: {
          url: "https://example.com/api/public/mcp",
          publicKey: "pk",
          secretKey: "sk",
          runSecret: "run-secret",
        },
        redirectAction: {
          projectId: "project-1",
          isV4Enabled: false,
        },
        langfuseClient,
        useLocalPrompt: false,
        langfuseTracing: {
          environment: "langfuse-in-app-agent",
          metadata: { langfuse_project_id: "project-1" },
          userId: "user-1",
          traceId: "0123456789abcdef0123456789abcdef",
          targetProjectId: "project-1",
        },
      },
    });
    const streamedText = await readStream(stream, (event) => {
      eventOrder.push(`stream:${event.type}`);
    });

    expect(streamedText).toContain(EventType.MESSAGES_SNAPSHOT);
    expect(adapterEvents.inputs).toEqual([input]);
    const { Agent } = await import("@mastra/core/agent");
    expect(Agent).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({
          langfuse_getHealth: expect.objectContaining({
            server: "langfuse",
          }),
          langfuse_search: expect.objectContaining({
            server: "langfuse",
            requireApproval: true,
          }),
          langfuse_upsertDataset: expect.objectContaining({
            server: "langfuse",
            requireApproval: true,
          }),
          langfuseDocs_search: expect.objectContaining({
            server: "langfuseDocs",
            execute: expect.any(Function),
          }),
          langfuseDocs_fetch: expect.objectContaining({
            server: "langfuseDocs",
            execute: expect.any(Function),
          }),
          langfuse_proposeRedirect: expect.objectContaining({
            id: "langfuse_proposeRedirect",
          }),
        }),
      }),
    );
    const agentConfig = vi.mocked(Agent).mock.calls[0]?.[0];
    expect(agentConfig?.tools?.langfuse_getHealth).not.toHaveProperty(
      "requireApproval",
    );
    expect(agentConfig?.tools?.langfuseDocs_search).not.toHaveProperty(
      "requireApproval",
    );
    expect(agentConfig?.tools?.langfuseDocs_fetch).not.toHaveProperty(
      "requireApproval",
    );
    expect(
      agentConfig?.tools?.[IN_APP_AGENT_REDIRECT_TOOL_NAME]?.requireApproval,
    ).not.toBe(true);
    const docsSearchTool = agentConfig?.tools?.langfuseDocs_search;
    await expect(docsSearchTool?.execute?.({}, {})).resolves.toMatchObject({
      _meta: expect.objectContaining({
        choices: expect.any(Array),
      }),
    });

    const redirectTool = vi.mocked(Agent).mock.calls[0]?.[0]?.tools?.[
      IN_APP_AGENT_REDIRECT_TOOL_NAME
    ] as
      | {
          execute?: (input: unknown) => Promise<unknown>;
        }
      | undefined;

    await expect(
      redirectTool?.execute?.({
        label: "Open trace",
        destination: "trace",
        params: { traceId: "trace-1" },
      }),
    ).resolves.toEqual({
      type: "redirectAction",
      label: "Open trace",
      href: "/project/project-1/traces/trace-1",
    });

    expect(promptMocks.getPrompt).toHaveBeenCalledWith(
      "in-app-agent-system-prompt",
      undefined,
      { type: "text" },
    );
    expect(promptMocks.compile).toHaveBeenCalledWith(
      expect.objectContaining({
        currentDate: expect.any(String),
        redirectToolName: IN_APP_AGENT_REDIRECT_TOOL_NAME,
        screenContext: "",
        sidebarHiddenEnvironments: DEFAULT_SIDEBAR_HIDDEN_ENVIRONMENTS.map(
          (environment) => `"${environment}"`,
        ).join(", "),
      }),
    );
    expect(Agent).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "Prompt-managed assistant instructions",
      }),
    );
    expect(persistedEvents.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.MESSAGES_SNAPSHOT,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(persistedEvents[0]).toMatchObject({
      type: EventType.RUN_STARTED,
    });
    expect(persistedEvents[0]).not.toHaveProperty("input");
    expect(eventOrder).toEqual([
      `persist:${EventType.RUN_STARTED}`,
      `stream:${EventType.RUN_STARTED}`,
      `persist:${EventType.MESSAGES_SNAPSHOT}`,
      `stream:${EventType.MESSAGES_SNAPSHOT}`,
      `persist:${EventType.TEXT_MESSAGE_START}`,
      `stream:${EventType.TEXT_MESSAGE_START}`,
      `persist:${EventType.TEXT_MESSAGE_CONTENT}`,
      `stream:${EventType.TEXT_MESSAGE_CONTENT}`,
      `persist:${EventType.TEXT_MESSAGE_END}`,
      `stream:${EventType.TEXT_MESSAGE_END}`,
      `persist:${EventType.RUN_FINISHED}`,
      `stream:${EventType.RUN_FINISHED}`,
    ]);
    expect(
      instrumentationMocks.createInAppAgentInstrumentation,
    ).toHaveBeenCalledWith({
      input,
      tracing: expect.objectContaining({
        environment: "langfuse-in-app-agent",
        targetProjectId: "project-1",
        prompt: {
          name: "in-app-agent-system-prompt",
          version: 2,
        },
      }),
    });
    expect(
      instrumentationMocks.instrumentation.recordEvents.mock.calls.flatMap(
        ([events]) => (events as AgUiEvent[]).map((event) => event.type),
      ),
    ).toEqual([
      EventType.RUN_STARTED,
      EventType.MESSAGES_SNAPSHOT,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(instrumentationMocks.instrumentation.end).toHaveBeenCalledWith({});
    expect(instrumentationMocks.instrumentation.flush).toHaveBeenCalled();
  });

  it("executes approved tools manually and continues with tool result history", async () => {
    const { createAgUiStream } =
      await import("@/src/ee/features/in-app-agent/server/agent");
    const input = createToolApprovalResumeInput(true);
    adapterEvents.inputs = [];
    adapterEvents.items = [
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
    ];
    const persistedEvents: AgUiEvent[] = [];
    const langfuseClient = {
      getPrompt: promptMocks.getPrompt,
    };

    const stream = await createAgUiStream({
      input,
      signal: new AbortController().signal,
      options: {
        onEvent: (event) => {
          persistedEvents.push(event);
        },
        awsBedrock: { modelId: "test-model" },
        langfuseMcp: {
          url: "https://example.com/api/public/mcp",
          publicKey: "pk",
          secretKey: "sk",
          runSecret: "run-secret",
        },
        redirectAction: {
          projectId: "project-1",
          isV4Enabled: false,
        },
        langfuseClient,
        useLocalPrompt: false,
      },
    });
    await readStream(stream);

    expect(adapterEvents.inputs).toEqual([
      expect.objectContaining({
        forwardedProps: {},
        messages: expect.arrayContaining([
          {
            id: "tool-call-1-approval-tool-call",
            role: "assistant",
            runId: "interrupted-run-1",
            toolCalls: [
              {
                id: "tool-call-1",
                type: "function",
                function: {
                  name: "langfuse_createScoreConfig",
                  arguments: JSON.stringify({
                    name: "readiness",
                    dataType: "NUMERIC",
                    numericMinValue: 0,
                    numericMaxValue: 1,
                  }),
                },
              },
            ],
          },
          {
            id: "tool-call-1-approval-tool-result",
            role: "tool",
            toolCallId: "tool-call-1",
            content: JSON.stringify({
              id: "score-config-1",
              name: "readiness",
              dataType: "NUMERIC",
            }),
          },
        ]),
      }),
    ]);
    expect(persistedEvents).toEqual([
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
      {
        type: EventType.TOOL_CALL_START,
        parentMessageId: "tool-call-1-approval-tool-call",
        toolCallId: "tool-call-1",
        toolCallName: "langfuse_createScoreConfig",
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-call-1",
        delta: JSON.stringify({
          name: "readiness",
          dataType: "NUMERIC",
          numericMinValue: 0,
          numericMaxValue: 1,
        }),
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: "tool-call-1",
      },
      {
        type: EventType.TOOL_CALL_RESULT,
        messageId: "tool-call-1-approval-tool-result",
        toolCallId: "tool-call-1",
        content: JSON.stringify({
          id: "score-config-1",
          name: "readiness",
          dataType: "NUMERIC",
        }),
        role: "tool",
      },
    ]);

    const agentConfig = vi.mocked(Agent).mock.calls[0]?.[0];
    const createScoreConfigTool = agentConfig?.tools
      ?.langfuse_createScoreConfig as
      | {
          execute?: ReturnType<typeof vi.fn>;
        }
      | undefined;
    expect(createScoreConfigTool?.execute).toHaveBeenCalledWith(
      {
        name: "readiness",
        dataType: "NUMERIC",
        numericMinValue: 0,
        numericMaxValue: 1,
      },
      expect.objectContaining({
        abortSignal: expect.any(AbortSignal),
        agent: expect.objectContaining({
          toolCallId: "tool-call-1",
          threadId: "conversation-1",
        }),
      }),
    );
  });

  it("continues approved tools with a tool error result when execution fails", async () => {
    const { createAgUiStream } =
      await import("@/src/ee/features/in-app-agent/server/agent");
    const input = createToolApprovalResumeInput(true);
    const validationErrorMessage =
      "MCP error -32602: Validation failed: categories: Category must be an array of objects with label value pairs, where labels and values are unique.";
    adapterEvents.createScoreConfigExecute.mockRejectedValueOnce(
      new Error(validationErrorMessage),
    );
    adapterEvents.inputs = [];
    adapterEvents.items = [
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
    ];
    const persistedEvents: AgUiEvent[] = [];
    const onError = vi.fn();
    const langfuseClient = {
      getPrompt: promptMocks.getPrompt,
    };

    const stream = await createAgUiStream({
      input,
      signal: new AbortController().signal,
      options: {
        onEvent: (event) => {
          persistedEvents.push(event);
        },
        onError,
        awsBedrock: { modelId: "test-model" },
        langfuseMcp: {
          url: "https://example.com/api/public/mcp",
          publicKey: "pk",
          secretKey: "sk",
          runSecret: "run-secret",
        },
        redirectAction: {
          projectId: "project-1",
          isV4Enabled: false,
        },
        langfuseClient,
        useLocalPrompt: false,
      },
    });
    await readStream(stream);

    expect(onError).not.toHaveBeenCalled();
    const resumedMessages = adapterEvents.inputs[0]?.messages ?? [];
    const retryGuidanceMessage = resumedMessages.find(
      (message) =>
        message.id === "tool-call-1-approval-tool-error-guidance" &&
        message.role === "developer",
    );

    expect(adapterEvents.inputs).toEqual([
      expect.objectContaining({
        forwardedProps: {},
        messages: expect.arrayContaining([
          expect.objectContaining({
            id: "tool-call-1-approval-tool-result",
            role: "tool",
            toolCallId: "tool-call-1",
            content: validationErrorMessage,
            error: validationErrorMessage,
          }),
          expect.objectContaining({
            id: "tool-call-1-approval-tool-error-guidance",
            role: "developer",
            content: expect.any(String),
          }),
        ]),
      }),
    ]);
    expect(retryGuidanceMessage?.content).toContain(
      "The approved tool call langfuse_createScoreConfig failed during execution.",
    );
    expect(retryGuidanceMessage?.content).toContain(
      `Rejected arguments: ${JSON.stringify({
        name: "readiness",
        dataType: "NUMERIC",
        numericMinValue: 0,
        numericMaxValue: 1,
      })}`,
    );
    expect(retryGuidanceMessage?.content).toContain(
      `Tool error: ${validationErrorMessage}`,
    );
    expect(retryGuidanceMessage?.content).toContain(
      "Do not call the same tool again with identical arguments.",
    );
    expect(persistedEvents).toEqual([
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
      {
        type: EventType.TOOL_CALL_START,
        parentMessageId: "tool-call-1-approval-tool-call",
        toolCallId: "tool-call-1",
        toolCallName: "langfuse_createScoreConfig",
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-call-1",
        delta: JSON.stringify({
          name: "readiness",
          dataType: "NUMERIC",
          numericMinValue: 0,
          numericMaxValue: 1,
        }),
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: "tool-call-1",
      },
      expect.objectContaining({
        type: EventType.TOOL_CALL_RESULT,
        messageId: "tool-call-1-approval-tool-result",
        toolCallId: "tool-call-1",
        content: validationErrorMessage,
        role: "tool",
        error: validationErrorMessage,
      }),
    ]);
  });

  it("aborts rejected tools after streaming the rejected tool result", async () => {
    const { createAgUiStream } =
      await import("@/src/ee/features/in-app-agent/server/agent");
    const input = createToolApprovalResumeInput(false);
    adapterEvents.inputs = [];
    adapterEvents.items = [
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
    ];
    const langfuseClient = {
      getPrompt: promptMocks.getPrompt,
    };
    const persistedEvents: AgUiEvent[] = [];
    const streamedEvents: AgUiEvent[] = [];
    const onComplete = vi.fn();

    const stream = await createAgUiStream({
      input,
      signal: new AbortController().signal,
      options: {
        onEvent: (event) => {
          persistedEvents.push(event);
        },
        onComplete,
        awsBedrock: { modelId: "test-model" },
        langfuseMcp: {
          url: "https://example.com/api/public/mcp",
          publicKey: "pk",
          secretKey: "sk",
          runSecret: "run-secret",
        },
        redirectAction: {
          projectId: "project-1",
          isV4Enabled: false,
        },
        langfuseClient,
        useLocalPrompt: false,
      },
    });
    await readStream(stream, (event) => {
      streamedEvents.push(event);
    });

    expect(adapterEvents.inputs).toEqual([]);
    expect(persistedEvents).toEqual([
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
      {
        type: EventType.TOOL_CALL_START,
        parentMessageId: "tool-call-1-approval-tool-call",
        toolCallId: "tool-call-1",
        toolCallName: "langfuse_createScoreConfig",
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-call-1",
        delta: JSON.stringify({
          name: "readiness",
          dataType: "NUMERIC",
          numericMinValue: 0,
          numericMaxValue: 1,
        }),
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: "tool-call-1",
      },
      {
        type: EventType.TOOL_CALL_RESULT,
        messageId: "tool-call-1-approval-tool-result",
        toolCallId: "tool-call-1",
        content: "Tool call was not approved by the user.",
        role: "tool",
        error: "Tool call was not approved by the user.",
      },
    ]);
    expect(streamedEvents).toEqual(persistedEvents);
    expect(onComplete).toHaveBeenCalledOnce();

    const agentConfig = vi.mocked(Agent).mock.calls[0]?.[0];
    const createScoreConfigTool = agentConfig?.tools
      ?.langfuse_createScoreConfig as
      | {
          execute?: ReturnType<typeof vi.fn>;
        }
      | undefined;
    expect(createScoreConfigTool?.execute).not.toHaveBeenCalled();
  });

  it("uses V4-compatible filters for traces redirect actions", async () => {
    const { createAgUiStream } =
      await import("@/src/ee/features/in-app-agent/server/agent");
    const input = {
      threadId: "conversation-1",
      runId: "run-1",
      messages: [
        {
          id: "user-message-1",
          role: "user" as const,
          content: "open checkout traces",
        },
      ],
      tools: [],
      context: [],
      state: null,
      forwardedProps: {},
    };
    adapterEvents.items = [];
    const langfuseClient = {
      getPrompt: promptMocks.getPrompt,
    };

    const stream = await createAgUiStream({
      input,
      signal: new AbortController().signal,
      options: {
        awsBedrock: { modelId: "test-model" },
        langfuseMcp: {
          url: "https://example.com/api/public/mcp",
          publicKey: "pk",
          secretKey: "sk",
          runSecret: "run-secret",
        },
        redirectAction: {
          projectId: "project-1",
          isV4Enabled: true,
        },
        langfuseClient,
        useLocalPrompt: false,
      },
    });
    await readStream(stream);

    const redirectTool = vi.mocked(Agent).mock.calls[0]?.[0]?.tools?.[
      IN_APP_AGENT_REDIRECT_TOOL_NAME
    ] as
      | {
          execute?: (input: unknown) => Promise<unknown>;
        }
      | undefined;

    const result = await redirectTool?.execute?.({
      label: "Open traces tagged checkout",
      destination: "traces",
      params: {
        filters: {
          tags: ["checkout"],
          sessionId: ["session-1"],
          bookmarked: true,
        },
      },
    });

    expect(result).toMatchObject({
      type: "redirectAction",
      label: "Open traces tagged checkout",
    });
    const href = (result as { href: string }).href;
    const filter = new URL(`https://langfuse.local${href}`).searchParams.get(
      "filter",
    );

    expect(decodeFiltersGeneric(filter ?? "")).toEqual([
      {
        column: "tags",
        operator: "any of",
        type: "arrayOptions",
        value: ["checkout"],
      },
    ]);
  });

  it("lets HttpAgent subscribers observe streamed run errors", async () => {
    const { createAgUiStream } =
      await import("@/src/ee/features/in-app-agent/server/agent");
    const input = {
      threadId: "conversation-1",
      runId: "run-1",
      messages: [
        {
          id: "user-message-1",
          role: "user" as const,
          content: "hello",
        },
      ],
      tools: [],
      context: [],
      state: null,
      forwardedProps: {},
    };
    const runErrorMessage = "AWS credential provider failed: Token is expired.";
    const langfuseClient = {
      getPrompt: promptMocks.getPrompt,
    };

    adapterEvents.items = [
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
      {
        type: EventType.RUN_ERROR,
        threadId: input.threadId,
        runId: input.runId,
        message: runErrorMessage,
      },
    ];

    const serverStream = await createAgUiStream({
      input,
      signal: new AbortController().signal,
      options: {
        awsBedrock: { modelId: "test-model" },
        langfuseMcp: {
          url: "https://example.com/api/public/mcp",
          publicKey: "pk",
          secretKey: "sk",
          runSecret: "run-secret",
        },
        redirectAction: {
          projectId: "project-1",
          isV4Enabled: false,
        },
        langfuseClient,
        useLocalPrompt: false,
      },
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(serverStream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    try {
      const agent = new HttpAgent({
        url: "https://example.com/api/in-app-agent",
        threadId: input.threadId,
        initialMessages: input.messages,
        initialState: input.state,
      });
      let streamedErrorMessage: string | undefined;

      agent.subscribe({
        onRunErrorEvent: ({ event }) => {
          streamedErrorMessage = event.message;
        },
      });

      await expect(agent.runAgent({ runId: input.runId })).resolves.toEqual({
        result: undefined,
        newMessages: [],
      });

      expect(streamedErrorMessage).toBe(runErrorMessage);
    } finally {
      fetchMock.mockRestore();
    }
  });
});

async function readStream(
  stream: ReadableStream<Uint8Array>,
  onEvent?: (event: AgUiEvent) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return text;
    }
    const chunk = decoder.decode(value);
    text += chunk;

    for (const event of parseEvents(chunk)) {
      onEvent?.(event);
    }
  }
}

function createToolApprovalResumeInput(approved: boolean) {
  return {
    threadId: "conversation-1",
    runId: "run-2",
    messages: [
      {
        id: "user-message-1",
        role: "user" as const,
        content: "create a readiness score config",
      },
    ],
    tools: [],
    context: [],
    state: {
      type: "existingConversation",
      projectId: "project-1",
      conversationId: "conversation-1",
    },
    forwardedProps: {
      command: {
        resume: {
          approved,
          approvalRequest: {
            type: "tool_approval_request" as const,
            toolCallId: "tool-call-1",
            toolName: "langfuse_createScoreConfig",
            args: {
              name: "readiness",
              dataType: "NUMERIC",
              numericMinValue: 0,
              numericMaxValue: 1,
            },
            runId: "interrupted-run-1",
          },
        },
      },
    },
  };
}

function parseEvents(chunk: string) {
  return chunk
    .split("\n\n")
    .filter(Boolean)
    .flatMap((line): AgUiEvent[] => {
      const json = line.replace(/^data: /, "");
      try {
        return [JSON.parse(json) as AgUiEvent];
      } catch {
        return [];
      }
    });
}
