import { EventType } from "@ag-ui/core";
import { HttpAgent } from "@ag-ui/client";
import { Agent } from "@mastra/core/agent";
import { describe, expect, it, vi } from "vitest";

import type { AgUiEvent } from "@/src/ee/features/in-app-agent/schema";

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
          langfuseDocs: { search: { server: "langfuseDocs" } },
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

describe("createAgUiStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    const stream = createAgUiStream({
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
    expect(Agent).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: {
          langfuse_search: { server: "langfuse" },
          langfuseDocs_search: { server: "langfuseDocs" },
          langfuse_proposeRedirect: expect.objectContaining({
            id: "langfuse_proposeRedirect",
          }),
        },
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

    const serverStream = createAgUiStream({
      input,
      signal: new AbortController().signal,
      options: {
        awsBedrock: { modelId: "test-model" },
        langfuseMcp: {
          url: "https://example.com/api/public/mcp",
          publicKey: "pk",
          secretKey: "sk",
        },
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
