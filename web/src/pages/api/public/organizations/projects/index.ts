// PROTOTYPE(LFE-15038): legacy accessLevel gate replaced by enforceOrgAuth
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { logger } from "@langfuse/shared/src/server";
import { BaseError } from "@langfuse/shared";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { handleGetProjects } from "@/src/ee/features/admin-api/server/projects";
import { enforceOrgAuth } from "@/src/features/auth/policy/apiAdapter.prototype";

import { type NextApiRequest, type NextApiResponse } from "next";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (req.method !== "GET") {
    logger.error(
      `Method not allowed for ${req.method} on /api/public/organizations/projects`,
    );
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  let orgId: string;
  let scope;
  try {
    // one call: 401 on bad credential, 400 on missing/disagreeing org target,
    // 404 outside the grant, 403 when no policy covers projects:read on the org
    ({ orgId, scope } = await enforceOrgAuth({
      headers: req.headers,
      action: "projects:read",
    }));
  } catch (error) {
    if (error instanceof BaseError) {
      return res.status(error.httpCode).json({ error: error.message });
    }
    throw error;
  }

  if (
    !hasEntitlementBasedOnPlan({
      plan: scope.plan,
      entitlement: "admin-api",
    })
  ) {
    return res.status(403).json({
      error: "This feature is not available on your current plan.",
    });
  }

  const rateLimitCheck = await RateLimitService.getInstance().rateLimitRequest(
    scope,
    "public-api",
  );
  if (rateLimitCheck?.isRateLimited()) {
    return rateLimitCheck.sendRestResponseIfLimited(res);
  }

  try {
    return handleGetProjects(req, res, orgId);
  } catch (error) {
    logger.error(
      `Error handling organization projects for ${req.method}`,
      error,
    );
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}
