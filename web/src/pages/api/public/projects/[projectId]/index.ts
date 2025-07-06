import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import {
  handleUpdateProject,
  handleDeleteProject,
} from "@/src/ee/features/admin-api/server/projects/projectById";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { type NextApiRequest, type NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  const { projectId } = req.query;

  if (typeof projectId !== "string") {
    return res.status(400).json({ message: "Invalid project ID" });
  }

  if (req.method !== "DELETE" && req.method !== "PUT") {
    logger.error(
      `Method not allowed for ${req.method} on /api/public/projects/${projectId}`,
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
  // END CHECK AUTH

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

  // Check if project exists and belongs to the organization
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      orgId: authCheck.scope.orgId,
    },
  });

  if (!project) {
    return res.status(404).json({
      message: "Project not found or you don't have access to it",
    });
  }

  // Route to the appropriate handler based on HTTP method
  if (req.method === "PUT") {
    return handleUpdateProject(req, res, projectId, authCheck.scope);
  }

  if (req.method === "DELETE") {
    return handleDeleteProject(req, res, projectId, authCheck.scope);
  }
}
