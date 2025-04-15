import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/features/admin-api/server/adminApiAuth";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { z } from "zod";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";

const validateQueryAndExtractId = (query: unknown): string | null => {
  const inputQuerySchema = z.object({
    organizationId: z.string(),
  });
  const validation = inputQuerySchema.safeParse(query);
  if (!validation.success) {
    return null;
  }
  return validation.data.organizationId;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "POST" && req.method !== "GET") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    // Verify admin API authentication, but allow non-langfuse cloud use-cases
    if (!AdminApiAuthService.handleAdminAuth(req, res, false)) {
      return;
    }

    const organizationId = validateQueryAndExtractId(req.query);
    if (!organizationId) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Handle different HTTP methods
    switch (req.method) {
      case "GET":
        return await handleGet(req, res, organizationId);
      case "POST":
        return await handlePost(req, res, organizationId);
      default:
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }
  } catch (e) {
    logger.error("Failed to process organization API key request", e);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function handleGet(
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

async function handlePost(
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
