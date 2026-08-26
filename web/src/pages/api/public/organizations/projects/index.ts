import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { logger } from "@langfuse/shared/src/server";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { handleGetProjects } from "@/src/ee/features/admin-api/server/projects";
// PROTOTYPE(LFE-15559): the drop-in does legacy's verify + the new path + the
// parity emit, then throws or returns the verified scope like the route's verify
import { verifyOrgAuth } from "@/src/features/auth/policy/shadow.organizations.prototype";

import { type NextApiRequest, type NextApiResponse } from "next";
import {
  hasEntitlement,
  hasEntitlementBasedOnPlan,
} from "@/src/features/entitlements/server/hasEntitlement";

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

  let auth: Awaited<ReturnType<typeof verifyOrgAuth>>;
  try {
    auth = await verifyOrgAuth({ req, action: "projects:read" });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 401;
    const message =
      (error as { message?: string }).message ?? "Authentication failed";
    return res.status(status).json({ error: message });
  }

  // shadow returns the legacy scope; enforce returns the new context + orgId.
  // The `admin-api` entitlement 403 stays outside the parity matrices.
  let orgId: string;
  if ("scope" in auth) {
    if (
      !hasEntitlementBasedOnPlan({
        plan: auth.scope.plan,
        entitlement: "admin-api",
      })
    ) {
      return res.status(403).json({
        error: "This feature is not available on your current plan.",
      });
    }
    const rateLimitCheck =
      await RateLimitService.getInstance().rateLimitRequest(
        auth.scope,
        "public-api",
      );
    if (rateLimitCheck?.isRateLimited()) {
      return rateLimitCheck.sendRestResponseIfLimited(res);
    }
    orgId = auth.scope.orgId;
  } else {
    if (
      !hasEntitlement({
        entitlement: "admin-api",
        context: auth.context,
        orgId: auth.orgId,
      })
    ) {
      return res.status(403).json({
        error: "This feature is not available on your current plan.",
      });
    }
    const rateLimitCheck =
      await RateLimitService.getInstance().rateLimitRequest({
        resource: "public-api",
        context: auth.context,
        orgId: auth.orgId,
      });
    if (rateLimitCheck?.isRateLimited()) {
      return rateLimitCheck.sendRestResponseIfLimited(res);
    }
    orgId = auth.orgId;
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
