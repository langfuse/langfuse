import { type IncomingHttpHeaders } from "http";

import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { handleGetProjects } from "@/src/ee/features/admin-api/server/projects";

import { type NextApiRequest, type NextApiResponse } from "next";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { env } from "@/src/env.mjs";
import { authenticate } from "@/src/features/apiKey/authenticator";
import { authorize } from "@/src/features/auth/policy/authorize";
import {
  diffResults,
  legacyFromStatus,
  recordCoverage,
  type NewResult,
} from "@/src/features/auth/policy/shadow";

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

  // Route the project:read decision through the policy core. Legacy skips the
  // pipeline; shadow records parity without changing behavior; enforce gates.
  if (env.API_AUTH_MIGRATION !== "legacy") {
    const authz = await authorizeOrgProjectsRead(req.headers);
    if (env.API_AUTH_MIGRATION === "shadow") {
      recordCoverage("List Projects");
      diffResults(authz, legacyFromStatus(200), {
        seam: "org_route",
        action: "project:read",
      });
    }
    if (env.API_AUTH_MIGRATION === "enforce" && !authz.success) {
      return res.status(403).json({
        error:
          "Invalid API key. Organization-scoped API key required for this operation.",
      });
    }
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
    return handleGetProjects(req, res, authCheck.scope.orgId);
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

/** authorizeOrgProjectsRead resolves the request's context and checks project:read across the org's projects (vacuously allowing an org with none). */
async function authorizeOrgProjectsRead(
  headers: IncomingHttpHeaders,
): Promise<NewResult> {
  const authn = await authenticate({ headers });
  if (!authn.success) {
    return { success: false, error: { httpCode: authn.error.httpCode } };
  }
  const context = authn.context;
  const orgProjectIds =
    context.principal.kind === "apiKey"
      ? context.principal.organizations.flatMap((o) => o.projectIds)
      : [];
  const allowed =
    orgProjectIds.length === 0 ||
    orgProjectIds.some(
      (projectId) => authorize(context, "project:read", { projectId }).success,
    );
  return allowed
    ? { success: true }
    : { success: false, error: { httpCode: 403 } };
}
