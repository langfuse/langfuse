import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { handleCreateProject } from "@/src/ee/features/admin-api/server/projects/createProject";
import { type NextApiRequest, type NextApiResponse } from "next";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import {
  verifyOrgAuth,
  verifyProjectAuthDirect,
} from "@/src/features/auth/policy/shadow.direct";

/** projectKeyRequired is the 403 body when the project-scoped GET receives a non-project key. */
const projectKeyRequired =
  "Invalid API key. Are you using an organization key?";

/** orgKeyRequired is the 403 body when the organization-scoped POST receives a non-organization key. */
const orgKeyRequired =
  "Invalid API key. Organization-scoped API key required for this operation.";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (req.method !== "GET" && req.method !== "POST") {
    logger.error(
      `Method not allowed for ${req.method} on /api/public/projects`,
    );
    return res.status(405).json({ message: "Method not allowed" });
  }

  if (req.method === "GET") {
    const authCheck = await verifyProjectAuthDirect({
      req,
      name: "Get Project",
      action: "project:read",
      scopeDeniedMessage: projectKeyRequired,
    });
    if (!authCheck.validKey) {
      return res.status(authCheck.status).json({
        message: authCheck.error,
      });
    }
    const projectId = authCheck.scope.projectId;
    if (!projectId) {
      return res.status(403).json({ message: projectKeyRequired });
    }

    try {
      // Do not apply rate limits as it can break applications on lower tier plans when using auth_check in prod

      const projects = await prisma.project.findMany({
        select: {
          id: true,
          name: true,
          retentionDays: true,
          metadata: true,
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        where: {
          id: projectId,
          deletedAt: null,
        },
      });

      return res.status(200).json({
        data: projects.map((project) => ({
          id: project.id,
          name: project.name,
          organization: {
            id: project.organization.id,
            name: project.organization.name,
          },
          metadata: project.metadata ?? {},
          ...(project.retentionDays // Do not add if null or 0
            ? { retentionDays: project.retentionDays }
            : {}),
        })),
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  if (req.method === "POST") {
    const authCheck = await verifyOrgAuth({
      req,
      name: "Create Project",
      action: "projects:read",
      scopeDeniedMessage: orgKeyRequired,
    });
    if (!authCheck.validKey) {
      return res.status(authCheck.status).json({
        message: authCheck.error,
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

    return handleCreateProject(req, res, authCheck.scope);
  }
}
