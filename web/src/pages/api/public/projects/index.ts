import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { handleCreateProject } from "@/src/ee/features/admin-api/server/projects/createProject";
import { type NextApiRequest, type NextApiResponse } from "next";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";

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

  // CHECK AUTH
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(req.headers.authorization);
  if (!authCheck.validKey) {
    return res.status(401).json({
      message: authCheck.error,
    });
  }
  // END CHECK AUTH

  if (req.method === "GET") {
    if (
      authCheck.scope.accessLevel !== "project" ||
      !authCheck.scope.projectId
    ) {
      return res.status(403).json({
        message: "Invalid API key. Are you using an organization key?",
      });
    }

    try {
      // Do not apply rate limits as it can break applications on lower tier plans when using auth_check in prod

      const projects = await prisma.project.findMany({
        select: {
          id: true,
          name: true,
          retentionDays: true,
          metadata: true,
        },
        where: {
          id: authCheck.scope.projectId,
          // deletedAt: null, // here we want to include deleted projects and grey them in the UI.
        },
      });

      return res.status(200).json({
        data: projects.map((project) => ({
          id: project.id,
          name: project.name,
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
    // Check if using an organization API key
    if (
      authCheck.scope.accessLevel !== "organization" ||
      !authCheck.scope.orgId
    ) {
      return res.status(403).json({
        message:
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

    return handleCreateProject(req, res, authCheck.scope);
  }
}
