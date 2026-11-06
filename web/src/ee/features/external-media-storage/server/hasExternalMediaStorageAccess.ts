import { type Organization } from "@langfuse/shared/src/db";
import { parseDbOrg } from "@langfuse/shared";

import { env } from "@/src/env.mjs";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";

/**
 * External media storage requires the enterprise entitlement. On Langfuse
 * Cloud, organizations in the allowlist get it on any plan; self-hosted
 * deployments ignore the allowlist so it cannot stand in for a license.
 */
export function hasExternalMediaStorageAccess(organization: Organization) {
  const plan = getOrganizationPlanServerSide(
    parseDbOrg(organization).cloudConfig ?? undefined,
  );
  if (
    hasEntitlementBasedOnPlan({ plan, entitlement: "external-media-storage" })
  ) {
    return true;
  }

  return (
    Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) &&
    env.LANGFUSE_EXTERNAL_MEDIA_STORAGE_ORGANIZATION_ID_ALLOWLIST.includes(
      organization.id,
    )
  );
}
