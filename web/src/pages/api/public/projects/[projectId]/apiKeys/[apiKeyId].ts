import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import {
  validateQueryParams,
  handleDeleteApiKey,
} from "@/src/ee/features/admin-api/server/projects/projectById/apiKeys/apiKeyById";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";

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

    if (
      !hasEntitlementBasedOnPlan({
        plan: authCheck.scope.plan,
        entitlement: "admin-api",
      })
    ) {
      return res.status(403).json({
        error: "This feature is not available on your current plan.",
      });
    }

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
        return await handleDeleteApiKey(
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
