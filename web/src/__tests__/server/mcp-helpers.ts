/**
 * MCP Test Helpers
 *
 * Shared utilities for testing MCP server tools.
 * These helpers allow direct testing of tool handlers without HTTP overhead.
 */

import { randomUUID } from "crypto";
import { prisma, type Role } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";
import type { ServerContext } from "@/src/features/mcp/types";

/**
 * Creates a complete MCP test setup including:
 * - Organization
 * - Project
 * - API key
 * - ServerContext for MCP tool handlers
 */
export async function createMcpTestSetup(): Promise<{
  projectId: string;
  orgId: string;
  apiKeyId: string;
  auth: string;
  context: ServerContext;
}> {
  const result = await createOrgProjectAndApiKey();
  const { projectId, orgId, auth } = result;

  // Extract apiKeyId from created API key
  const apiKey = await prisma.apiKey.findFirst({
    where: { projectId, publicKey: result.publicKey },
    select: { id: true },
  });

  if (!apiKey) {
    throw new Error("Failed to create API key for test setup");
  }

  const context: ServerContext = {
    projectId,
    orgId,
    apiKeyId: apiKey.id,
    accessLevel: "project",
    publicKey: result.publicKey,
    plan: "oss",
    rateLimitOverrides: [],
  };

  return {
    projectId,
    orgId,
    apiKeyId: apiKey.id,
    auth,
    context,
  };
}

/**
 * Creates a user with an org membership of the given role. Project role is
 * inherited from the org membership unless a project override is added later.
 */
export async function createUserWithOrgRole(params: {
  orgId: string;
  role: Role;
}): Promise<{ userId: string }> {
  const user = await prisma.user.create({
    data: {
      email: `mcp-rbac-${randomUUID()}@langfuse.com`,
      name: `MCP ${params.role} user`,
    },
  });

  await prisma.organizationMembership.create({
    data: {
      orgId: params.orgId,
      userId: user.id,
      role: params.role,
    },
  });

  return { userId: user.id };
}

/**
 * Mints a project API key with isInAppAgentKey + createdByUserId, matching
 * the temporary keys the in-app agent runtime issues for MCP.
 */
export async function createInAppAgentMcpContext(params: {
  projectId: string;
  orgId: string;
  createdByUserId?: string;
}): Promise<{ apiKeyId: string; context: ServerContext }> {
  const apiKey = await createAndAddApiKeysToDb({
    prisma,
    entityId: params.projectId,
    scope: "PROJECT",
    note: "In-app agent MCP session",
    isInAppAgentKey: true,
    createdByUserId: params.createdByUserId,
  });

  return {
    apiKeyId: apiKey.id,
    context: {
      projectId: params.projectId,
      orgId: params.orgId,
      apiKeyId: apiKey.id,
      accessLevel: "project",
      publicKey: apiKey.publicKey,
      plan: "oss",
      rateLimitOverrides: [],
    },
  };
}

export async function protectPromptLabel(params: {
  projectId: string;
  label: string;
}): Promise<void> {
  await prisma.promptProtectedLabels.create({
    data: {
      projectId: params.projectId,
      label: params.label,
    },
  });
}

/**
 * Creates a mock ServerContext for testing.
 * Use this when you need a context but don't want to create actual DB records.
 */
export function mockServerContext(
  overrides?: Partial<ServerContext>,
): ServerContext {
  return {
    projectId: overrides?.projectId ?? "test-project-id",
    orgId: overrides?.orgId ?? "test-org-id",
    apiKeyId: overrides?.apiKeyId ?? "test-api-key-id",
    accessLevel: "project",
    publicKey: overrides?.publicKey ?? "pk-lf-test",
    plan: overrides?.plan ?? "oss",
    rateLimitOverrides: overrides?.rateLimitOverrides ?? [],
    ...overrides,
  };
}

export const mcpEvalOutputDefinition = {
  dataType: "NUMERIC" as const,
  reasoning: { description: "Why the score was assigned" },
  score: { description: "A score between 0 and 1" },
};

/**
 * Verifies that an audit log entry was created for an MCP operation.
 * Returns the audit log entry for further assertions.
 */
export async function verifyAuditLog(params: {
  projectId: string;
  resourceType: string;
  resourceId?: string;
  action: "create" | "update" | "delete";
  apiKeyId: string;
}): Promise<{
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  before: unknown;
  after: unknown;
}> {
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      projectId: params.projectId,
      resourceType: params.resourceType,
      action: params.action,
      apiKeyId: params.apiKeyId,
      ...(params.resourceId && { resourceId: params.resourceId }),
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 1,
  });

  if (auditLogs.length === 0) {
    throw new Error(
      `No audit log found for ${params.action} ${params.resourceType} in project ${params.projectId}`,
    );
  }

  const log = auditLogs[0];

  return {
    id: log.id,
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    before: log.before,
    after: log.after,
  };
}

/**
 * Creates a prompt directly in the database for testing.
 * Similar to the helper in prompts.v2.servertest.ts.
 */
export async function createPromptInDb(params: {
  name: string;
  prompt: string | unknown; // Can be string (text) or array (chat messages)
  projectId: string;
  labels?: string[];
  version?: number;
  config?: Record<string, unknown>;
  tags?: string[];
  type?: "text" | "chat";
  createdBy?: string;
}) {
  return await prisma.prompt.create({
    data: {
      name: params.name,

      prompt: params.prompt as any, // Prisma's JsonValue type - can be string or object
      labels: params.labels ?? [],
      version: params.version ?? 1,

      config: (params.config ?? {}) as any, // Prisma's JsonValue type - safe because we control the input
      tags: params.tags ?? [],
      type: params.type ?? "text",
      createdBy: params.createdBy ?? "test-user",
      project: {
        connect: { id: params.projectId },
      },
    },
  });
}

/**
 * Helper to check if a tool has the correct MCP annotations.
 */
export function verifyToolAnnotations(
  toolDefinition: { annotations?: Record<string, boolean> },
  expectedAnnotations: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    expensiveHint?: boolean;
  },
): void {
  const annotations = toolDefinition.annotations ?? {};

  if (expectedAnnotations.readOnlyHint !== undefined) {
    expect(annotations.readOnlyHint).toBe(expectedAnnotations.readOnlyHint);
  }

  if (expectedAnnotations.destructiveHint !== undefined) {
    expect(annotations.destructiveHint).toBe(
      expectedAnnotations.destructiveHint,
    );
  }

  if (expectedAnnotations.expensiveHint !== undefined) {
    expect(annotations.expensiveHint).toBe(expectedAnnotations.expensiveHint);
  }
}

/**
 * Waits for a condition to be true with timeout.
 * Useful for async operations that need eventual consistency.
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}
