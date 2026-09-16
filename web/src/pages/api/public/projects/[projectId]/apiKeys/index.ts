import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import {
  validateQueryAndExtractId,
  handleGetApiKeys,
  handleCreateApiKey,
} from "@/src/ee/features/admin-api/server/projects/projectById/apiKeys";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { shadowAuth } from "@/src/features/public-api/server/shadowAuth";
import { writeProjectError } from "@/src/features/public-api/server/writeError";

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

    const authCheck = await shadowAuth({
      req,
      action: req.method === "GET" ? "apiKeys:read" : "apiKeys:CUD",
      allowedAccessLevels: ["organization"],
    });
    if (!authCheck.success) {
      return writeProjectError(res, authCheck.error);
    }

    const projectId = validateQueryAndExtractId(req.query);
    if (!projectId) {
      return res.status(400).json({ message: "Invalid project ID" });
    }

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
        return await handleGetApiKeys(req, res, projectId);
      case "POST":
        return await handleCreateApiKey(
          req,
          res,
          projectId,
          authCheck.scope.orgId,
          authCheck.scope.apiKeyId,
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
