import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import {
  handleGetMemberships,
  handleUpdateMembership,
} from "@/src/ee/features/admin-api/server/memberships";

import { type NextApiRequest, type NextApiResponse } from "next";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (!["GET", "PUT"].includes(req.method || "")) {
    logger.error(
      `Method not allowed for ${req.method} on /api/public/organizations/memberships`,
    );
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  // CHECK AUTH
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(req.headers.authorization);
  if (!authCheck.validKey) {
    return res.status(401).json({
      error: authCheck.error,
    });
  }
  // END CHECK AUTH

  // Check if using an organization API key
  if (
    authCheck.scope.accessLevel !== "organization" ||
    !authCheck.scope.orgId
  ) {
    return res.status(403).json({
      error:
        "Invalid API key. Organization-scoped API key required for this operation.",
    });
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

  // Route to the appropriate handler based on HTTP method
  try {
    switch (req.method) {
      case "GET":
        return handleGetMemberships(req, res, authCheck.scope.orgId);
      case "PUT":
        return handleUpdateMembership(req, res, authCheck.scope.orgId);
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
