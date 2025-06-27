import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { z } from "zod/v4";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";

export const validateQueryAndExtractId = (query: unknown): string | null => {
  const inputQuerySchema = z.object({
    organizationId: z.string(),
  });
  const validation = inputQuerySchema.safeParse(query);
  if (!validation.success) {
    return null;
  }
  return validation.data.organizationId;
};

export async function handleGetApiKeys(
  req: NextApiRequest,
  res: NextApiResponse,
  organizationId: string,
) {
  const apiKeys = await prisma.apiKey.findMany({
    where: {
      orgId: organizationId,
      scope: "ORGANIZATION",
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
  organizationId: string,
) {
  // Validate the request body
  const createApiKeySchema = z.object({
    note: z.string().optional(),
  });

  const validationResult = createApiKeySchema.safeParse(req.body);

  if (!validationResult.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: validationResult.error.format(),
    });
  }

  const { note } = validationResult.data;

  // Create the API key
  const apiKeyMeta = await createAndAddApiKeysToDb({
    prisma,
    entityId: organizationId,
    note,
    scope: "ORGANIZATION",
  });

  // Log the API key creation
  await auditLog({
    resourceType: "apiKey",
    resourceId: apiKeyMeta.id,
    action: "create",
    orgId: organizationId,
    orgRole: "ADMIN",
    apiKeyId: "ADMIN_KEY",
  });

  logger.info(
    `Created API key ${apiKeyMeta.id} for organization ${organizationId} via admin API`,
  );

  return res.status(201).json(apiKeyMeta);
}
