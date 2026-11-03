import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { ClickHouseResourceError } from "@langfuse/shared/src/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineTool } from "@/src/features/mcp/core/define-tool";
import { createMcpServer } from "@/src/features/mcp/server/mcpServer";
import { toolRegistry } from "@/src/features/mcp/server/registry";
import { __dangerouslySkipAuthz } from "@/src/features/public-api/server/enforceAuth";
import type { ServerContext } from "@/src/features/mcp/types";

vi.mock("@/src/features/mcp/server/registry", () => ({
  toolRegistry: { getEnabledTool: vi.fn() },
}));

const context: ServerContext = {
  projectId: "project-1",
  orgId: "org-1",
  apiKeyId: "key-1",
  accessLevel: "project",
  publicKey: "pk-lf-test",
  plan: "oss",
  rateLimitOverrides: [],
  accessAuditLogEnabled: false,
};

describe("MCP tool results", () => {
  it.each([
    {
      name: "timeout",
      error: new ClickHouseResourceError(
        "TIMEOUT",
        new Error("internal query"),
      ),
      input: "valid",
      message:
        "The ClickHouse query timed out. Narrow the query by shortening the date range or adding more specific filters before trying again.",
    },
    {
      name: "missing resource",
      error: new LangfuseNotFoundError("Prompt 'example' not found"),
      input: "valid",
      message: "Prompt 'example' not found",
    },
    {
      name: "validation",
      error: undefined,
      input: "",
      message: "Validation failed: name: Name is required",
    },
    ...[
      new Error("internal secret"),
      new McpError(ErrorCode.InternalError, "internal secret"),
    ].map((error) => ({
      name: error.constructor.name,
      error,
      input: "valid",
      message: "An unexpected error occurred. Please try again later.",
    })),
    { name: "success", error: undefined, input: "valid", message: "ok" },
  ])(
    "preserves safe output for $name through defineTool",
    async ({ error, input, message }) => {
      const schema = z.object({ name: z.string().min(1, "Name is required") });
      const [definition, handler] = defineTool({
        name: "test-tool",
        description: "test",
        action: __dangerouslySkipAuthz,
        baseSchema: schema,
        inputSchema: schema,
        handler: async () => {
          if (error) throw error;
          return "ok";
        },
      });
      vi.mocked(toolRegistry.getEnabledTool).mockImplementation(async (name) =>
        name === definition.name ? { definition, handler } : undefined,
      );
      const server = createMcpServer(context);
      const client = new Client({ name: "test", version: "1.0.0" });
      const [serverTransport, clientTransport] =
        InMemoryTransport.createLinkedPair();
      try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        const result = await client.callTool({
          name: definition.name,
          arguments: { name: input },
        });
        expect(result.content).toEqual([{ type: "text", text: message }]);
        expect(result.isError).toBe(message === "ok" ? undefined : true);
        await expect(
          client.callTool({ name: "unknown", arguments: {} }),
        ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
      } finally {
        await client.close();
        await server.close();
      }
    },
  );
});
