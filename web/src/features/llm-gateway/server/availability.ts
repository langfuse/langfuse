import { ForbiddenError } from "@langfuse/shared";

import { env } from "@/src/env.mjs";

export const isGatewayEnabledForOrganization = (
  organizationId: string,
  allowedOrganizationIds = env.LANGFUSE_GATEWAY_ORGANIZATION_ID_ALLOWLIST ?? [],
): boolean => allowedOrganizationIds.includes(organizationId);

export const requireGatewayEnabledForOrganization = (
  organizationId: string,
  allowedOrganizationIds = env.LANGFUSE_GATEWAY_ORGANIZATION_ID_ALLOWLIST ?? [],
): void => {
  if (
    !isGatewayEnabledForOrganization(organizationId, allowedOrganizationIds)
  ) {
    throw new ForbiddenError(
      "LLM Gateway is not enabled for this organization",
    );
  }
};
