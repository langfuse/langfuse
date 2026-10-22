import { type NextApiRequest } from "next";

import { ForbiddenError } from "@langfuse/shared";
import { type ApiAccessScope } from "@langfuse/shared/src/server";

import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server";
import { shadowAuth } from "@/src/features/public-api/server";

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
    throw authCheck.error;
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
