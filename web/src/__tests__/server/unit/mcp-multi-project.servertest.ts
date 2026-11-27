import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { defineTool } from "@/src/features/mcp/core/define-tool";
import { createMcpServer } from "@/src/features/mcp/server/mcpServer";
import {
  getEnabledTool,
  getEnabledTools,
} from "@/src/features/mcp/server/tools";
import type { McpConnection } from "@/src/features/mcp/types";
import {
  mockAuthContext,
  mockConnection,
} from "@/src/__tests__/server/mcp-auth-fixtures";

vi.mock("@/src/features/mcp/server/tools", () => ({
  getEnabledTool: vi.fn(),
  getEnabledTools: vi.fn(),
  canCallTool: () => true,
}));

const schema = z.object({ name: z.string() }).strict();
const [definition, handler] = defineTool({
  name: "whereAmI",
  description: "test",
  action: "prompts:read",
  baseSchema: schema,
  inputSchema: schema,
  handler: async (input, context) => `${context.projectId}:${input.name}`,
});

const projectKey = mockConnection(
  mockAuthContext({
    orgId: "org_1",
    projectId: "prj_1",
    actions: ["prompts:read"],
    organizations: [{ orgId: "org_1", projectIds: ["prj_1", "prj_2"] }],
  }),
);

const orgKey = mockConnection(
  mockAuthContext({
    orgId: "org_1",
    actions: ["prompts:read"],
    organizations: [{ orgId: "org_1", projectIds: ["prj_1", "prj_2"] }],
  }),
);

describe("MCP tools across projects", () => {
  let client: Client;
  let close: () => Promise<void>;

  const connect = async (connection: McpConnection) => {
    const server = await createMcpServer(connection);
    client = new Client({ name: "test", version: "1.0.0" });
    const [serverTransport, clientTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    close = async () => {
      await client.close();
      await server.close();
    };
  };

  const call = async (args: Record<string, unknown>) => {
    const result = await client.callTool({ name: "whereAmI", arguments: args });
    return result.content;
  };

  beforeEach(() => {
    vi.mocked(getEnabledTool).mockResolvedValue({ definition, handler });
    vi.mocked(getEnabledTools).mockResolvedValue([{ definition, handler }]);
  });

  afterEach(async () => {
    await close();
  });

  it("requires projectId on project tools for a key bound to no project", async () => {
    await connect(orgKey);
    const { tools } = await client.listTools();
    expect(tools[0]?.inputSchema.properties).toHaveProperty("projectId");
    expect(tools[0]?.inputSchema.required).toEqual(["name", "projectId"]);
  });

  it("omits projectId for a project key, whose calls run in its own project", async () => {
    await connect(projectKey);
    const { tools } = await client.listTools();
    expect(tools[0]?.inputSchema.properties).not.toHaveProperty("projectId");
    expect(tools[0]?.inputSchema.required).toEqual(["name"]);
    expect(await call({ name: "a" })).toEqual([
      { type: "text", text: "prj_1:a" },
    ]);
  });

  it("strips projectId before the tool's strict schema validates its input", async () => {
    await connect(orgKey);
    expect(await call({ name: "a", projectId: "prj_1" })).toEqual([
      { type: "text", text: "prj_1:a" },
    ]);
    expect(await call({ name: "b", projectId: "prj_2" })).toEqual([
      { type: "text", text: "prj_2:b" },
    ]);
  });
});
