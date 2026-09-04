import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { logger } from "@langfuse/shared/src/server";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import {
  handleGetMemberships,
  handleUpdateMembership,
  handleDeleteMembership,
} from "@/src/ee/features/admin-api/server/memberships";
import { verifyOrgAuth } from "@/src/features/auth/policy/shadow.direct";

import { type NextApiRequest, type NextApiResponse } from "next";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";

/** orgKeyRequired is the 403 body when a non-organization key hits an organization endpoint. */
const orgKeyRequired =
  "Invalid API key. Organization-scoped API key required for this operation.";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (!["GET", "PUT", "DELETE"].includes(req.method || "")) {
    logger.error(
      `Method not allowed for ${req.method} on /api/public/organizations/memberships`,
    );
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  // CHECK AUTH
  const authCheck = await verifyOrgAuth({
    req,
    name: "Manage Organization Memberships",
    action: "projects:read",
    scopeDeniedMessage: orgKeyRequired,
  });
  if (!authCheck.validKey) {
    return res.status(authCheck.status).json({
      error: authCheck.error,
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

  const rateLimitCheck = await RateLimitService.getInstance().rateLimitRequest(
    authCheck.scope,
    "public-api",
  );
  if (rateLimitCheck?.isRateLimited()) {
    return rateLimitCheck.sendRestResponseIfLimited(res);
  }

  // Route to the appropriate handler based on HTTP method
  try {
    switch (req.method) {
      case "GET":
        return handleGetMemberships(req, res, authCheck.scope.orgId);
      case "PUT":
        return handleUpdateMembership(req, res, authCheck.scope.orgId);
      case "DELETE":
        return handleDeleteMembership(req, res, authCheck.scope.orgId);
      default:
        // This should never happen due to the check at the beginning
        return res.status(405).json({
          error: "Method not allowed",
        });
    }
  } catch (error) {
    logger.error(
      `Error handling organization memberships for ${req.method}`,
      error,
    );
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}
