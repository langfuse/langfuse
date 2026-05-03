/**
 * MCP Test Helpers
 *
 * Shared utilities for testing MCP server tools.
 * These helpers allow direct testing of tool handlers without HTTP overhead.
 */

import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
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
    ...overrides,
  };
}

/**
 * Verifies that a response follows the MCP content block format.
 * MCP tools return { content: [{ type: "text", text: "..." }] }
 */
export function verifyMcpResponseFormat(
  response: unknown,
): asserts response is {
  content: Array<{ type: "text"; text: string }>;
} {
  if (!response || typeof response !== "object") {
    throw new Error("Response must be an object");
  }

  const resp = response as Record<string, unknown>;

  if (!Array.isArray(resp.content)) {
    throw new Error("Response must have 'content' array");
  }

  if (resp.content.length === 0) {
    throw new Error("Response content array must not be empty");
  }

  for (const block of resp.content) {
    if (typeof block !== "object" || block === null) {
      throw new Error("Each content block must be an object");
    }

    const blockTyped = block as Record<string, unknown>;

    if (blockTyped.type !== "text") {
      throw new Error(
        `Content block type must be 'text', got: ${blockTyped.type}`,
      );
    }

    if (typeof blockTyped.text !== "string") {
      throw new Error("Content block text must be a string");
    }
  }
}

/**
 * Extracts the text content from an MCP tool response.
 * Assumes the response has been validated with verifyMcpResponseFormat.
 */
export function extractMcpResponseText(response: {
  content: Array<{ type: "text"; text: string }>;
}): string {
  return response.content.map((block) => block.text).join("");
}

/**
 * Parses JSON from an MCP tool response text.
 * Handles the common case where tool responses are JSON strings.
 */
export function parseMcpResponseJson<T = unknown>(response: {
  content: Array<{ type: "text"; text: string }>;
}): T {
  const text = extractMcpResponseText(response);
  return JSON.parse(text) as T;
}

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
 * Deletes all prompts for a specific project.
 * Useful for cleanup in tests.
 */
export async function cleanupProjectPrompts(projectId: string): Promise<void> {
  await prisma.prompt.deleteMany({
    where: { projectId },
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
  timeoutMs: number = 5000,
  intervalMs: number = 100,
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
