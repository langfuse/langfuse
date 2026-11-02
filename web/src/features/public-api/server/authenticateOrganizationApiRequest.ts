import type { NextApiRequest, NextApiResponse } from "next";
import type { Action } from "@langfuse/shared/rbac";

import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server";
import { RateLimitService } from "./RateLimitService";
import { shadowAuth } from "./shadowAuth";
import { writeOrgError } from "./writeError";

export async function authenticateOrganizationApiRequest(
  req: NextApiRequest,
  res: NextApiResponse,
  action: Action,
) {
  const auth = await shadowAuth({
    req,
    action,
    allowedAccessLevels: ["organization"],
  });
  if (!auth.success) {
    writeOrgError(res, auth.error);
    return null;
  }

  if (
    !hasEntitlementBasedOnPlan({
      plan: auth.scope.plan,
      entitlement: "admin-api",
    })
  ) {
    res.status(403).json({
      error: "This feature is not available on your current plan.",
    });
    return null;
  }

  const rateLimit = await RateLimitService.getInstance().rateLimitRequest(
    auth.scope,
    "public-api",
  );
  if (rateLimit?.isRateLimited()) {
    rateLimit.sendRestResponseIfLimited(res);
    return null;
  }

  return auth.scope;
}
