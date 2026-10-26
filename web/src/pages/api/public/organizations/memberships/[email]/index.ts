import { shadowAuth, writeOrgError } from "@/src/features/public-api/server";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { logger } from "@langfuse/shared/src/server";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { handleGetUserProjects } from "@/src/ee/features/admin-api/server/users/userProjects";

import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (req.method !== "GET") {
    logger.error(
      `Method not allowed for ${req.method} on /api/public/organizations/memberships/[email]`,
    );
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  // CHECK AUTH
  const authCheck = await shadowAuth({
    req,
    action: "organizationMembers:read",
    allowedAccessLevels: ["organization"],
  });
  if (!authCheck.success) {
    return writeOrgError(res, authCheck.error);
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

  const rateLimitCheck = await RateLimitService.getInstance().rateLimitRequest(
    authCheck.scope,
    "public-api",
  );
  if (rateLimitCheck?.isRateLimited()) {
    return rateLimitCheck.sendRestResponseIfLimited(res);
  }

  const validatedEmail = z.email().safeParse(req.query.email);
  if (!validatedEmail.success) {
    return res.status(400).json({
      error: "Invalid email",
    });
  }

  try {
    return await handleGetUserProjects(
      req,
      res,
      authCheck.scope.orgId,
      validatedEmail.data,
    );
  } catch (error) {
    logger.error("Error handling organization membership user projects", error);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}
