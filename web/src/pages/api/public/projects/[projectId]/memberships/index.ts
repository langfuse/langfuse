import { type NextApiRequest, type NextApiResponse } from "next";

import {
  handleDeleteMembership,
  handleGetMemberships,
  handleUpdateMembership,
} from "@/src/ee/features/admin-api/server/projects/projectById/memberships";
import { authenticator } from "@/src/features/apiKey/server";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server";
import { shadowAuth, writeOrgError } from "@/src/features/public-api/server";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { BaseError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";

/** handler serves project memberships for authenticated API keys. */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (!["GET", "PUT", "DELETE"].includes(req.method || "")) {
    logger.error(
      `Method not allowed for ${req.method} on /api/public/projects/[projectId]/memberships`,
    );
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const { projectId } = req.query;
  if (!projectId || typeof projectId !== "string") {
    return res.status(400).json({
      error: "projectId is required",
    });
  }

  // CHECK AUTH
  const authCheck = await shadowAuth({
    req,
    action: req.method === "GET" ? "projectMembers:read" : "projectMembers:CUD",
    allowedAccessLevels: ["organization"],
  });
  if (!authCheck.success) {
    return writeOrgError(res, authCheck.error);
  }
  // END CHECK AUTH

  // Check if organization has the rbac-project-roles entitlement
  if (
    !hasEntitlementBasedOnPlan({
      plan: authCheck.scope.plan,
      entitlement: "rbac-project-roles",
    })
  ) {
    return res.status(403).json({
      error: "Your plan does not include project role management.",
    });
  }

  // Check for admin-api entitlement
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

  // Verify the project belongs to the organization
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      orgId: authCheck.scope.orgId,
      deletedAt: null,
    },
  });

  if (!project) {
    return res.status(404).json({
      error: "Project not found or does not belong to this organization",
    });
  }

  // Route to the appropriate handler based on HTTP method
  try {
    if (req.method === "GET") {
      return await handleGetMemberships(
        req,
        res,
        projectId,
        authCheck.scope.orgId,
      );
    }
    const authentication = await authenticateMembershipMutation(
      req,
      authCheck.ctx,
    );
    if (!authentication.success)
      return writeOrgError(res, authentication.error);
    const context = authentication.context;
    switch (req.method) {
      case "PUT":
        return await handleUpdateMembership(
          req,
          res,
          projectId,
          authCheck.scope.orgId,
          authCheck.scope.apiKeyId,
          context,
        );
      case "DELETE":
        return await handleDeleteMembership(
          req,
          res,
          projectId,
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
      `Error handling project memberships for ${req.method} on project ${projectId}`,
      error,
    );
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}

/** authenticateMembershipMutation reuses the route context when available. */
async function authenticateMembershipMutation(
  req: NextApiRequest,
  context: AuthorizationContext | undefined,
) {
  if (context) return { success: true as const, context };
  return authenticator.authenticate({ headers: req.headers });
}
