import { randomUUID } from "node:crypto";

import { LLMAdapter } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

import { createMcpTestSetup } from "@/src/__tests__/server/mcp-helpers";
import { env } from "@/src/env.mjs";
import type { ServerContext } from "@/src/features/mcp/types";
import "@/src/features/mcp/server/bootstrap";
import {
  handleDeleteLlmConnection,
  handleListLlmConnections,
  handleUpsertLlmConnection,
  upsertLlmConnectionTool,
} from "@/src/features/mcp/server/llmConnections/tools";
import { toolRegistry } from "@/src/features/mcp/server/registry";

describe("MCP LLM connection tools", () => {
  it("requires create access before checking update access for replacements", () => {
    expect(upsertLlmConnectionTool.action).toBe("llmApiKeys:create");
  });

  it("advertises project LLM connection tools", async () => {
    const project = await createMcpTestSetup();

    const projectTools = (
      await toolRegistry.getToolDefinitions(project.context)
    ).map((tool) => tool.name);

    expect(projectTools).toEqual(
      expect.arrayContaining([
        "listLlmConnections",
        "upsertLlmConnection",
        "deleteLlmConnection",
      ]),
    );
  });

  it("manages project connections through the shared service", async () => {
    const fixture = await createMcpTestSetup();
    const provider = `mcp-project-${randomUUID()}`;
    const secretKey = "sk-project-mcp-secret";

    const created = (await handleUpsertLlmConnection(
      {
        provider,
        adapter: LLMAdapter.OpenAI,
        secretKey,
        withDefaultModels: true,
      },
      fixture.context,
    )) as Record<string, unknown>;

    expect(created).not.toHaveProperty("secretKey");
    expect(JSON.stringify(created)).not.toContain(secretKey);

    const listed = (await handleListLlmConnections(
      { page: 1, limit: 50 },
      fixture.context,
    )) as { data: Array<{ id: string; provider: string }> };
    const connection = listed.data.find((item) => item.provider === provider);
    expect(connection).toBeDefined();

    await handleDeleteLlmConnection({ id: connection!.id }, fixture.context);
    expect(
      await prisma.llmApiKeys.findUnique({ where: { id: connection!.id } }),
    ).toBeNull();
  });

  it("requires update access before replacing a project connection", async () => {
    const fixture = await createMcpTestSetup();
    const provider = `mcp-project-auth-${randomUUID()}`;
    const previousMigration = (env as any).API_AUTH_MIGRATION;
    if (!fixture.context.auth) {
      throw new Error("Expected authorization context");
    }
    const restrictedContext: ServerContext = {
      ...fixture.context,
      auth: {
        ...fixture.context.auth,
        policies: fixture.context.auth.policies.map((policy) => ({
          ...policy,
          actions: policy.actions.filter(
            (action) => action !== "llmApiKeys:update",
          ),
        })),
      },
    };

    try {
      (env as any).API_AUTH_MIGRATION = "enforce";
      await handleUpsertLlmConnection(
        {
          provider,
          adapter: LLMAdapter.OpenAI,
          secretKey: "sk-project-original",
          withDefaultModels: true,
        },
        restrictedContext,
      );

      await expect(
        handleUpsertLlmConnection(
          {
            provider,
            adapter: LLMAdapter.OpenAI,
            secretKey: "sk-project-replacement",
            withDefaultModels: true,
          },
          restrictedContext,
        ),
      ).rejects.toThrow("Access forbidden");
    } finally {
      (env as any).API_AUTH_MIGRATION = previousMigration;
      await prisma.llmApiKeys.deleteMany({
        where: { projectId: fixture.projectId, provider },
      });
    }
  });
});
