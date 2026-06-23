import { EventType } from "@ag-ui/core";
import { HttpAgent } from "@ag-ui/client";
import { Agent } from "@mastra/core/agent";
import { describe, expect, it, vi } from "vitest";

import type { AgUiEvent } from "@/src/ee/features/in-app-agent/schema";
import { IN_APP_AGENT_REDIRECT_TOOL_NAME } from "@/src/ee/features/in-app-agent/constants";
import { patchMastraToolCallInputStreaming } from "@/src/ee/features/in-app-agent/server/agent";
import { DEFAULT_SIDEBAR_HIDDEN_ENVIRONMENTS } from "@/src/features/filters/constants/internal-environments";
import { decodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import type { MastraAgent } from "@ag-ui/mastra";

const adapterEvents = vi.hoisted(() => ({
  items: [] as AgUiEvent[],
  cleanup: vi.fn().mockResolvedValue(undefined),
  inputs: [] as unknown[],
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
          langfuse: { search: { server: "langfuse" } },
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
          user: { id: "user-1" },
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
        tools: {
          langfuse_search: { server: "langfuse" },
          langfuseDocs_search: expect.objectContaining({
            server: "langfuseDocs",
            execute: expect.any(Function),
          }),
          langfuse_proposeRedirect: expect.objectContaining({
            id: "langfuse_proposeRedirect",
          }),
        },
      }),
    );
    const agentConfig = vi.mocked(Agent).mock.calls[0]?.[0];
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
