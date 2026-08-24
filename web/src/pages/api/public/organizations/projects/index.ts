// PROTOTYPE(LFE-15038): legacy accessLevel gate replaced by enforceOrgAuth
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { logger } from "@langfuse/shared/src/server";
import { handleGetProjects } from "@/src/ee/features/admin-api/server/projects";
import { enforceOrgAuth } from "@/src/features/auth/policy/apiAdapter.organizations.prototype";
import { coveringOrg } from "@/src/features/auth/policy/enforce.prototype";

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

  // one call: 401 on bad credential, 400 on missing/disagreeing org target,
  // 404 outside the grant, 403 when no policy covers projects:read on the org
  const result = await enforceOrgAuth({
    headers: req.headers,
    action: "projects:read",
  });
  if (!result.success) {
    return res
      .status(result.error.httpCode)
      .json({ error: result.error.message });
  }
  const { orgId, context } = result;

  // the covering PrincipalOrganization carries plan and rateLimitConfig; rate
  // limiting rejoins here once RateLimitService's input narrows to that shape
  if (
    !hasEntitlementBasedOnPlan({
      plan: coveringOrg(context, { orgId })?.plan ?? "oss",
      entitlement: "admin-api",
    })
  ) {
    return res.status(403).json({
      error: "This feature is not available on your current plan.",
    });
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
