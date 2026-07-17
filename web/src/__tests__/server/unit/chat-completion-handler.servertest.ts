import { NextRequest } from "next/server";
import type * as SharedServer from "@langfuse/shared/src/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createOutput: vi.fn(),
  createToolSet: vi.fn(),
  findConnection: vi.fn(),
  generate: vi.fn(),
  mapLegacyParams: vi.fn(),
  stream: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({
  env: { LANGFUSE_BLOCKED_USERIDS_CHATCOMPLETION: new Map() },
}));

vi.mock("@/src/features/playground/server/authorizeRequest", () => ({
  authorizeRequestOrThrow: mocks.authorize,
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { llmApiKeys: { findFirst: mocks.findConnection } },
}));

vi.mock("@opentelemetry/api", () => ({
  context: {
    with: (_context: unknown, callback: () => unknown) => callback(),
  },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();

  return {
    ...actual,
    LLMApiKeySchema: {
      safeParse: (connection: unknown) => ({ success: true, data: connection }),
    },
    contextWithLangfuseProps: vi.fn(() => ({})),
    createLLMOutput: mocks.createOutput,
    createLLMToolSet: mocks.createToolSet,
    generateLLMText: mocks.generate,
    mapLegacyLLMCompletionParams: mocks.mapLegacyParams,
    streamLLMText: mocks.stream,
  };
});

import chatCompletionHandler from "@/src/features/playground/server/chatCompletionHandler";
import { LLMValidationError } from "@langfuse/shared/src/server";

const baseBody = {
  projectId: "project-1",
  messages: [{ role: "user", type: "user", content: "Hello" }],
  modelParams: {
    provider: "openai",
    adapter: "openai",
    model: "gpt-4.1",
  },
  streaming: false,
};

function createRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/chatCompletion", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("chatCompletionHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ userId: "user-1" });
    mocks.findConnection.mockResolvedValue({
      id: "connection-1",
      secretKey: "encrypted-key",
    });
    mocks.mapLegacyParams.mockReturnValue({
      model: { adapter: "openai", id: "gpt-4.1" },
      connection: { secretKey: "encrypted-key" },
      messages: [{ role: "user", content: "Hello" }],
    });
  });

  it("maps a native text result to the existing playground JSON response", async () => {
    mocks.generate.mockResolvedValue({
      text: "Hello back",
      finalStep: { reasoningText: "A short reason" },
    });

    const response = await chatCompletionHandler(createRequest(baseBody));

    await expect(response.json()).resolves.toEqual({
      content: "Hello back",
      reasoning: "A short reason",
    });
    expect(mocks.generate).toHaveBeenCalledWith({
      model: { adapter: "openai", id: "gpt-4.1" },
      connection: { secretKey: "encrypted-key" },
      messages: [{ role: "user", content: "Hello" }],
    });
  });

  it("returns only the generated structured output", async () => {
    const output = { kind: "object-output" };
    mocks.createOutput.mockReturnValue(output);
    mocks.generate.mockResolvedValue({ output: { answer: 42 } });

    const response = await chatCompletionHandler(
      createRequest({
        ...baseBody,
        structuredOutputSchema: {
          type: "object",
          properties: { answer: { type: "number" } },
          required: ["answer"],
        },
      }),
    );

    await expect(response.json()).resolves.toEqual({ answer: 42 });
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ output }),
    );
  });

  it("maps native tool calls to the legacy playground tool_calls shape", async () => {
    const toolSet = { lookup: { description: "Look up a value" } };
    mocks.createToolSet.mockReturnValue(toolSet);
    mocks.generate.mockResolvedValue({
      text: "",
      finalStep: { reasoningText: "I need the tool" },
      toolCalls: [
        {
          toolName: "lookup",
          toolCallId: "call-1",
          input: { key: "value" },
        },
      ],
    });

    const response = await chatCompletionHandler(
      createRequest({
        ...baseBody,
        tools: [
          {
            name: "lookup",
            description: "Look up a value",
            parameters: {
              type: "object",
              properties: { key: { type: "string" } },
              required: ["key"],
            },
          },
        ],
      }),
    );

    await expect(response.json()).resolves.toEqual({
      content: "",
      tool_calls: [{ name: "lookup", id: "call-1", args: { key: "value" } }],
      reasoning: "I need the tool",
    });
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ tools: toolSet }),
    );
  });

  it("preserves extracted tool names for provider validation", async () => {
    const toolSet = { "ns:get_time": { description: "Get the time" } };
    mocks.createToolSet.mockReturnValue(toolSet);
    mocks.generate.mockResolvedValue({
      text: "",
      finalStep: {},
      toolCalls: [],
    });

    const toolDefinition = {
      name: "ns:get_time",
      description: "Get the time",
      parameters: { type: "object", properties: {} },
    };
    const response = await chatCompletionHandler(
      createRequest({
        ...baseBody,
        tools: [toolDefinition],
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createToolSet).toHaveBeenCalledWith([toolDefinition]);
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ tools: toolSet }),
    );
  });

  it("preserves the text/plain streaming response", async () => {
    const textStream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("streamed text");
        controller.close();
      },
    });
    mocks.stream.mockResolvedValue({ textStream });

    const response = await chatCompletionHandler(
      createRequest({ ...baseBody, streaming: true }),
    );

    await expect(response.text()).resolves.toBe("streamed text");
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("preserves terminal LLM configuration status codes", async () => {
    const error = new LLMValidationError({
      code: "invalid-request",
      message: "Unsupported provider options: unknown_parameter",
    });
    mocks.generate.mockRejectedValue(error);

    const response = await chatCompletionHandler(createRequest(baseBody));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "LLMValidationError",
      message: "Unsupported provider options: unknown_parameter",
    });
  });
});
