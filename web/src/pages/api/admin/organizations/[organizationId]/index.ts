import { type NextApiRequest, type NextApiResponse } from "next";
import { logger } from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/ee/features/admin-api/server/adminApiAuth";
import {
  handleGetOrganizationById,
  handleUpdateOrganization,
  handleDeleteOrganization,
} from "@/src/ee/features/admin-api/server/organizations/organizationById";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { getSelfHostedInstancePlanServerSide } from "@/src/features/entitlements/server/getPlan";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
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

    // Handle different HTTP methods
    switch (req.method) {
      case "GET":
        return await handleGetOrganizationById(req, res);
      case "PUT":
        return await handleUpdateOrganization(req, res);
      case "DELETE":
        return await handleDeleteOrganization(req, res);
      default:
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }
  } catch (e) {
    logger.error("Failed to process organization request", e);
    res.status(500).json({ error: "Internal server error" });
  }
}
