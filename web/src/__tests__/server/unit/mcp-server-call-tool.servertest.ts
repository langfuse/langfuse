import { describe, expect, it, vi, afterEach } from "vitest";
import { z } from "zod";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

vi.mock("@/src/env.mjs", () => ({
  env: {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "us",
    LANGFUSE_RATE_LIMITS_ENABLED: "true",
  },
}));

import { createMcpServer } from "@/src/features/mcp/server/mcpServer";
import { toolRegistry } from "@/src/features/mcp/server/registry";
import { defineTool } from "@/src/features/mcp/core/define-tool";
import { __dangerouslySkipAuthz } from "@/src/features/public-api/server";
import { mockServerContext } from "../mcp-helpers";
import { UserInputError } from "@/src/features/mcp/core/errors";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

describe("createMcpServer CallTool error handling", () => {
  const registeredFeatureNames: string[] = [];
  const registeredToolNames: string[] = [];

  afterEach(() => {
    for (const name of registeredFeatureNames) {
      (toolRegistry as any).features.delete(name);
    }
    for (const name of registeredToolNames) {
      (toolRegistry as any).tools.delete(name);
    }
    registeredFeatureNames.length = 0;
    registeredToolNames.length = 0;
  });

  function registerTestTool(
    name: string,
    handler: (input: any) => Promise<any>,
  ) {
    const [definition, toolHandler] = defineTool({
      name,
      description: `Test tool ${name}`,
      action: __dangerouslySkipAuthz,
      baseSchema: z.object({ query: z.string().optional() }),
      inputSchema: z.object({ query: z.string().optional() }),
      handler,
    });

    const featureName = `test-feature-${name}`;
    toolRegistry.register({
      name: featureName,
      description: "Test feature",
      tools: [{ definition, handler: toolHandler }],
    });

    registeredFeatureNames.push(featureName);
    registeredToolNames.push(name);
  }

  it("returns execution errors as tool results with isError: true", async () => {
    registerTestTool("failingTool", async () => {
      throw new UserInputError("Invalid query parameter supplied");
    });

    const context = mockServerContext();
    const server = createMcpServer(context);
    const callToolHandler = (server as any)._requestHandlers.get(
      CallToolRequestSchema.shape.method.value,
    );

    const response = await callToolHandler({
      method: "tools/call",
      params: {
        name: "failingTool",
        arguments: {},
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain(
      "Invalid query parameter supplied",
    );
  });

  it("returns validation errors as tool results with isError: true", async () => {
    const [definition, toolHandler] = defineTool({
      name: "strictInputTool",
      description: "Requires mandatory id",
      action: __dangerouslySkipAuthz,
      baseSchema: z.object({ id: z.string().min(1) }),
      inputSchema: z.object({ id: z.string().min(1) }),
      handler: async (input) => input,
    });

    const featureName = "test-feature-strictInputTool";
    toolRegistry.register({
      name: featureName,
      description: "Test feature",
      tools: [{ definition, handler: toolHandler }],
    });
    registeredFeatureNames.push(featureName);
    registeredToolNames.push("strictInputTool");

    const context = mockServerContext();
    const server = createMcpServer(context);
    const callToolHandler = (server as any)._requestHandlers.get(
      CallToolRequestSchema.shape.method.value,
    );

    const response = await callToolHandler({
      method: "tools/call",
      params: {
        name: "strictInputTool",
        arguments: {},
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("Validation failed");
  });

  it("throws McpError with InvalidParams code when tool is unknown", async () => {
    const context = mockServerContext();
    const server = createMcpServer(context);
    const callToolHandler = (server as any)._requestHandlers.get(
      CallToolRequestSchema.shape.method.value,
    );

    await expect(
      callToolHandler({
        method: "tools/call",
        params: {
          name: "nonExistentTool",
          arguments: {},
        },
      }),
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof McpError &&
        err.code === ErrorCode.InvalidParams &&
        err.message.includes("Unknown tool: nonExistentTool")
      );
    });
  });

  it("returns successful tool result without isError flag", async () => {
    registerTestTool("successTool", async () => {
      return { success: true, count: 42 };
    });

    const context = mockServerContext();
    const server = createMcpServer(context);
    const callToolHandler = (server as any)._requestHandlers.get(
      CallToolRequestSchema.shape.method.value,
    );

    const response = await callToolHandler({
      method: "tools/call",
      params: {
        name: "successTool",
        arguments: {},
      },
    });

    expect(response).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, count: 42 }, null, 2),
        },
      ],
    });
    expect(response.isError).toBeUndefined();
  });
});
