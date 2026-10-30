import { type NextApiRequest, type NextApiResponse } from "next";

import {
  handleDeleteMembership,
  handleGetMemberships,
  handleUpdateMembership,
} from "@/src/ee/features/admin-api/server/memberships";
import { authenticator } from "@/src/features/apiKey/server";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server";
import { shadowAuth, writeOrgError } from "@/src/features/public-api/server";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { BaseError } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";

/** handler serves organization memberships for authenticated API keys. */
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
  const authCheck = await shadowAuth({
    req,
    action:
      req.method === "GET"
        ? "organizationMembers:read"
        : "organizationMembers:CUD",
    allowedAccessLevels: ["organization"],
  });
  if (!authCheck.success) {
    return writeOrgError(res, authCheck.error);
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
    if (req.method === "GET") {
      return await handleGetMemberships(req, res, authCheck.scope.orgId);
    }
    let context = authCheck.ctx;
    if (!context) {
      const authentication = await authenticator.authenticate({
        headers: req.headers,
      });
      if (!authentication.success)
        return writeOrgError(res, authentication.error);
      context = authentication.context;
    }
    switch (req.method) {
      case "PUT":
        return await handleUpdateMembership(
          req,
          res,
          authCheck.scope.orgId,
          authCheck.scope.apiKeyId,
          context,
        );
      case "DELETE":
        return await handleDeleteMembership(
          req,
          res,
          authCheck.scope.orgId,
          authCheck.scope.apiKeyId,
          context,
        );
      default:
        // This should never happen due to the check at the beginning
        return res.status(405).json({
          error: "Method not allowed",
        });
    }
  } catch (error) {
    if (error instanceof BaseError) {
      return res.status(error.httpCode).json({ error: error.message });
    }
    logger.error(
      `Error handling organization memberships for ${req.method}`,
      error,
    );
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}
