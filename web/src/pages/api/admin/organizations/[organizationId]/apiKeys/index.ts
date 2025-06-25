import { type NextApiRequest, type NextApiResponse } from "next";
import { logger } from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/ee/features/admin-api/server/adminApiAuth";
import {
  validateQueryAndExtractId,
  handleGetApiKeys,
  handleCreateApiKey,
} from "@/src/ee/features/admin-api/server/organizations/apiKeys";
import { prisma } from "@langfuse/shared/src/db";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { getSelfHostedInstancePlanServerSide } from "@/src/features/entitlements/server/getPlan";

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

    if (
      !hasEntitlementBasedOnPlan({
        plan: getSelfHostedInstancePlanServerSide(),
        entitlement: "admin-api",
      })
    ) {
      return res.status(403).json({
        error: "This feature is not available on your current plan.",
      });
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
        return await handleGetApiKeys(req, res, organizationId);
      case "POST":
        return await handleCreateApiKey(req, res, organizationId);
      default:
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }
  } catch (e) {
    logger.error("Failed to process organization API key request", e);
    res.status(500).json({ error: "Internal server error" });
  }
}
