import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";

const validateQueryParams = (
  query: unknown,
): { projectId: string; apiKeyId: string } | null => {
  const inputQuerySchema = z.object({
    projectId: z.string(),
    apiKeyId: z.string(),
  });
  const validation = inputQuerySchema.safeParse(query);
  if (!validation.success) {
    return null;
  }
  return validation.data;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  try {
    if (req.method !== "DELETE") {
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

    const params = validateQueryParams(req.query);
    if (!params) {
      return res.status(400).json({ message: "Invalid request parameters" });
    }

    const { projectId, apiKeyId } = params;

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
      case "DELETE":
        return await handleDelete(
          req,
          res,
          projectId,
          apiKeyId,
          authCheck.scope.orgId,
        );
      default:
        res.status(405).json({ message: "Method Not Allowed" });
        return;
    }
  } catch (e) {
    logger.error("Failed to process project API key request", e);
    res.status(500).json({ message: "Internal server error" });
  }
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  projectId: string,
  apiKeyId: string,
  orgId: string,
) {
  // Check if API key exists and belongs to the project
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      id: apiKeyId,
      projectId,
      scope: "PROJECT",
    },
  });

  if (!apiKey) {
    return res.status(404).json({ message: "API key not found" });
  }

  // Delete the API key
  const deleted = await new ApiAuthService(prisma, redis).deleteApiKey(
    apiKeyId,
    projectId,
    "PROJECT",
  );

  if (!deleted) {
    return res.status(500).json({ message: "Failed to delete API key" });
  }

  // Log the API key deletion
  await auditLog({
    resourceType: "apiKey",
    resourceId: apiKeyId,
    action: "delete",
    orgId: orgId,
    projectId: projectId,
    orgRole: "ADMIN",
    apiKeyId: "ORG_KEY",
  });

  logger.info(
    `Deleted API key ${apiKeyId} for project ${projectId} via public API`,
  );

  return res.status(200).json({ success: true });
}
