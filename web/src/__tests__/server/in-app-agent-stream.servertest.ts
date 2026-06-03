import { EventType } from "@ag-ui/core";
import { describe, expect, it, vi } from "vitest";

import type { AgUiEvent } from "@/src/features/in-app-agent/schema";

const adapterEvents = vi.hoisted(() => ({
  items: [] as AgUiEvent[],
}));

vi.mock("@ag-ui/claude-agent-sdk", () => ({
  ClaudeAgentAdapter: vi.fn().mockImplementation(function () {
    return {
      interrupt: vi.fn().mockResolvedValue(undefined),
      run: () => ({
        subscribe: (subscriber: {
          next: (event: AgUiEvent) => void;
          complete: () => void;
        }) => {
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

describe("createAgUiStream", () => {
  it("serializes valid events and drops partial adapter message snapshots", async () => {
    const { createAgUiStream } =
      await import("@/src/features/in-app-agent/server/agent");
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
        onResumeSessionId: () => input.state,
        onEvent: async (event) => {
          persistedEvents.push(event);
          eventOrder.push(`persist:${event.type}`);
          await Promise.resolve();
        },
        awsBedrock: {},
        langfuseMcp: {
          url: "https://example.com/api/public/mcp",
          publicKey: "pk",
          secretKey: "sk",
        },
      },
    });
    const streamedText = await readStream(stream, (event) => {
      eventOrder.push(`stream:${event.type}`);
    });

    expect(streamedText).not.toContain(EventType.MESSAGES_SNAPSHOT);
    expect(persistedEvents.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(persistedEvents[0]).toMatchObject({
      type: EventType.RUN_STARTED,
      input,
    });
    expect(eventOrder).toEqual([
      `persist:${EventType.RUN_STARTED}`,
      `stream:${EventType.RUN_STARTED}`,
      `persist:${EventType.TEXT_MESSAGE_START}`,
      `stream:${EventType.TEXT_MESSAGE_START}`,
      `persist:${EventType.TEXT_MESSAGE_CONTENT}`,
      `stream:${EventType.TEXT_MESSAGE_CONTENT}`,
      `persist:${EventType.TEXT_MESSAGE_END}`,
      `stream:${EventType.TEXT_MESSAGE_END}`,
      `persist:${EventType.RUN_FINISHED}`,
      `stream:${EventType.RUN_FINISHED}`,
    ]);
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
