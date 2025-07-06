import { type NextApiRequest, type NextApiResponse } from "next";
import { logger } from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/ee/features/admin-api/server/adminApiAuth";
import {
  validateQueryParams,
  handleDeleteApiKey,
} from "@/src/ee/features/admin-api/server/organizations/apiKeys/apiKeyById";
import { prisma } from "@langfuse/shared/src/db";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { getSelfHostedInstancePlanServerSide } from "@/src/features/entitlements/server/getPlan";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "DELETE") {
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

    const params = validateQueryParams(req.query);
    if (!params) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }

    const { organizationId, apiKeyId } = params;

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Handle different HTTP methods
    switch (req.method) {
      case "DELETE":
        return await handleDeleteApiKey(req, res, organizationId, apiKeyId);
      default:
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }
  } catch (e) {
    logger.error("Failed to process organization API key request", e);
    res.status(500).json({ error: "Internal server error" });
  }
}
