import { type NextApiRequest } from "next";

import { ForbiddenError, hasEntitlementBasedOnPlan } from "@langfuse/shared";
import { type ApiAccessScope } from "@langfuse/shared/src/server";

import { shadowAuth } from "@/src/features/public-api/server/shadowAuth";

/**
 * authorizeBlobStorageRequest gates a blob-storage request on an organization key and, unless
 * `requireEntitlement` is false, the blob-export entitlement, returning the verified scope.
 * Reads and deletes pass false so an organization that lost the entitlement can inspect and
 * remove its integrations.
 */
export async function authorizeBlobStorageRequest(
  req: NextApiRequest,
  { requireEntitlement = true }: { requireEntitlement?: boolean } = {},
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
    requireEntitlement &&
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
