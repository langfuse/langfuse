import { type NextApiRequest, type NextApiResponse } from "next";
import { hasEntitlementBasedOnPlan } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { shadowAuth } from "@/src/features/public-api/server/shadowAuth";
import { writeScimError } from "@/src/features/public-api/server/writeError";

// Gate for the SCIM 2.0 Groups endpoints: authentication and the entitlement check live here,
// the implementation they unlock lives in web/src/ee/features/scim/server.

const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";

export type ScimActor = { apiKeyId: string; orgId: string };

export function writeScimErrorResponse(
  res: NextApiResponse,
  status: number,
  detail: string,
  scimType?: string,
) {
  return res.status(status).json({
    schemas: [SCIM_ERROR_SCHEMA],
    detail,
    status,
    ...(scimType ? { scimType } : {}),
  });
}

/** Returns null when an error response has already been written. */
export async function authorizeScimGroupsRequest(
  req: NextApiRequest,
  res: NextApiResponse,
  { route, methods }: { route: string; methods: readonly string[] },
): Promise<ScimActor | null> {
  await runMiddleware(req, res, cors);

  if (!methods.includes(req.method ?? "")) {
    logger.error(`[SCIM] Method not allowed for ${req.method} on ${route}`);
    writeScimErrorResponse(res, 405, "Method not allowed");
    return null;
  }

  const authCheck = await shadowAuth({
    req,
    action: req.method === "GET" ? "groups:read" : "groups:CUD",
    allowedAccessLevels: ["organization"],
  });
  if (!authCheck.success) {
    writeScimError(res, authCheck.error);
    return null;
  }

  if (
    !hasEntitlementBasedOnPlan({
      plan: authCheck.scope.plan,
      entitlement: "admin-api",
    })
  ) {
    writeScimErrorResponse(
      res,
      403,
      "This feature is not available on your current plan.",
    );
    return null;
  }

  return {
    orgId: authCheck.scope.orgId,
    apiKeyId: authCheck.scope.apiKeyId,
  };
}
