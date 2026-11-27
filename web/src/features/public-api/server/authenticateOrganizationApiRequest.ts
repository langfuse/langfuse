import type { NextApiRequest, NextApiResponse } from "next";
import type { Action } from "@langfuse/shared/rbac";

import { hasEntitlementBasedOnPlan } from "@langfuse/shared";
import { RateLimitService } from "./RateLimitService";
import { shadowAuth } from "./shadowAuth";
import {
  createStructuredPublicApiAuthError,
  type PublicApiErrorContract,
  sendStructuredPublicApiErrorResponse,
  structuredPublicApiErrorContract,
} from "./structuredPublicApiErrorContract";
import { writeOrgError } from "./writeError";

const PLAN_NOT_ENTITLED_MESSAGE =
  "This feature is not available on your current plan.";

/**
 * Authorizes an organization API key for `action`, checks the plan's
 * `admin-api` entitlement and the `public-api` rate limit. On failure it
 * writes the error response and returns null. Errors use the organization
 * envelope (`{ error }`), or the structured envelope of the unstable API when
 * `errorContract` asks for it.
 */
export async function authenticateOrganizationApiRequest(
  req: NextApiRequest,
  res: NextApiResponse,
  action: Action,
  options?: { errorContract?: PublicApiErrorContract },
) {
  const structured =
    options?.errorContract === structuredPublicApiErrorContract;
  const writeError = (statusCode: number, message: string) =>
    sendStructuredPublicApiErrorResponse(
      res,
      createStructuredPublicApiAuthError({ statusCode, message }),
    );

  const auth = await shadowAuth({
    req,
    action,
    allowedAccessLevels: ["organization"],
  });
  if (!auth.success) {
    if (structured) writeError(auth.error.httpCode, auth.error.message);
    else writeOrgError(res, auth.error);
    return null;
  }

  if (
    !hasEntitlementBasedOnPlan({
      plan: auth.scope.plan,
      entitlement: "admin-api",
    })
  ) {
    if (structured) writeError(403, PLAN_NOT_ENTITLED_MESSAGE);
    else res.status(403).json({ error: PLAN_NOT_ENTITLED_MESSAGE });
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
