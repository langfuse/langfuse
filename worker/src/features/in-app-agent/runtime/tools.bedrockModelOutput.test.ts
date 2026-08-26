import { createAmazonBedrock } from "ai-sdk-amazon-bedrock-v4";
import { Tool } from "@mastra/core/tools";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { withOptionalSilentMcpOutput } from "./tools";

// Shape of a real MCP CallToolResult from getObservationFilterValues: the
// VALUES JSON lives in content[].text, with no AI SDK `{ type, value }`.
const FILTER_VALUES_JSON = JSON.stringify({
  type: "VALUES",
  column: "name",
  values: [
    { value: "Codex Turn", count: 12 },
    { value: "generation", count: 40 },
  ],
  meta: {},
});

const FILTER_VALUES_MCP_RESULT = {
  content: [{ type: "text", text: FILTER_VALUES_JSON }],
};

const dummySandbox = {
  async read() {
    return null;
  },
  async write() {
    return null;
  },
  async edit() {
    return null;
  },
  async bash() {
    return null;
  },
};

describe("Bedrock Converse MCP tool results", () => {
  it("puts unwrapped VALUES JSON in the Converse toolResult text", async () => {
    const tools = withOptionalSilentMcpOutput({
      tools: {
        langfuse_getObservationFilterValues: new Tool({
          id: "langfuse_getObservationFilterValues",
          description: "Get observation filter values",
          inputSchema: z.object({ column: z.string() }),
          execute: async () => FILTER_VALUES_MCP_RESULT,
        }),
      },
      sandbox: dummySandbox,
    });
    const tool = tools.langfuse_getObservationFilterValues;
    const result = await tool.execute?.({ column: "name" }, {
      agent: { toolCallId: "tooluse_filter_values" },
    } as never);
    const output = tool.toModelOutput?.(result);

    const { calls, fetch } = createCaptureFetch({
      output: {
        message: {
          role: "assistant",
          content: [{ text: "ok" }],
        },
      },
      stopReason: "end_turn",
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
      },
    });
    const bedrock = createAmazonBedrock({
      apiKey: "test",
      region: "us-east-1",
      baseURL: "https://bedrock.test",
      fetch,
    });
    const model = bedrock("anthropic.claude-sonnet-4");

    await model.doGenerate({
      prompt: [
        {
          role: "user",
          content: [
            { type: "text", text: "What are the distinct observation names?" },
          ],
        },
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "tooluse_filter_values",
              toolName: "langfuse_getObservationFilterValues",
              input: { column: "name" },
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "tooluse_filter_values",
              toolName: "langfuse_getObservationFilterValues",
              output,
            },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          name: "langfuse_getObservationFilterValues",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.endsWith("/converse")).toBe(true);
    expect(calls[0]?.url).not.toContain("invoke-model");

    const toolResultText = getConverseToolResultText(calls[0]?.body);
    expect(toolResultText).toContain('"type":"VALUES"');
    expect(toolResultText).toContain("Codex Turn");
  });
});

function getConverseToolResultText(
  body: Record<string, unknown> | undefined,
): string {
  const messages = body?.messages;
  if (!Array.isArray(messages)) {
    return "";
  }

  const texts: string[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object" || !("content" in message)) {
      continue;
    }
    if (!Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      if (!part || typeof part !== "object" || !("toolResult" in part)) {
        continue;
      }
      const toolResult = part.toolResult;
      if (
        !toolResult ||
        typeof toolResult !== "object" ||
        !("content" in toolResult) ||
        !Array.isArray(toolResult.content)
      ) {
        continue;
      }
      for (const item of toolResult.content) {
        if (
          item &&
          typeof item === "object" &&
          "text" in item &&
          typeof item.text === "string"
        ) {
          texts.push(item.text);
        }
      }
    }
  }

  return texts.join("\n");
}

function createCaptureFetch(response: unknown) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    calls.push({
      url: request.url,
      body: JSON.parse(await request.text()) as Record<string, unknown>,
    });
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetch: fetchImpl };
}
