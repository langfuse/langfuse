import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";

const validateQueryAndExtractId = (query: unknown): string | null => {
  const inputQuerySchema = z.object({
    projectId: z.string(),
  });
  const validation = inputQuerySchema.safeParse(query);
  if (!validation.success) {
    return null;
  }
  return validation.data.projectId;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  try {
    if (req.method !== "POST" && req.method !== "GET") {
      res.status(405).json({ message: "Method Not Allowed" });
      return;
    }

    // CHECK AUTH
    const authCheck = await new ApiAuthService(
      prisma,
      redis,
    ).verifyAuthHeaderAndReturnScope(req.headers.authorization);
    if (!authCheck.validKey) {
      return res.status(401).json({
        message: authCheck.error,
      });
    }

    // Check if using an organization API key
    if (
      authCheck.scope.accessLevel !== "organization" ||
      !authCheck.scope.orgId
    ) {
      return res.status(403).json({
        message:
          "Invalid API key. Organization-scoped API key required for this operation.",
      });
    }
    // END CHECK AUTH

    const projectId = validateQueryAndExtractId(req.query);
    if (!projectId) {
      return res.status(400).json({ message: "Invalid project ID" });
    }

    // Check if project exists and belongs to the organization
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        orgId: authCheck.scope.orgId,
      },
    });

    if (!project) {
      return res
        .status(404)
        .json({ message: "Project not found or you don't have access to it" });
    }

    // Handle different HTTP methods
    switch (req.method) {
      case "GET":
        return await handleGet(req, res, projectId);
      case "POST":
        return await handlePost(req, res, projectId, authCheck.scope.orgId);
      default:
        res.status(405).json({ message: "Method Not Allowed" });
        return;
    }
  } catch (e) {
    logger.error("Failed to process project API key request", e);
    res.status(500).json({ message: "Internal server error" });
  }
}

async function handleGet(
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

async function handlePost(
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
