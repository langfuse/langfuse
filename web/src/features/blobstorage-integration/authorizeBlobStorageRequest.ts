import { type NextApiRequest } from "next";

import { ForbiddenError, UnauthorizedError } from "@langfuse/shared";
import { type ApiAccessScope } from "@langfuse/shared/src/server";

import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { shadowAuth } from "@/src/features/public-api/server/shadowAuth";
import { ErrorOrgApiKeyRequired } from "@/src/features/public-api/server/writeError";

/** authorizeBlobStorageRequest gates a blob-storage request on an organization key and the blob-export entitlement, returning the verified scope. */
export async function authorizeBlobStorageRequest(
  req: NextApiRequest,
): Promise<ApiAccessScope> {
  const authCheck = await shadowAuth({
    req,
    action: "projects:read",
    allowedAccessLevels: ["organization"],
  });
  if (!authCheck.success) {
    if (authCheck.error.httpCode === 401) {
      throw new UnauthorizedError(authCheck.error.message);
    }
    throw new ForbiddenError(ErrorOrgApiKeyRequired);
  }
  if (
    !hasEntitlementBasedOnPlan({
      plan: authCheck.scope.plan,
      entitlement: "scheduled-blob-exports",
    })
  ) {
    throw new ForbiddenError(
      "scheduled-blob-exports entitlement required for this feature.",
    );
  }
  return authCheck.scope;
}
