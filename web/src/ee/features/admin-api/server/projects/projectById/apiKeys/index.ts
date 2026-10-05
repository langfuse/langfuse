import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/server";
import { z } from "zod";
import { createApiKey } from "@langfuse/shared/src/server/auth/apiKeys";
import { ApiKeyId, ProjectId, SystemRoleId } from "@langfuse/shared/rbac";
import {
  projectApiKeyCreationSchema,
  apiKeyToResponse,
} from "@/src/ee/features/admin-api/server/apiKeys";

export const validateQueryAndExtractId = (query: unknown): string | null => {
  const inputQuerySchema = z.object({
    projectId: z.string(),
  });
  const validation = inputQuerySchema.safeParse(query);
  if (!validation.success) {
    return null;
  }
  return validation.data.projectId;
};

export async function handleGetApiKeys(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
) {
  const apiKeys = await prisma.apiKey.findMany({
    where: {
      projectId,
      scope: "PROJECT",
      isInAppAgentKey: false,
    },
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      lastUsedAt: true,
      note: true,
      publicKey: true,
      displaySecretKey: true,
      roleAssignments: { select: { systemRole: true } },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return res.status(200).json({ apiKeys: apiKeys.map(apiKeyToResponse) });
}

/** handleCreateApiKey provisions a project key and records its audit event. */
export async function handleCreateApiKey(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  orgId: string,
  createdByApiKeyId?: string,
) {
  const validationResult = projectApiKeyCreationSchema.safeParse(req.body);

  if (!validationResult.success) {
    return res.status(400).json({
      message: "Invalid request body",
      details: z.formatError(validationResult.error),
    });
  }

  const { name, note, expiresAt, role, publicKey, secretKey } =
    validationResult.data;

  // Validate predefined keys if provided
  if (publicKey || secretKey) {
    // Both keys must be provided together
    if (!publicKey || !secretKey) {
      return res.status(400).json({
        message:
          "Both publicKey and secretKey must be provided together when specifying predefined keys",
      });
    }

    // Validate key format
    if (!publicKey.startsWith("pk-lf-")) {
      return res.status(400).json({
        message: "publicKey must start with 'pk-lf-'",
      });
    }

    if (!secretKey.startsWith("sk-lf-")) {
      return res.status(400).json({
        message: "secretKey must start with 'sk-lf-'",
      });
    }
  }

  if (!createdByApiKeyId) {
    return res.status(400).json({
      message: "Missing authenticating API key",
    });
  }

  try {
    // Create the API key
    const apiKeyMeta = await createApiKey(prisma, {
      owner: ProjectId(projectId),
      role: SystemRoleId(role),
      createdBy: ApiKeyId(createdByApiKeyId),
      name,
      note,
      expiresAt,
      predefinedKeys:
        publicKey && secretKey ? { publicKey, secretKey } : undefined,
    });

    // Log the API key creation
    await auditLog({
      resourceType: "apiKey",
      resourceId: apiKeyMeta.id,
      action: "create",
      orgId: orgId,
      projectId: projectId,
      orgRole: "ADMIN",
      apiKeyId: "ORG_KEY",
    });

    logger.info(
      `Created API key ${apiKeyMeta.id} for project ${projectId} via public API`,
    );

    return res.status(201).json({
      ...apiKeyMeta,
      name: apiKeyMeta.note,
      expiresAt: expiresAt ?? null,
      role,
    });
  } catch (error) {
    // Handle database unique constraint violations
    if (
      error instanceof Error &&
      (error.message.includes("Unique constraint") ||
        error.message.includes("unique constraint"))
    ) {
      return res.status(409).json({
        message:
          "API key with the provided publicKey or secretKey already exists",
      });
    }
    throw error;
  }
}
