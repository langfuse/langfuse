// PROTOTYPE(LFE-15038): the new org pipeline runs on every request — shadow
// stamps it on the span while the legacy gate decides, enforce gates alone
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { handleGetProjects } from "@/src/ee/features/admin-api/server/projects";
import {
  authorizeOrgRequest,
  authzMigrationMode,
} from "@/src/features/auth/policy/enforcement.organizations.prototype";

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

  // one method does legacy's single verify + the new path + the parity emit;
  // legacy still decides in shadow, the new decision acts in enforce
  const { authCheck, authz } = await authorizeOrgRequest({
    headers: req.headers,
    action: "projects:read",
    verify: () =>
      new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        req.headers.authorization,
      ),
  });

  let orgId: string;
  if (authzMigrationMode === "shadow") {
    // legacy gate, restored verbatim (dies with LFE-15033)
    if (!authCheck.validKey) {
      return res.status(401).json({
        error: authCheck.error,
      });
    }
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
    const rateLimitCheck =
      await RateLimitService.getInstance().rateLimitRequest(
        authCheck.scope,
        "public-api",
      );
    if (rateLimitCheck?.isRateLimited()) {
      return rateLimitCheck.sendRestResponseIfLimited(res);
    }
    orgId = authCheck.scope.orgId;
  } else {
    // one call: 401 on bad credential, 400 on missing/disagreeing org target,
    // 403 when no policy covers projects:read on the org
    if (!authz.success) {
      return res
        .status(authz.error.httpCode)
        .json({ error: authz.error.message });
    }
    if (
      !hasEntitlement({
        entitlement: "admin-api",
        context: authz.context,
        orgId: authz.orgId,
      })
    ) {
      return res.status(403).json({
        error: "This feature is not available on your current plan.",
      });
    }
    const rateLimitCheck =
      await RateLimitService.getInstance().rateLimitRequest({
        resource: "public-api",
        context: authz.context,
        orgId: authz.orgId,
      });
    if (rateLimitCheck?.isRateLimited()) {
      return rateLimitCheck.sendRestResponseIfLimited(res);
    }
    orgId = authz.orgId;
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
