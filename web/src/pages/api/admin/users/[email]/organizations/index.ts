import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { logger } from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/ee/features/admin-api/server/adminApiAuth";
import { handleGetUserOrganizations } from "@/src/ee/features/admin-api/server/users/organizations";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { getSelfHostedInstancePlanServerSide } from "@/src/features/entitlements/server/getPlan";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    // Verify admin API authentication, only allow on self-hosted (not on Langfuse Cloud)
    if (!AdminApiAuthService.handleAdminAuth(req, res)) {
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

    const validatedEmail = z.email().safeParse(req.query.email);
    if (!validatedEmail.success) {
      return res.status(400).json({ error: "Invalid email" });
    }

    return await handleGetUserOrganizations(req, res, validatedEmail.data);
  } catch (e) {
    logger.error("Failed to process user organizations request", e);
    res.status(500).json({ error: "Internal server error" });
  }
}
