/**
 * CallTool error handling over the JSON-RPC layer.
 *
 * Tool execution failures must surface as tool results with isError: true so
 * the calling agent can read the recovery guidance, while unknown tools stay
 * JSON-RPC protocol errors (InvalidParams) per the MCP spec.
 */
vi.mock("@/src/features/mcp/server/registry", () => ({
  toolRegistry: { getEnabledTool: vi.fn() },
}));

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { ClickHouseResourceError } from "@langfuse/shared/src/server";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  type ProjectAction,
} from "@langfuse/shared/rbac";
import type { ServerContext } from "@/src/features/mcp/types";
import type { ToolDefinition } from "@/src/features/mcp/core/define-tool";
import { createMcpServer } from "@/src/features/mcp/server/mcpServer";
import { toolRegistry } from "@/src/features/mcp/server/registry";
import type { Policy } from "@/src/features/rbac/types";
import type { AuthorizationContext } from "@/src/features/auth/policy/types";

const mockedGetEnabledTool = vi.mocked(toolRegistry.getEnabledTool);

const PRJ = "prj_1";

const allowPromptsRead: Policy = {
  id: "system/LEGACY_PROJECT_API_KEY:project",
  tenantId: OrganizationId("org_1"),
  roleId: SystemRoleId("LEGACY_PROJECT_API_KEY"),
  actions: ["prompts:read"] as ProjectAction[] as never,
  resources: [ProjectId(PRJ)],
  effect: "ALLOW",
};

const authContext = (policies: Policy[]): AuthorizationContext => ({
  principal: {
    kind: "apiKey",
    apiKeyId: "key_1",
    userId: null,
    isInAppAgentKey: false,
    publicKey: "pk-lf-1",
    scope: "PROJECT",
    presentation: "privateKey",
    organizations: [],
    boundResource: { orgId: "org_1", projectId: PRJ },
  },
  policies,
});

const context: ServerContext = {
  projectId: PRJ,
  orgId: "org_1",
  apiKeyId: "key_1",
  accessLevel: "project",
  publicKey: "pk-lf-1",
  plan: "cloud:hobby",
  rateLimitOverrides: [],
  auth: authContext([allowPromptsRead]),
};

const definition: ToolDefinition = {
  name: "stub-tool",
  description: "stub",
  action: "prompts:read",
  inputSchema: { type: "object" },
};

const connect = async () => {
  const server = createMcpServer(context);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [serverTransport, clientTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
};

beforeEach(() => {
  mockedGetEnabledTool.mockReset();
  mockedGetEnabledTool.mockImplementation(async (name: string) =>
    name === "stub-tool"
      ? { definition, handler: async () => ({ ok: true }) }
      : undefined,
  );
});

describe("MCP CallTool error handling", () => {
  it("returns tool execution failures as isError results instead of JSON-RPC errors", async () => {
    mockedGetEnabledTool.mockImplementation(async () => ({
      definition,
      handler: async () => {
        throw new LangfuseNotFoundError("Prompt 'my-prompt' not found");
      },
    }));

    const client = await connect();
    const result = await client.callTool({
      name: "stub-tool",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: "Prompt 'my-prompt' not found" },
    ]);
  });

  it("keeps ClickHouse timeout recovery guidance visible to the agent", async () => {
    mockedGetEnabledTool.mockImplementation(async () => ({
      definition,
      handler: async () => {
        throw new ClickHouseResourceError(
          "TIMEOUT",
          new Error("Code: 159. Timed out"),
        );
      },
    }));

    const client = await connect();
    const result = await client.callTool({
      name: "stub-tool",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]
      .text;
    expect(text).toContain("ClickHouse query timed out");
  });

  it("reports unknown tools as InvalidParams protocol errors", async () => {
    const client = await connect();

    await expect(
      client.callTool({ name: "does-not-exist", arguments: {} }),
    ).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringContaining("Unknown tool: does-not-exist"),
    });
  });

  it("returns successful tool results unchanged", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "stub-tool",
      arguments: {},
    });

    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify({ ok: true }, null, 2) },
    ]);
  });
});
