import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { z } from "zod/v4";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";

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
    },
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      lastUsedAt: true,
      note: true,
      publicKey: true,
      displaySecretKey: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return res.status(200).json({ apiKeys });
}

export async function handleCreateApiKey(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  orgId: string,
) {
  // Validate the request body
  const createApiKeySchema = z.object({
    note: z.string().optional(),
  });

  const validationResult = createApiKeySchema.safeParse(req.body);

  if (!validationResult.success) {
    return res.status(400).json({
      message: "Invalid request body",
      details: validationResult.error.format(),
    });
  }

  const { note } = validationResult.data;

  // Create the API key
  const apiKeyMeta = await createAndAddApiKeysToDb({
    prisma,
    entityId: projectId,
    note,
    scope: "PROJECT",
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

  return res.status(201).json(apiKeyMeta);
}
