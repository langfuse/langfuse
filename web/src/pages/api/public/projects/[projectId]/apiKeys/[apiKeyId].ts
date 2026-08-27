import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import {
  validateQueryParams,
  handleDeleteApiKey,
} from "@/src/ee/features/admin-api/server/projects/projectById/apiKeys/apiKeyById";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { verifyOrgAuth } from "@/src/features/auth/policy/shadow.direct";

/** orgKeyRequired is the 403 body when a non-organization key hits an organization endpoint. */
const orgKeyRequired =
  "Invalid API key. Organization-scoped API key required for this operation.";

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
    const authCheck = await verifyOrgAuth({
      req,
      name: "Delete Project API Key",
      action: "projects:read",
      scopeDeniedMessage: orgKeyRequired,
    });
    if (!authCheck.validKey) {
      return res.status(authCheck.status).json({
        message: authCheck.error,
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

    const rateLimitCheck =
      await RateLimitService.getInstance().rateLimitRequest(
        authCheck.scope,
        "public-api",
      );
    if (rateLimitCheck?.isRateLimited()) {
      return rateLimitCheck.sendRestResponseIfLimited(res);
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
