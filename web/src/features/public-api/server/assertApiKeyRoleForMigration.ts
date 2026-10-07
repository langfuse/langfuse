import { InvalidRequestError } from "@langfuse/shared";
import { isLegacyApiKeyRole } from "@langfuse/shared/rbac";
import { type SystemRole } from "@langfuse/shared/src/db";

import { env } from "@/src/env.mjs";

/** assertApiKeyRoleForMigration rejects a role the active migration mode will not honor. */
export function assertApiKeyRoleForMigration(role: SystemRole): void {
  const enforce = env.API_AUTH_MIGRATION === "enforce";
  if (enforce && isLegacyApiKeyRole(role)) {
    throw new InvalidRequestError(
      `Legacy role ${role} cannot be assigned to a new API key`,
    );
  }
  if (!enforce && !isLegacyApiKeyRole(role)) {
    throw new InvalidRequestError(
      `Role ${role} cannot be assigned until API key authorization is enforced`,
    );
  }
}
