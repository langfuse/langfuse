import { randomUUID } from "node:crypto";

import { LLMAdapter } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  createApiKey,
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";

import { createMcpTestSetup } from "@/src/__tests__/server/mcp-helpers";
import { env } from "@/src/env.mjs";
import type {
  OrganizationServerContext,
  ProjectServerContext,
} from "@/src/features/mcp/types";
import { authenticator } from "@/src/features/apiKey/server";
import "@/src/features/mcp/server/bootstrap";
import {
  handleDeleteLlmConnection,
  handleDeleteOrganizationLlmConnection,
  handleListLlmConnections,
  handleListOrganizationLlmConnections,
  handleUpsertLlmConnection,
  handleUpsertOrganizationLlmConnection,
  upsertLlmConnectionTool,
} from "@/src/features/mcp/server/llmConnections/tools";
import { toolRegistry } from "@/src/features/mcp/server/registry";

async function createOrganizationContext(): Promise<{
  orgId: string;
  context: OrganizationServerContext;
}> {
  const fixture = await createOrgProjectAndApiKey({ plan: "Team" });
  const creator = await prisma.user.create({
    data: { email: `mcp-org-llm-${randomUUID()}@example.com` },
  });
  const apiKey = await createApiKey(prisma, {
    owner: OrganizationId(fixture.orgId),
    role: SystemRoleId("LEGACY_ORGANIZATION_API_KEY"),
    createdBy: UserId(creator.id),
  });
  const authenticated = await authenticator.authenticate({
    headers: {
      authorization: createBasicAuthHeader(apiKey.publicKey, apiKey.secretKey),
    },
  });
  if (!authenticated.success) {
    throw authenticated.error;
  }

  return {
    orgId: fixture.orgId,
    context: {
      orgId: fixture.orgId,
      apiKeyId: apiKey.id,
      accessLevel: "organization",
      publicKey: apiKey.publicKey,
      plan: "cloud:team",
      rateLimitOverrides: [],
      auth: authenticated.context,
    },
  };
}

describe("MCP LLM connection tools", () => {
  it("requires create access before checking update access for replacements", () => {
    expect(upsertLlmConnectionTool.action).toBe("llmApiKeys:create");
  });

  it("only advertises tools matching the API key scope", async () => {
    const project = await createMcpTestSetup();
    const organization = await createOrganizationContext();

    const projectTools = (
      await toolRegistry.getToolDefinitions(project.context)
    ).map((tool) => tool.name);
    const organizationTools = (
      await toolRegistry.getToolDefinitions(organization.context)
    ).map((tool) => tool.name);

    expect(projectTools).toEqual(
      expect.arrayContaining([
        "listLlmConnections",
        "upsertLlmConnection",
        "deleteLlmConnection",
      ]),
    );
    expect(projectTools).not.toContain("listOrganizationLlmConnections");
    expect(organizationTools).toEqual([
      "listOrganizationLlmConnections",
      "upsertOrganizationLlmConnection",
      "deleteOrganizationLlmConnection",
    ]);
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
    const restrictedContext: ProjectServerContext = {
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

  it("manages organization connections through the shared service", async () => {
    const fixture = await createOrganizationContext();
    const provider = `mcp-organization-${randomUUID()}`;
    const secretKey = "sk-organization-mcp-secret";

    const created = (await handleUpsertOrganizationLlmConnection(
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

    const listed = (await handleListOrganizationLlmConnections(
      { page: 1, limit: 50 },
      fixture.context,
    )) as { data: Array<{ id: string; provider: string }> };
    const connection = listed.data.find((item) => item.provider === provider);
    expect(connection).toBeDefined();

    await handleDeleteOrganizationLlmConnection(
      { id: connection!.id },
      fixture.context,
    );
    expect(
      await prisma.llmApiKeys.findUnique({ where: { id: connection!.id } }),
    ).toBeNull();
  });

  it("handles concurrent organization upserts without a unique constraint error", async () => {
    const fixture = await createOrganizationContext();
    const provider = `mcp-organization-concurrent-${randomUUID()}`;

    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        handleUpsertOrganizationLlmConnection(
          {
            provider,
            adapter: LLMAdapter.OpenAI,
            secretKey: `sk-organization-mcp-secret-${index}`,
            withDefaultModels: true,
          },
          fixture.context,
        ),
      ),
    );

    expect(
      await prisma.llmApiKeys.count({
        where: { organizationId: fixture.orgId, provider },
      }),
    ).toBe(1);
  });
});
